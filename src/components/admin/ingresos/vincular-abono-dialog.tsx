"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  candidatosAbonoAction,
  ligarAbonoCobroAction,
  ligarAbonoCobrosAction,
  ligarAbonoIngresoAction,
  type ActionResult,
} from "@/app/admin/ingresos/actions";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { fechasCandidatoCobro } from "@/lib/admin/ingresos-ui";
import { MSG_SIN_CONEXION } from "@/lib/admin/conciliacion-lote";
import {
  accionToastVinculo,
  alternarSeleccion,
  botonVincularAbono,
  claveDeCobroVuelo,
  claveOpcion,
  coincideOpcion,
  esOpcionExclusiva,
  estadoLoteAbono,
  guiaAlVincular,
  lineaCortaAlVincular,
  mensajeErrorVincularCobros,
  notaVariosCobros,
  pasoAlPulsarVincular,
  seleccionInicial,
  textoConfirmarCorregirComision,
  textoConfirmarParcial,
  textoCuadraExactoCandidato,
  textoSumaLoteAbono,
  textoYaConciliadoCandidato,
  toastVinculoCobros,
  type AccionGuiaAlVincular,
  type GuiaAlVincular,
  type OpcionAbono,
  type TextoConfirmacion,
} from "@/lib/admin/conciliacion-cobros-lote";
import { cn } from "@/lib/utils";
import type { CandidatoCobro, MovimientoBancario } from "@/types/conciliacion";
import type { AbonoPendiente, CandidatoIngresoAbono } from "@/types/ingresos";

/** Ventana ±días alrededor del abono (la de los candidatos manuales del API). */
const VENTANA_DIAS = 30;

