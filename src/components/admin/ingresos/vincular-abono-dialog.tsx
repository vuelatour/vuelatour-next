"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  candidatosAbonoAction,
  ligarAbonoCobroAction,
  ligarAbonoCobrosAction,
  ligarAbonoIngresoAction,
} from "@/app/admin/ingresos/actions";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { fechasCandidatoCobro } from "@/lib/admin/ingresos-ui";
import {
  NOTA_VARIOS_COBROS,
  alternarSeleccion,
  botonVincularAbono,
  claveOpcion,
  coincideOpcion,
  esOpcionExclusiva,
  estadoLoteAbono,
  mensajeErrorVincularCobros,
  seleccionInicial,
  textoSumaLoteAbono,
  toastVinculoCobros,
  type OpcionAbono,
} from "@/lib/admin/conciliacion-cobros-lote";
import { cn } from "@/lib/utils";
import type { CandidatoCobro } from "@/types/conciliacion";
import type { AbonoPendiente, CandidatoIngresoAbono } from "@/types/ingresos";

/** Ventana ±días alrededor del abono (la de los candidatos manuales del API). */
const VENTANA_DIAS = 30;

const CLASE_TONO = {
  verde: "text-emerald-600 dark:text-emerald-400",
  ambar: "text-amber-700 dark:text-amber-300",
  rojo: "text-destructive",
  neutro: "text-muted-foreground",
} as const;

/**
 * «Vincular a un cobro o ingreso» de un ABONO (24-sep-2026): los candidatos
 * los arma el API (cobros de vuelo, sobres de grupo e INGRESOS registrados,
 * misma moneda, ±30 días, libres). ★ y verde = cuadra exacto. Un ingreso
 * registrado en OTRA cuenta se ve pero no se elige: primero se corrige su
 * cuenta (el API respondería 409 INGRESO_OTRA_CUENTA).
 *
 * 1 ABONO ↔ N COBROS (12-oct-2026, API 0.0.71): la lista lleva CASILLAS y
 * se marcan VARIOS cobros de vuelo cuando el cliente hizo un depósito por
 * varios vuelos (caso #379 + #380); un sobre de grupo o un ingreso van
 * solos. La suma de los netos contra el abono es GUÍA (el API valida con la
 * misma tolerancia). Los cobros que el abono YA paga llegan marcados.
 */
