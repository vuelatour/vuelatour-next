"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  linkMovimientoAction,
  sugerirLoteAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import {
  descripcionCandidatoGasto,
  diaMas,
  etiquetaCandidatoGasto,
  gastoDePropuesta,
  textoConfianza,
} from "@/lib/admin/conciliacion-auto";
import {
  textoGastoYaCubierto,
  toastVinculoGasto,
} from "@/lib/admin/conciliacion-parcial";
import { fmtDateOnly, todayCancun } from "@/lib/datetime";
import type { PropuestaConciliacion, SugerirLoteResponse } from "@/types/conciliacion";

const DIAS_DEFAULT = 30;

const fmtMoney = (monto: string | number) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });

export interface MovimientoMini {
  id: string;
  fecha: string;
  monto: string;
  tipo: string;
  descripcion: string | null;
  referencia: string | null;
}

interface SugerenciasLoteDialogProps {
  cuentas: { id: string; label: string }[];
  /** Movimientos de la vista: respaldo para pintar la fila si el API no
   *  embebió la ficha del movimiento en la propuesta. */
  movimientos: MovimientoMini[];
  cuentaId?: string;
  desde?: string;
  hasta?: string;
}

/**
 * «Sugerir con IA (pendientes)» (15-sep-2026).
 *
 * La IA PROPONE y una persona confirma: cada propuesta se vincula o se
 * descarta a mano. Nunca se liga sola — la fiabilidad numérica manda: un
 * cruce equivocado ensucia el dinero de un vuelo.
 */
