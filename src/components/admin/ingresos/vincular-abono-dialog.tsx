"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  candidatosAbonoAction,
  ligarAbonoCobroAction,
  ligarAbonoIngresoAction,
} from "@/app/admin/ingresos/actions";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtMonto } from "@/lib/format";
import { fmtDate, fmtDateOnly } from "@/lib/datetime";
import type { CandidatoCobro } from "@/types/conciliacion";
import type { AbonoPendiente, CandidatoIngresoAbono } from "@/types/ingresos";

/** Ventana ±días alrededor del abono (la de los candidatos manuales del API). */
const VENTANA_DIAS = 30;

type Opcion =
  | { tipo: "COBRO"; c: CandidatoCobro }
  | { tipo: "INGRESO"; c: CandidatoIngresoAbono };

const valorDe = (o: Opcion) => (o.tipo === "COBRO" ? `${o.c.tipo}:${o.c.id}` : `INGRESO:${o.c.id}`);
const CLASE_EXACTO = "truncate text-emerald-600 dark:text-emerald-400 font-medium";

/**
 * «Vincular a un cobro o ingreso» de un ABONO (24-sep-2026): los candidatos
 * los arma el API (cobros de vuelo, sobres de grupo e INGRESOS registrados,
 * misma moneda, ±30 días, libres). ★ y verde = cuadra exacto. Un ingreso
 * registrado en OTRA cuenta se ve pero no se elige: primero se corrige su
 * cuenta (el API respondería 409 INGRESO_OTRA_CUENTA).
 */