/** La server action ni siquiera respondió (sin red, un deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

/** Lo que el API sabe hacer (capacidades de `candidatos-cobro`, API 0.0.78; ausentes = API previo). */
interface Capacidades {
  corregirComision: boolean;
  cobrosParciales: boolean;
}
const SIN_CAPACIDADES: Capacidades = { corregirComision: false, cobrosParciales: false };

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
 *
 * UN COBRO, VARIOS ABONOS (14-oct-2026, API 0.0.78, invariante 77): con UN
 * cobro marcado manda el veredicto del API para ESTE abono (`al_vincular`,
 * `guiaAlVincular`): PARCIAL ⇒ «Vincular como parcial…» con confirmación;
 * EXCEDE, COMISION_NO_CUADRA y los demás rechazos APAGAN el botón con la
 * razón a la vista y salidas de un clic («Agregar el cobro del vuelo #332»,
 * «Buscar $977.45», «Corregir la comisión a $X y vincular» —con su
 * confirmación y solo con la capacidad del API—). Con 2+ cobros la suma guía
 * va por lo que le FALTA a cada uno y nunca apaga el botón. Los candidatos se
 * vuelven a pedir al abrir y tras cualquier 409 (sin soltar lo marcado, salvo
 * que la lista haya cambiado). Si la comisión de un cobro cambió (o no se sabe
 * si la liga quedó), la página se pone al día UNA vez al cerrar.
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
  const router = useRouter();
  // Algo cambió en el servidor con el diálogo abierto (una liga, la comisión
  // de un cobro o una liga que no se pudo confirmar): `router.refresh()` UNA
  // vez al cerrar (las actions no repintan un diálogo abierto).
  const refrescarAlCerrarRef = useRef(false);
  const cambiarAbierto = (abierto: boolean) => {
    if (!abierto && refrescarAlCerrarRef.current) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    onOpenChange(abierto);
  };
  return (
    <Dialog open={open} onOpenChange={cambiarAbierto}>
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
            onCerrar={() => cambiarAbierto(false)}
            onRegistrarCobro={onRegistrarCobro}
            alCambiarDatos={() => {
              refrescarAlCerrarRef.current = true;
            }}
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
  // UN COBRO, VARIOS ABONOS (API 0.0.78): un cobro PARCIAL dice cuánto ya
  // tiene de otros abonos y cuánto le falta; «exacto» es contra lo que falta.
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
  const deVuelo = c.tipo === "COBRO_VUELO" ? c : null;
  return {
    texto: [
      c.tipo === "SOBRE_GRUPO" ? c.grupo_nombre : null,
      c.cliente,
      fechasCandidatoCobro(c),
      c.neto !== c.monto ? `neto ${fmtMonto(c.neto)}` : null,
      deVuelo ? textoYaConciliadoCandidato(deVuelo) : null,
      exacto ? textoCuadraExactoCandidato(deVuelo ?? {}) : `diferencia ${fmtMonto(c.dif_monto)}`,
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
  alCambiarDatos,
}: {
  abono: AbonoPendiente;
  onCerrar: () => void;
  onRegistrarCobro?: () => void;
  /** Algo cambió en el servidor (o no se sabe): el diálogo refresca la página al cerrar. */
  alCambiarDatos: () => void;
}) {
  const idBuscar = useId();
  const idGuia = useId();
  const buscarRef = useRef<HTMLInputElement | null>(null);
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
  // Capacidades del API (0.0.78): «Corregir la comisión y vincular» y si un
  // cobro ya acepta varios abonos (la nota bajo la lista).
  const [capacidades, setCapacidades] = useState<Capacidades>(SIN_CAPACIDADES);
  // Confirmaciones de dinero (AlertDialog): vincular como PARCIAL o corregir la comisión.
  const [confirmar, setConfirmar] = useState<"parcial" | "comision" | null>(null);
  // Tras un 409 la lista se vuelve a pedir SIN soltar lo marcado: lo que había (se poda a lo que siga en la lista).
  const conservarRef = useRef<string[] | null>(null);
  // Un doble clic (o el clic de la confirmación más el del botón) no liga dos veces.
  const enviandoRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    void candidatosAbonoAction(abono.id, VENTANA_DIAS)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok || !r.data) {
          conservarRef.current = null;
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
        const conservar = conservarRef.current;
        conservarRef.current = null;
        if (conservar) {
          // Tras un 409: lo marcado sigue marcado (si sigue en la lista).
          const claves = new Set(lista.map(claveOpcion));
          setSel(conservar.filter((k) => claves.has(k)));
        } else {
          // Los cobros que el abono YA paga (editar un lote) llegan marcados.
          setSel(seleccionInicial(r.data.movimiento.cobro_ids, lista));
        }
        setConLote((r.data.movimiento.cobros_n ?? 0) >= 2);
        setCapacidades({
          corregirComision: r.data.movimiento.corregir_comision === true,
          cobrosParciales: r.data.movimiento.cobros_parciales === true,
        });
      })
      .catch(() => {
        if (!vivo) return;
        conservarRef.current = null;
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
  // Los cobros de vuelo de la lista: un sugerido que no está no se ofrece.
  const idsEnLista = useMemo(
    () =>
      new Set(
        (opciones ?? []).flatMap((o) => (o.tipo === "COBRO" && o.c.tipo === "COBRO_VUELO" ? [o.c.cobro_id] : [])),
      ),
    [opciones],
  );
  const abonoGuia = { monto: abono.monto, moneda: abono.cuenta_moneda, fecha: abono.fecha };
  // UN cobro (o sobre) marcado: el veredicto del API para ESTE abono (API
  // 0.0.78). null ⇒ la suma de siempre (API previo, ingreso o sobre que cuadra).
  const marcadaUnica = marcadas.length === 1 ? marcadas[0] : null;
  const guia = marcadaUnica
    ? guiaAlVincular(marcadaUnica, abonoGuia, { corregirComision: capacidades.corregirComision, enLista: idsEnLista })
    : null;
  const suma =
    hayExclusiva || guia
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
  const confirmacionParcial = marcadaUnica ? textoConfirmarParcial(marcadaUnica, abonoGuia) : null;
  const confirmacionComision = marcadaUnica ? textoConfirmarCorregirComision(marcadaUnica, abonoGuia) : null;

  const alternar = (o: OpcionAbono) => {
    const r = alternarSeleccion(sel, o, opciones ?? []);
    setSel(r.seleccion);
    if (r.aviso) toast.info(r.aviso);
  };

  /** Pide otra vez los candidatos; `conservar` = sin soltar lo marcado. */
  const recargar = (conservar: boolean) => {
    conservarRef.current = conservar ? sel : null;
    if (!conservar) setSel([]);
    setOpciones(null);
    setRecarga((n) => n + 1);
  };

  /** Salidas de un clic de la guía (EXCEDE, COMISION_NO_CUADRA). */
  const aplicarAccion = (a: AccionGuiaAlVincular) => {
    if (a.tipo === "MARCAR_SUGERIDO" && a.cobro_id) {
      const o = porClave.get(claveDeCobroVuelo(a.cobro_id));
      if (o && !sel.includes(claveOpcion(o))) alternar(o);
      return;
    }
    if (a.tipo === "BUSCAR" && a.buscar) {
      setTexto(a.buscar);
      buscarRef.current?.focus();
      return;
    }
    if (a.tipo === "CORREGIR_COMISION" && confirmacionComision) setConfirmar("comision");
  };

  const vincular = () => {
    switch (pasoAlPulsarVincular(marcadas.length, guia)) {
      case "ELEGIR":
        toast.error("Marca un cobro, un pago de grupo o un ingreso.");
        return;
      case "BLOQUEADO":
        // El API rechazaría ESTE abono con ESTE cobro (el botón ya está apagado).
        return;
      case "CONFIRMAR_PARCIAL":
        // Un abono MENOR que lo que falta deja el cobro PARCIAL: se confirma
        // (es dinero) y el API no se llama hasta «Sí, vincular como parcial».
        if (confirmacionParcial) {
          setConfirmar("parcial");
          return;
        }
        void ligar();
        return;
      case "LIGAR":
        void ligar();
    }
  };

  const ligar = async (opcionesLiga?: { corregirComision?: boolean }) => {
    if (enviandoRef.current || marcadas.length === 0) return;
    enviandoRef.current = true;
    setLigando(true);
    setError(null);
    const enviadas = marcadas;
    const unica = enviadas.length === 1 ? enviadas[0] : null;
    const corregir = opcionesLiga?.corregirComision === true ? { corregirComision: true } : undefined;
    let r: ActionResult<MovimientoBancario>;
    if (unica && unica.tipo === "INGRESO") {
      r = await ligarAbonoIngresoAction(abono.id, unica.c.id).catch(sinConexion);
    } else if (unica && unica.tipo === "COBRO" && unica.c.tipo === "SOBRE_GRUPO") {
      r = await ligarAbonoCobroAction(abono.id, { cobro_grupo_id: unica.c.cobro_grupo_id }).catch(sinConexion);
    } else if (unica && unica.tipo === "COBRO" && unica.c.tipo === "COBRO_VUELO" && !conLote) {
      // UN cobro sin lote previo: la liga de siempre (también con un API previo);
      // `corregir_comision` solo viaja con «Corregir la comisión y vincular».
      r = await ligarAbonoCobroAction(abono.id, { cobro_id: unica.c.cobro_id }, corregir).catch(sinConexion);
    } else {
      r = await ligarAbonoCobrosAction(
        abono.id,
        enviadas
          .filter((o): o is Extract<OpcionAbono, { tipo: "COBRO" }> => o.tipo === "COBRO")
          .map((o) => o.c.id),
        corregir,
      ).catch(sinConexion);
    }
    enviandoRef.current = false;
    setLigando(false);
    if (r.ok) {
      const accion = accionToastVinculo(enviadas, r.data);
      toast.success(
        toastVinculoCobros(enviadas, r.data),
        accion
          ? { action: { label: accion.etiqueta, onClick: () => window.open(accion.href, "_blank", "noopener") } }
          : undefined,
      );
      // La liga quedó: la página se pone al día al cerrar (UNA vez).
      alCambiarDatos();
      onCerrar();
      return;
    }
    const e = mensajeErrorVincularCobros(r);
    setError(e.titulo);
    toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
    // La comisión del cobro YA cambió (la liga falló después) o no se sabe si
    // quedó ligado: la página se pone al día al cerrar.
    if (e.comisionCorregida || e.incierto) alCambiarDatos();
    if (e.recargar) {
      // Ocupado por otra persona o el abono cambió: la lista se vuelve a pedir.
      recargar(false);
    } else if (r.status === 409 || e.comisionCorregida) {
      // Nada se escribió (o solo la comisión) y los veredictos pudieron
      // cambiar: la lista se vuelve a pedir SIN soltar lo marcado.
      recargar(true);
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
              className="cursor-pointer"
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
              ref={buscarRef}
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
                // Qué pasaría con ESE cobro si se vincula este abono (API 0.0.78).
                const corta = lineaCortaAlVincular(o);
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
                      {corta && (
                        <span className={cn("block truncate text-xs font-medium", CLASE_TONO[corta.tono])}>
                          {corta.texto}
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
            {guia ? (
              // UN cobro marcado (API 0.0.78): el veredicto del API, su razón
              // A LA VISTA y las salidas de un clic.
              <GuiaVincularAbono guia={guia} id={idGuia} deshabilitada={ligando} onAccion={aplicarAccion} />
            ) : (
              suma && <p className={cn("text-xs font-medium", CLASE_TONO[suma.tono])}>{suma.texto}</p>
            )}
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
        <p className="text-[11px] text-muted-foreground">{notaVariosCobros(capacidades.cobrosParciales)}</p>
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
          <Button variant="outline" className="cursor-pointer" onClick={onCerrar} disabled={ligando}>
            Cancelar
          </Button>
          <BotonVincularConGuia
            etiqueta={ligando ? "Vinculando…" : botonVincularAbono(marcadas)}
            guia={guia}
            idGuia={idGuia}
            deshabilitado={ligando || marcadas.length === 0}
            onClick={vincular}
          />
        </div>
      </DialogFooter>

      {/* Vincular como PARCIAL (D3): cambia el estado del cobro, se confirma;
          «Cancelar» solo cierra (el API no se llama). */}
      <ConfirmacionVincular
        abierta={confirmar === "parcial"}
        texto={confirmacionParcial}
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => {
          setConfirmar(null);
          void ligar();
        }}
      />

      {/* «Corregir la comisión y vincular» (D6): escribe la comisión del cobro, se confirma. */}
      <ConfirmacionVincular
        abierta={confirmar === "comision"}
        texto={confirmacionComision}
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => {
          setConfirmar(null);
          void ligar({ corregirComision: true });
        }}
      />
    </>
  );
}

/**
 * La guía de UN cobro marcado (API 0.0.78): el texto del veredicto (con su
 * tono) y las salidas de un clic («Agregar el cobro del vuelo #332», «Buscar
 * $977.45», «Corregir la comisión a $X y vincular»). Presentacional.
 */
export function GuiaVincularAbono({
  guia,
  id,
  deshabilitada = false,
  onAccion,
}: {
  guia: GuiaAlVincular;
  id?: string;
  deshabilitada?: boolean;
  onAccion: (a: AccionGuiaAlVincular) => void;
}) {
  return (
    <div id={id} className="space-y-1.5" data-guia-al-vincular={guia.tono} aria-live="polite">
      <p className={cn("text-xs font-medium", CLASE_TONO[guia.tono])}>{guia.texto}</p>
      {guia.acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {guia.acciones.map((a) => (
            <Button
              key={`${a.tipo}:${a.cobro_id ?? a.buscar ?? a.comision ?? ""}`}
              type="button"
              size="sm"
              variant="outline"
              className="h-auto cursor-pointer whitespace-normal py-1 text-left text-xs"
              data-accion-guia={a.tipo}
              disabled={deshabilitada}
              onClick={() => onAccion(a)}
            >
              {a.etiqueta}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El botón principal del diálogo. EXCEPCIÓN deliberada a «nunca apagar el
 * botón» (D18): con UN cobro, si el API ya dijo que rechazaría ESTE abono
 * (`guia.bloquea`), se apaga con la razón en el `title` (el envoltorio lo
 * muestra: un botón apagado no recibe el puntero) y la guía a la vista
 * (`aria-describedby`). Con 2+ cobros no hay `guia` y nunca se apaga por la suma.
 */
export function BotonVincularConGuia({
  etiqueta,
  guia,
  idGuia,
  deshabilitado,
  onClick,
}: {
  etiqueta: string;
  guia: GuiaAlVincular | null;
  idGuia?: string;
  deshabilitado: boolean;
  onClick: () => void;
}) {
  const bloqueado = guia?.bloquea === true;
  return (
    <span className="inline-flex" title={bloqueado ? (guia?.razon ?? undefined) : undefined}>
      <Button
        className="cursor-pointer"
        onClick={onClick}
        disabled={deshabilitado || bloqueado}
        aria-describedby={guia && idGuia ? idGuia : undefined}
      >
        {etiqueta}
      </Button>
    </span>
  );
}

/**
 * Confirmación de dinero (AlertDialog): «¿Vincular como pago parcial?» o
 * «¿Corregir la comisión y vincular?» con los textos de
 * `textoConfirmarParcial` / `textoConfirmarCorregirComision` (y su aviso
 * ámbar). «Cancelar» SOLO cierra; únicamente la acción llama al API.
 */
export function ConfirmacionVincular({
  abierta,
  texto,
  onCancelar,
  onConfirmar,
}: {
  abierta: boolean;
  texto: TextoConfirmacion | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog open={abierta && texto !== null} onOpenChange={(o) => !o && onCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{texto?.titulo ?? ""}</AlertDialogTitle>
          <AlertDialogDescription>{texto?.cuerpo ?? ""}</AlertDialogDescription>
        </AlertDialogHeader>
        {texto?.aviso && (
          <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {texto.aviso}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
          >
            {texto?.boton ?? ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