export function SugerenciasLoteDialog({
  cuentas,
  movimientos,
  cuentaId,
  desde,
  hasta,
}: SugerenciasLoteDialogProps) {
  const router = useRouter();
  const hoy = todayCancun();
  const [open, setOpen] = useState(false);
  const [cuenta, setCuenta] = useState(cuentaId ?? "");
  const [ini, setIni] = useState(desde ?? diaMas(hoy, -DIAS_DEFAULT));
  const [fin, setFin] = useState(hasta ?? hoy);
  const [buscando, setBuscando] = useState(false);
  const [res, setRes] = useState<SugerirLoteResponse | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaConciliacion[]>([]);
  const [vinculadas, setVinculadas] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const porId = new Map(movimientos.map((m) => [m.id, m]));

  const abrir = () => {
    setRes(null);
    setPropuestas([]);
    setVinculadas([]);
    setCuenta(cuentaId ?? "");
    setIni(desde ?? diaMas(hoy, -DIAS_DEFAULT));
    setFin(hasta ?? hoy);
    setOpen(true);
  };

  const buscar = () => {
    if (ini && fin && ini > fin) {
      toast.error("La fecha «desde» no puede ser posterior a «hasta»");
      return;
    }
    setBuscando(true);
    setRes(null);
    setPropuestas([]);
    void (async () => {
      const r: ActionResult<SugerirLoteResponse> = await sugerirLoteAction({
        ...(cuenta ? { cuenta_bancaria_id: cuenta } : {}),
        ...(ini ? { desde: ini } : {}),
        ...(fin ? { hasta: fin } : {}),
      }).catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : "No se pudieron pedir las sugerencias",
      }));
      setBuscando(false);
      if (!r.ok || !r.data) {
        toast.error(r.error ?? "No se pudieron pedir las sugerencias", {
          description:
            r.status === 404
              ? "El servidor todavía no tiene las sugerencias en lote (falta desplegar el API)."
              : undefined,
        });
        return;
      }
      setRes(r.data);
      const lista = (r.data.propuestas ?? []).filter((p) => p.gasto_id_sugerido);
      setPropuestas(lista);
      if (lista.length === 0) {
        toast.info("La IA no encontró ninguna propuesta para los pendientes del rango", {
          description:
            r.data.disponible === false
              ? (r.data.nota ?? "El asistente no está configurado en el servidor.")
              : "Revísalos a mano: la columna «Conciliación» dice por qué quedó pendiente cada uno.",
        });
      }
    })();
  };

  const descartar = (movId: string) => {
    setPropuestas((prev) => prev.filter((p) => p.movimiento_id !== movId));
  };

  const vincular = (p: PropuestaConciliacion) => {
    if (!p.gasto_id_sugerido) return;
    startTransition(async () => {
      const r = await linkMovimientoAction(p.movimiento_id, p.gasto_id_sugerido!);
      if (r.ok) {
        const t = toastVinculoGasto(r.data);
        toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
        setVinculadas((v) => [...v, p.movimiento_id]);
        setPropuestas((prev) => prev.filter((x) => x.movimiento_id !== p.movimiento_id));
        router.refresh();
      } else if (r.code === "GASTO_YA_CUBIERTO") {
        const t = textoGastoYaCubierto(r.error, r.details);
        toast.error(t.titulo, { description: t.descripcion });
      } else {
        toast.error(r.error ?? "No se pudo vincular");
      }
    });
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={abrir}>
        <SparklesIcon className="h-4 w-4" />
        Sugerir con IA (pendientes)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sugerencias de la IA para los pendientes</DialogTitle>
            <DialogDescription>
              La IA lee la descripción del banco, la terminación de la tarjeta y
              los gastos cercanos, y PROPONE cuál corresponde. Nada se liga solo:
              revisa cada propuesta y pulsa «Vincular» o «Descartar».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-sm font-medium">Cuenta</Label>
                <SearchableSelect
                  options={[
                    { value: "", label: "Todas las cuentas" },
                    ...cuentas.map((c) => ({ value: c.id, label: c.label })),
                  ]}
                  value={cuenta}
                  onChange={setCuenta}
                  placeholder="Todas las cuentas"
                  disabled={buscando}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-lote-desde" className="text-sm font-medium">
                  Desde
                </Label>
                <Input
                  id="sug-lote-desde"
                  type="date"
                  value={ini}
                  onChange={(e) => setIni(e.target.value)}
                  disabled={buscando}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-lote-hasta" className="text-sm font-medium">
                  Hasta
                </Label>
                <Input
                  id="sug-lote-hasta"
                  type="date"
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  disabled={buscando}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Cada sugerencia consume créditos de IA (se registra en
                Configuración → Consumo de IA).
              </p>
              <Button type="button" size="sm" onClick={buscar} disabled={buscando || pending}>
                {buscando ? "Consultando…" : res ? "Volver a consultar" : "Buscar sugerencias"}
              </Button>
            </div>

            {res && (
              <p className="text-xs text-muted-foreground">
                {[
                  res.revisados != null ? `${res.revisados} pendientes revisados` : null,
                  `${propuestas.length} ${propuestas.length === 1 ? "propuesta" : "propuestas"} por revisar`,
                  vinculadas.length > 0 ? `${vinculadas.length} vinculadas` : null,
                  res.sin_propuesta ? `${res.sin_propuesta} sin propuesta` : null,
                  res.errores ? `${res.errores} con error` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            <div className="space-y-3">
              {propuestas.map((p) => {
                const mov = p.movimiento ?? porId.get(p.movimiento_id) ?? null;
                const gasto = gastoDePropuesta(p);
                const conf = textoConfianza(p.confianza);
                const desc = gasto ? descripcionCandidatoGasto(gasto) : null;
                return (
                  <div
                    key={p.movimiento_id}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {mov?.fecha ? fmtDateOnly(mov.fecha) : "—"} ·{" "}
                          <span className="tabular-nums">
                            ${mov?.monto != null ? fmtMoney(mov.monto) : "—"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[420px]">
                          {[mov?.descripcion, mov?.referencia].filter(Boolean).join(" · ") ||
                            "Movimiento del banco"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          conf.tono === "alta"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : conf.tono === "media"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : undefined
                        }
                      >
                        {conf.texto}
                      </Badge>
                    </div>

                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="text-sm">
                        {gasto ? etiquetaCandidatoGasto(gasto) : "Gasto propuesto"}
                      </p>
                      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                      {p.razon && (
                        <p className="text-xs text-muted-foreground mt-1">{p.razon}</p>
                      )}
                      {(p.evidencias?.length ?? 0) > 0 && (
                        <ul className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                          {p.evidencias!.map((e) => (
                            <li key={e}>· {e}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => descartar(p.movimiento_id)}
                        disabled={pending}
                      >
                        Descartar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => vincular(p)}
                        disabled={pending}
                      >
                        Vincular
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {res && propuestas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {vinculadas.length > 0
                  ? "No quedan propuestas por revisar."
                  : "La IA no propuso ningún gasto para los pendientes del rango."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