export function VincularAbonoDialog({
  abono,
  open,
  onOpenChange,
}: {
  abono: AbonoPendiente;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular a un cobro o ingreso</DialogTitle>
          <DialogDescription>
            {`Abono de ${fmtMonto(abono.monto, abono.cuenta_moneda ?? undefined)} del ${fmtDateOnly(abono.fecha)}${
              abono.cuenta_alias ? ` en ${abono.cuenta_alias}` : ""
            }. Elige el cobro de vuelo, el pago de grupo o el ingreso registrado al que corresponde.`}
          </DialogDescription>
        </DialogHeader>
        {open && <Selector abono={abono} onCerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Selector({ abono, onCerrar }: { abono: AbonoPendiente; onCerrar: () => void }) {
  const router = useRouter();
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [sel, setSel] = useState("");
  const [ligando, setLigando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Falla al LEER los candidatos: se dice y se ofrece reintentar. Jamás el
  // «Sin cobros ni ingresos candidatos» de una lista vacía cuando la consulta
  // falló (el operador creería que no hay nada y lo registraría como ingreso).
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    void candidatosAbonoAction(abono.id, VENTANA_DIAS)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok || !r.data) {
          setOpciones([]);
          setErrorCarga(r.error ?? "No se pudieron buscar los candidatos.");
          return;
        }
        setErrorCarga(null);
        const cobros: Opcion[] = (r.data.candidatos ?? []).map((c) => ({ tipo: "COBRO", c }));
        const ingresos: Opcion[] = (r.data.ingresos ?? []).map((c) => ({ tipo: "INGRESO", c }));
        // Exactos primero (★), luego por diferencia.
        setOpciones([...cobros, ...ingresos].sort((a, b) => a.c.dif_monto - b.c.dif_monto));
      })
      .catch(() => {
        if (!vivo) return;
        setOpciones([]);
        setErrorCarga("No se pudieron buscar los candidatos (sin conexión con el servidor).");
      });
    return () => {
      vivo = false;
    };
  }, [abono.id, recarga]);

  const items = useMemo(
    () =>
      (opciones ?? []).map((o) => {
        const exacto = o.c.dif_monto === 0;
        const estrella = exacto ? "★ " : "";
        if (o.tipo === "INGRESO") {
          const i = o.c;
          const desc = i.otra_cuenta
            ? `Registrado en otra cuenta (${i.cuenta_alias ?? "otra"}): corrige la cuenta del ingreso`
            : [
                i.cliente,
                fmtDateOnly(i.fecha),
                i.comision_monto ? `neto ${fmtMonto(i.neto, i.moneda)}` : null,
                exacto ? "cuadra exacto con el abono" : `diferencia ${fmtMonto(i.dif_monto)}`,
              ]
                .filter(Boolean)
                .join(" · ");
          return {
            value: valorDe(o),
            label: `${estrella}${i.etiqueta} · ${i.categoria_etiqueta} · ${fmtMonto(i.monto, i.moneda)}`,
            description: desc,
            descriptionClassName: i.otra_cuenta
              ? "truncate text-amber-600 dark:text-amber-400"
              : exacto
                ? CLASE_EXACTO
                : undefined,
            disabled: i.otra_cuenta,
          };
        }
        const c = o.c;
        const metodo = metodoPagoLabel(c.metodo_cobro);
        const label =
          c.tipo === "SOBRE_GRUPO"
            ? `${estrella}Grupo ${folioTexto(c.grupo_folio)} · ${fmtMonto(c.monto, c.moneda)} · ${metodo}`
            : `${estrella}Vuelo #${c.folio ?? "—"} · ${fmtMonto(c.monto, c.moneda)} · ${metodo}`;
        return {
          value: valorDe(o),
          label,
          description:
            [
              c.tipo === "SOBRE_GRUPO" ? c.grupo_nombre : null,
              c.cliente,
              fmtDate(c.fecha_cobro),
              c.neto !== c.monto ? `neto ${fmtMonto(c.neto)}` : null,
              exacto ? "cuadra exacto con el abono" : `diferencia ${fmtMonto(c.dif_monto)}`,
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          descriptionClassName: exacto ? CLASE_EXACTO : undefined,
        };
      }),
    [opciones],
  );

  const elegido = (opciones ?? []).find((o) => valorDe(o) === sel) ?? null;
  const exactos = (opciones ?? []).filter((o) => o.c.dif_monto === 0).length;

  const vincular = async () => {
    if (!elegido) {
      toast.error("Elige un cobro o un ingreso.");
      return;
    }
    setLigando(true);
    setError(null);
    const r =
      elegido.tipo === "INGRESO"
        ? await ligarAbonoIngresoAction(abono.id, elegido.c.id)
        : await ligarAbonoCobroAction(
            abono.id,
            elegido.c.tipo === "SOBRE_GRUPO"
              ? { cobro_grupo_id: elegido.c.cobro_grupo_id }
              : { cobro_id: elegido.c.cobro_id },
          );
    setLigando(false);
    if (r.ok) {
      toast.success(
        elegido.tipo === "INGRESO"
          ? `Abono conciliado con ${elegido.c.etiqueta}`
          : elegido.c.tipo === "SOBRE_GRUPO"
            ? `Abono conciliado con el pago del grupo ${folioTexto(elegido.c.grupo_folio)}`
            : `Abono conciliado con el cobro del vuelo #${elegido.c.folio ?? "—"}`,
      );
      router.refresh();
      onCerrar();
      return;
    }
    setError(r.error ?? "No se pudo vincular.");
    toast.error(r.error ?? "No se pudo vincular.");
  };

  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Cobro, pago de grupo o ingreso</Label>
        {errorCarga ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="flex items-start gap-2">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {errorCarga}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setErrorCarga(null);
                setOpciones(null);
                setRecarga((n) => n + 1);
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : opciones === null ? (
          <p className="text-sm text-muted-foreground">Buscando candidatos…</p>
        ) : (
          <SearchableSelect
            options={items}
            value={sel}
            onChange={setSel}
            placeholder="Busca por folio, ING-n, cliente o monto"
            emptyText="Sin cobros ni ingresos candidatos cerca de la fecha del abono"
          />
        )}
        {exactos > 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {exactos === 1
              ? "1 candidato cuadra exacto con el abono (★, aparece primero)."
              : `${exactos} candidatos cuadran exacto con el abono (★, aparecen primero).`}
          </p>
        )}
        {elegido && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {elegido.tipo === "INGRESO"
                  ? elegido.c.etiqueta
                  : elegido.c.tipo === "SOBRE_GRUPO"
                    ? `Grupo ${folioTexto(elegido.c.grupo_folio)}`
                    : `Vuelo #${elegido.c.folio ?? "—"}`}
              </Badge>
              {elegido.c.dif_monto === 0 ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  Cuadra exacto
                </Badge>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Diferencia {fmtMonto(elegido.c.dif_monto)} contra el abono
                </span>
              )}
            </div>
            {elegido.tipo === "INGRESO" && elegido.c.es_anticipo && (
              <p className="mt-1 text-xs text-muted-foreground">
                Es un anticipo: al conciliarlo, sus cobros aplicados a vuelos quedan conciliados vía el anticipo.
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Se muestran cobros de vuelo y pagos de grupo (transferencia, link de pago, cheque,
          BillPocket) e ingresos registrados, de la moneda de la cuenta y ±{VENTANA_DIAS} días. Los
          cobros que salieron de un anticipo no aparecen: se concilia el anticipo.
        </p>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={ligando}>
          Cancelar
        </Button>
        <Button onClick={() => void vincular()} disabled={ligando || !elegido}>
          {ligando ? "Vinculando…" : "Vincular"}
        </Button>
      </DialogFooter>
    </>
  );
}