export function VincularAbonoDialog({
  abono,
  open,
  onOpenChange,
  onRegistrarCobro,
}: {
  abono: AbonoPendiente;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «¿No está el cobro? Regístralo» (12-oct-2026): abre el alta del cobro
   *  del vuelo desde este abono (antes era el renglón «Es el pago de un
   *  vuelo» del menú; el cliente lo pidió dentro de Vincular). */
  onRegistrarCobro?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular a un cobro o ingreso</DialogTitle>
          <DialogDescription>
            {`Abono de ${fmtMonto(abono.monto, abono.cuenta_moneda ?? undefined)} del ${fmtDateOnly(abono.fecha)}${
              abono.cuenta_alias ? ` en ${abono.cuenta_alias}` : ""
            }. Marca el cobro de vuelo (o varios, si el depósito pagó varios vuelos), el pago de grupo o el ingreso registrado al que corresponde.`}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Selector
            abono={abono}
            onCerrar={() => onOpenChange(false)}
            onRegistrarCobro={onRegistrarCobro}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const CLASE_EXACTO = "text-emerald-600 dark:text-emerald-400 font-medium";

function etiquetaOpcion(o: OpcionAbono): string {
  const exacto = o.c.dif_monto === 0;
  const estrella = exacto ? "★ " : "";
  if (o.tipo === "INGRESO") {
    const i = o.c;
    return `${estrella}${i.etiqueta} · ${i.categoria_etiqueta} · ${fmtMonto(i.monto, i.moneda)}`;
  }
  const c = o.c;
  const metodo = metodoPagoLabel(c.metodo_cobro);
  return c.tipo === "SOBRE_GRUPO"
    ? `${estrella}Grupo ${folioTexto(c.grupo_folio)} · ${fmtMonto(c.monto, c.moneda)} · ${metodo}`
    : `${estrella}Vuelo #${c.folio ?? "—"} · ${fmtMonto(c.monto, c.moneda)} · ${metodo}`;
}

function descripcionOpcion(o: OpcionAbono): { texto: string; clase?: string; bloqueada: boolean } {
  const exacto = o.c.dif_monto === 0;
  if (o.tipo === "INGRESO") {
    const i = o.c;
    if (i.otra_cuenta) {
      return {
        texto: `Registrado en otra cuenta (${i.cuenta_alias ?? "otra"}): corrige la cuenta del ingreso`,
        clase: "text-amber-600 dark:text-amber-400",
        bloqueada: true,
      };
    }
    return {
      texto: [
        i.cliente,
        fmtDateOnly(i.fecha),
        i.comision_monto ? `neto ${fmtMonto(i.neto, i.moneda)}` : null,
        exacto ? "cuadra exacto con el abono" : `diferencia ${fmtMonto(i.dif_monto)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      clase: exacto ? CLASE_EXACTO : undefined,
      bloqueada: false,
    };
  }
  const c = o.c;
  return {
    texto: [
      c.tipo === "SOBRE_GRUPO" ? c.grupo_nombre : null,
      c.cliente,
      fechasCandidatoCobro(c),
      c.neto !== c.monto ? `neto ${fmtMonto(c.neto)}` : null,
      exacto ? "cuadra exacto con el abono" : `diferencia ${fmtMonto(c.dif_monto)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    clase: exacto ? CLASE_EXACTO : undefined,
    bloqueada: false,
  };
}

function Selector({
  abono,
  onCerrar,
  onRegistrarCobro,
}: {
  abono: AbonoPendiente;
  onCerrar: () => void;
  onRegistrarCobro?: () => void;
}) {
  const router = useRouter();
  const idBuscar = useId();
  const [opciones, setOpciones] = useState<OpcionAbono[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  // El abono ya paga VARIOS cobros (se está editando el lote): toda liga
  // de cobros viaja como `cobro_ids`, también con uno.
  const [conLote, setConLote] = useState(false);
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
        const cobros: OpcionAbono[] = (r.data.candidatos ?? []).map((c: CandidatoCobro) => ({ tipo: "COBRO", c }));
        const ingresos: OpcionAbono[] = (r.data.ingresos ?? []).map((c: CandidatoIngresoAbono) => ({
          tipo: "INGRESO",
          c,
        }));
        // Exactos primero (★), luego por diferencia.
        const lista = [...cobros, ...ingresos].sort((a, b) => a.c.dif_monto - b.c.dif_monto);
        setOpciones(lista);
        // Los cobros que el abono YA paga (editar un lote) llegan marcados.
        setSel(seleccionInicial(r.data.movimiento.cobro_ids, lista));
        setConLote((r.data.movimiento.cobros_n ?? 0) >= 2);
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

  const porClave = useMemo(() => new Map((opciones ?? []).map((o) => [claveOpcion(o), o])), [opciones]);
  const marcadas = useMemo(
    () => sel.map((k) => porClave.get(k)).filter((o): o is OpcionAbono => !!o),
    [sel, porClave],
  );
  // Lo marcado se queda a la vista aunque no coincida con la búsqueda.
  const visibles = useMemo(
    () => (opciones ?? []).filter((o) => sel.includes(claveOpcion(o)) || coincideOpcion(o, texto)),
    [opciones, sel, texto],
  );
  const exactos = (opciones ?? []).filter((o) => o.c.dif_monto === 0).length;
  const hayExclusiva = marcadas.some(esOpcionExclusiva);
  const suma = hayExclusiva
    ? null
    : textoSumaLoteAbono(
        estadoLoteAbono({
          montoAbono: abono.monto,
          monedaCuenta: abono.cuenta_moneda,
          cobros: marcadas
            .filter((o): o is Extract<OpcionAbono, { tipo: "COBRO" }> => o.tipo === "COBRO")
            .map((o) => o.c),
        }),
      );

  const alternar = (o: OpcionAbono) => {
    const r = alternarSeleccion(sel, o, opciones ?? []);
    setSel(r.seleccion);
    if (r.aviso) toast.info(r.aviso);
  };

  const vincular = async () => {
    if (marcadas.length === 0) {
      toast.error("Marca un cobro, un pago de grupo o un ingreso.");
      return;
    }
    setLigando(true);
    setError(null);
    const unica = marcadas.length === 1 ? marcadas[0] : null;
    let r;
    if (unica && unica.tipo === "INGRESO") {
      r = await ligarAbonoIngresoAction(abono.id, unica.c.id);
    } else if (unica && unica.tipo === "COBRO" && unica.c.tipo === "SOBRE_GRUPO") {
      r = await ligarAbonoCobroAction(abono.id, { cobro_grupo_id: unica.c.cobro_grupo_id });
    } else if (unica && unica.tipo === "COBRO" && unica.c.tipo === "COBRO_VUELO" && !conLote) {
      // UN cobro sin lote previo: la liga de siempre (también con un API previo).
      r = await ligarAbonoCobroAction(abono.id, { cobro_id: unica.c.cobro_id });
    } else {
      r = await ligarAbonoCobrosAction(
        abono.id,
        marcadas
          .filter((o): o is Extract<OpcionAbono, { tipo: "COBRO" }> => o.tipo === "COBRO")
          .map((o) => o.c.id),
      );
    }
    setLigando(false);
    if (r.ok) {
      toast.success(toastVinculoCobros(marcadas));
      router.refresh();
      onCerrar();
      return;
    }
    const e = mensajeErrorVincularCobros(r);
    setError(e.titulo);
    toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
    if (e.recargar) {
      // Ocupado por otra persona o el abono cambió: la lista se vuelve a pedir.
      setSel([]);
      setOpciones(null);
      setRecarga((n) => n + 1);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label htmlFor={idBuscar} className="text-sm font-medium">
            Cobros, pagos de grupo e ingresos candidatos
          </Label>
          {exactos > 0 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              {exactos === 1
                ? "1 cuadra exacto con el abono (★, aparece primero)"
                : `${exactos} cuadran exacto con el abono (★, aparecen primero)`}
            </span>
          )}
        </div>
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
          <>
            <Input
              id={idBuscar}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Busca por folio, ING-n, cliente o monto"
              autoComplete="off"
            />
            <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {visibles.map((o) => {
                const clave = claveOpcion(o);
                const marcada = sel.includes(clave);
                const desc = descripcionOpcion(o);
                return (
                  <label
                    key={clave}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-sm",
                      desc.bloqueada ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                    )}
                    title={desc.bloqueada ? desc.texto : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={desc.bloqueada || ligando}
                      onChange={() => alternar(o)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{etiquetaOpcion(o)}</span>
                      {desc.texto && (
                        <span className={cn("block truncate text-xs text-muted-foreground", desc.clase)}>
                          {desc.texto}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {visibles.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {texto.trim()
                    ? "Ningún candidato coincide con la búsqueda."
                    : "Sin cobros ni ingresos candidatos cerca de la fecha del abono"}
                </p>
              )}
            </div>
            {suma && <p className={cn("text-xs font-medium", CLASE_TONO[suma.tono])}>{suma.texto}</p>}
            {marcadas.length === 1 && marcadas[0].tipo === "INGRESO" && marcadas[0].c.es_anticipo && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{marcadas[0].c.etiqueta}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Es un anticipo: al conciliarlo, sus cobros aplicados a vuelos quedan conciliados vía el anticipo.
                </p>
              </div>
            )}
          </>
        )}
        <p className="text-[11px] text-muted-foreground">{NOTA_VARIOS_COBROS}</p>
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
      <DialogFooter className="sm:justify-between">
        {onRegistrarCobro ? (
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer"
            disabled={ligando}
            title="El cobro del vuelo todavía no está capturado: regístralo y queda conciliado con este abono en un solo paso"
            onClick={() => {
              onCerrar();
              onRegistrarCobro();
            }}
          >
            ¿No está el cobro? Regístralo
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={ligando}>
            Cancelar
          </Button>
          <Button onClick={() => void vincular()} disabled={ligando || marcadas.length === 0}>
            {ligando ? "Vinculando…" : botonVincularAbono(marcadas)}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
