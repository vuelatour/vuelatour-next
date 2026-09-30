"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  candidatosReversoAction,
  emparejarReversoAction,
  type MovimientoParaReverso,
} from "@/app/admin/conciliacion/actions";
import { clasificarAbonoAction } from "@/app/admin/ingresos/actions";
import {
  ETIQUETA_REVERSO,
  ayudaClasificarSoloUno,
  candidatoPreseleccionado,
  candidatosIndistinguibles,
  coincidePista,
  descripcionDialogoReverso,
  esDescripcionDevolucion,
  mensajeErrorReverso,
  notaCandidatosReverso,
  pistaFechaDevolucion,
  textoClasificarSoloUno,
  textoIndistinguibles,
  textoSinCandidatosReverso,
  tituloDialogoReverso,
  toastEmparejado,
  type MensajeErrorReverso,
} from "@/lib/admin/conciliacion-reverso";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidatoReverso } from "@/types/conciliacion";

interface ReversoDialogProps {
  /** Movimiento de partida: un ABONO (se busca el cargo que devuelve) o un
   *  CARGO (se busca el abono con el que el banco lo devolvió). */
  movimiento: MovimientoParaReverso;
  /** Moneda de la cuenta, solo para pintar montos (opcional). */
  moneda?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Es la devolución de un cargo» / «Lo devolvió el banco» (30-sep-2026).
 *
 * Pregunta del cliente: «¿Cómo puedo conciliar los cargos reembolsados?».
 * Un cargo devuelto y su devolución se anulan: se concilian JUNTOS como
 * «Reverso de un cargo» (no son gasto ni ingreso). El diálogo enseña los
 * candidatos (fecha, descripción, referencia y monto) y empareja el elegido
 * en UNA operación del API. Una lectura fallida se DICE (jamás «no hay
 * candidatos»); sin candidatos queda el camino de siempre: clasificar solo
 * este movimiento.
 */
export function ReversoDialog({ movimiento, moneda, open, onOpenChange }: ReversoDialogProps) {
  const esAbono = movimiento.tipo === "ABONO";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tituloDialogoReverso(movimiento.tipo)}</DialogTitle>
          <DialogDescription>{descripcionDialogoReverso(movimiento, moneda)}</DialogDescription>
        </DialogHeader>
        {open && (
          <SelectorReverso
            movimiento={movimiento}
            moneda={moneda}
            esAbono={esAbono}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Carga = { candidatos: CandidatoReverso[] } | { error: MensajeErrorReverso };

function SelectorReverso({
  movimiento,
  moneda,
  esAbono,
  onCerrar,
}: {
  movimiento: MovimientoParaReverso;
  moneda?: string | null;
  esAbono: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [carga, setCarga] = useState<Carga | null>(null);
  const [elegido, setElegido] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [pending, start] = useTransition();

  const { id, tipo, cuenta_bancaria_id, fecha, monto, descripcion } = movimiento;
  useEffect(() => {
    let vivo = true;
    void candidatosReversoAction({ id, tipo, cuenta_bancaria_id, fecha, monto, descripcion })
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.data) {
          setCarga({ candidatos: r.data });
          return;
        }
        const e = mensajeErrorReverso(r);
        setCarga({ error: e });
        // Ya conciliado mientras tanto (409 MOVIMIENTO_YA_LIGADO): la fila de
        // atrás está vieja; se refresca para que el operador lo vea.
        if (e.recargar) router.refresh();
      })
      .catch(() => {
        if (!vivo) return;
        setCarga({
          error: {
            titulo: "No se pudieron buscar los candidatos (sin conexión con el servidor).",
            recargar: false,
            apiSinRuta: false,
          },
        });
      });
    return () => {
      vivo = false;
    };
  }, [id, tipo, cuenta_bancaria_id, fecha, monto, descripcion, recarga, router]);

  const candidatos = carga && "candidatos" in carga ? carga.candidatos : null;
  const errorCarga = carga && "error" in carga ? carga.error : null;
  // Preselección: el `sugerido` del API (el que elegiría «Emparejar
  // devoluciones») o el primero de la lista ya ordenada (la fecha que dice la
  // descripción / las devoluciones primero). Lo elegido a mano gana.
  const seleccion =
    candidatos && candidatos.some((c) => c.id === elegido)
      ? elegido
      : candidatos
        ? candidatoPreseleccionado(candidatos)
        : "";
  const seleccionado = candidatos?.find((c) => c.id === seleccion) ?? null;

  const pista = useMemo(() => pistaFechaDevolucion(descripcion), [descripcion]);
  const iguales = candidatos ? candidatosIndistinguibles(candidatos) : false;
  const sinCandidatos = candidatos !== null && candidatos.length === 0;
  const ofrecerSoloUno = sinCandidatos || errorCarga?.apiSinRuta === true;

  const emparejar = () => {
    if (!seleccionado) {
      toast.error(esAbono ? "Elige el cargo que devolvió el banco" : "Elige el abono de la devolución");
      return;
    }
    start(async () => {
      const abonoId = esAbono ? movimiento.id : seleccionado.id;
      const cargoId = esAbono ? seleccionado.id : movimiento.id;
      const fechaCargo = esAbono ? seleccionado.fecha : movimiento.fecha;
      const r = await emparejarReversoAction(abonoId, cargoId).catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : "No se pudo emparejar",
      }));
      if (r.ok) {
        const t = toastEmparejado(fechaCargo);
        toast.success(t.titulo, { description: t.descripcion });
        onCerrar();
        router.refresh();
        return;
      }
      const e = mensajeErrorReverso(r);
      toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
      if (e.apiSinRuta) {
        // Desde un CARGO la lista sale de la lectura de siempre (funciona con
        // el API previo o sin la migración) y es «Emparejar» el que choca: el
        // diálogo pasa al estado de error para ofrecer la salida de siempre
        // (clasificar solo este movimiento), no solo un toast.
        setCarga({ error: e });
        return;
      }
      if (e.recargar) {
        setCarga(null);
        setRecarga((n) => n + 1);
        router.refresh();
      }
    });
  };

  const clasificarSoloUno = () => {
    start(async () => {
      const r = await clasificarAbonoAction(movimiento.id, "REVERSO").catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : "No se pudo clasificar",
      }));
      if (r.ok) {
        toast.success(`Clasificado como «${ETIQUETA_REVERSO}»`, {
          description: "Solo este movimiento; ningún otro se tocó.",
        });
        onCerrar();
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo clasificar");
      }
    });
  };

  return (
    <>
      <div className="space-y-2">
        {carga === null ? (
          <p className="text-sm text-muted-foreground">
            {esAbono ? "Buscando el cargo que devolvió el banco…" : "Buscando la devolución…"}
          </p>
        ) : errorCarga ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-1">
            <p className="font-medium text-amber-700 dark:text-amber-300">{errorCarga.titulo}</p>
            {errorCarga.descripcion && (
              <p className="text-xs text-muted-foreground">{errorCarga.descripcion}</p>
            )}
            {!errorCarga.apiSinRuta && (
              <button
                type="button"
                className="cursor-pointer text-xs text-brand-600 underline underline-offset-2 hover:no-underline"
                onClick={() => {
                  setCarga(null);
                  setRecarga((n) => n + 1);
                }}
              >
                Reintentar
              </button>
            )}
          </div>
        ) : sinCandidatos ? (
          <p className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            {textoSinCandidatosReverso(movimiento.tipo, movimiento.monto, moneda)}
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label={esAbono ? "Cargos candidatos" : "Abonos candidatos"}
            className="max-h-72 space-y-1.5 overflow-y-auto pr-1"
          >
            {candidatos!.map((c) => {
              const activo = c.id === seleccion;
              const coincide = esAbono && coincidePista(pista, c.fecha);
              const devolucion = !esAbono && esDescripcionDevolucion(c.descripcion);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setElegido(c.id)}
                  className={cn(
                    "w-full cursor-pointer rounded-lg border p-2.5 text-left text-sm transition-colors",
                    activo
                      ? "border-brand-600 bg-brand-600/5 ring-1 ring-brand-600"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fmtDateOnly(c.fecha)}</span>
                    <span className="truncate text-muted-foreground">{c.descripcion ?? "—"}</span>
                    {coincide && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Coincide con la fecha de la descripción
                      </Badge>
                    )}
                    {devolucion && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Devolución
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[c.referencia ? `ref. ${c.referencia}` : null, fmtMonto(c.monto, moneda ?? null)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {iguales && candidatos && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {textoIndistinguibles(candidatos.length, movimiento.tipo)}
          </p>
        )}
        {carga !== null && !errorCarga && (
          <p className="text-[11px] text-muted-foreground">{notaCandidatosReverso(movimiento.tipo)}</p>
        )}
        {ofrecerSoloUno && (
          <p className="text-[11px] text-muted-foreground">{ayudaClasificarSoloUno(movimiento.tipo)}</p>
        )}
      </div>
      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={onCerrar} disabled={pending}>
          Cancelar
        </Button>
        {ofrecerSoloUno && (
          <Button variant="outline" onClick={clasificarSoloUno} disabled={pending}>
            {textoClasificarSoloUno(movimiento.tipo)}
          </Button>
        )}
        {!ofrecerSoloUno && (
          <Button onClick={emparejar} disabled={pending || !seleccionado}>
            {pending ? "Emparejando…" : "Emparejar"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
