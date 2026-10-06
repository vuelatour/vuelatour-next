"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  gastosCandidatosAction,
  linkMovimientoAction,
  linkMovimientoGastosAction,
  sugerirMovimientoAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import {
  descripcionCandidatoGasto,
  etiquetaCandidatoGasto,
  motivoPendienteDe,
  textoConfianza,
  tituloDescripcionCandidatoGasto,
} from "@/lib/admin/conciliacion-auto";
import {
  BOTON_CANCELAR,
  BOTON_REINTENTAR,
  BOTON_SUGERIR_IA,
  BOTON_VOLVER_A_BUSCAR,
  BUSCANDO_SUGERENCIA_IA,
  DEBOUNCE_BUSQUEDA_MS,
  ETIQUETA_LIGAS_EXCLUIDOS,
  ETIQUETA_SUGERENCIA_IA,
  ETIQUETA_SUGERIDO,
  LARGO_MAX_BUSQUEDA,
  MSG_ELIGE_UN_GASTO,
  MSG_SIN_CONEXION,
  MSG_TOPE_GASTOS_LOTE,
  MAX_GASTOS_LOTE,
  NOTA_IA_PROPONE,
  NOTA_VENTANA_CARGO,
  PLACEHOLDER_BUSCAR_GASTO,
  TEXTO_IA_NO_DISPONIBLE,
  TEXTO_VINCULANDO,
  TITULO_VINCULAR_GASTO,
  VENTANA_AMPLIADA_DIAS,
  VENTANA_CARGO_DIAS,
  bloqueoDeFila,
  botonVincularGastos,
  busquedaParaApi,
  busquedaParaMostrarNoBancarios,
  conSugeridoAlFrente,
  descripcionVincularGasto,
  esApiSinLote,
  estadoBuscadorGastos,
  estadoLoteCargo,
  etiquetaListaCandidatos,
  fichaCandidatoGasto,
  fichaSugerida,
  idsParaVincular,
  listaConMarcadosPrimero,
  marcadosTrasSugerencia,
  mensajeApiSinLote,
  mensajeErrorBusquedaGastos,
  mensajeErrorVincularGastos,
  opcionesRespaldoVincular,
  textoAmpliarVentana,
  textoErrorSugerencia,
  textoExcluidosCandidatos,
  textoIaSinPropuesta,
  textoMotivoPendienteDialogo,
  textoSugeridoSinMarcar,
  textoSumaLote,
  textoVetadosAlVincular,
  toastVinculoGastos,
  type AvisoExcluidos,
  type TonoSumaLote,
} from "@/lib/admin/conciliacion-lote";
import {
  AYUDA_INCLUIR_NO_BANCARIOS,
  AYUDA_JUSTIFICACION,
  BOTON_MOSTRAR_NO_BANCARIOS,
  ETIQUETA_INCLUIR_NO_BANCARIOS,
  JUSTIFICACION_MAX,
  MSG_FALTA_JUSTIFICACION,
  PLACEHOLDER_JUSTIFICACION,
  apiOfreceNoBancarios,
  conNotaJustificacion,
  esCandidatoNoBancario,
  estadoJustificacion,
  etiquetaJustificacion,
  etiquetaMedioNoBancario,
  hayNoBancariosMarcados,
  justificacionParaEnviar,
  marcadosConNoBancarios,
  marcadosSinNoBancarios,
  textoDesmarcadosNoBancarios,
  tituloBadgeCandidatoNoBancario,
  type TonoJustificacion,
} from "@/lib/admin/conciliacion-no-bancario";
import { cn } from "@/lib/utils";
import type {
  GastoCandidato,
  GastosCandidatosResponse,
  MovimientoBancario,
  SugerenciaConciliacion,
} from "@/types/conciliacion";

interface VincularGastoDialogProps {
  /** El CARGO del banco que se va a ligar (uno o varios gastos). */
  movimiento: MovimientoBancario;
  /** Lista precargada de la página: solo es el RESPALDO con un API previo. */
  gastos: SearchableSelectOption[];
  /** Abrir pidiendo la sugerencia de la IA («Sugerir con IA» del menú). */
  conIa?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Vincular gasto» de un CARGO (2-oct-2026, API 0.0.52): UNA lista con
 * casillas de los gastos candidatos del servidor (±30 días, buscador por
 * monto / proveedor / nota) para ligar el cargo con UNO o con VARIOS gastos
 * (los SPEI de SAESA pagan 2 o 3 facturas a la vez). La suma de lo marcado es
 * solo una GUÍA: quien acepta o rechaza es el API. Un API previo (sin la ruta
 * de candidatos) deja la lista precargada de siempre, un solo gasto.
 */
export function VincularGastoDialog({
  movimiento,
  gastos,
  conIa = false,
  open,
  onOpenChange,
}: VincularGastoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{TITULO_VINCULAR_GASTO}</DialogTitle>
          <DialogDescription>{descripcionVincularGasto(movimiento)}</DialogDescription>
        </DialogHeader>
        {open && (
          <SelectorGastos
            movimiento={movimiento}
            gastos={gastos}
            conIa={conIa}
            onCerrar={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * El vacío de la lista y, debajo, en ámbar, POR QUÉ no salen los gastos del
 * MISMO monto (6-oct-2026, caso real: tres gastos de $212.00 en EFECTIVO y la
 * oficina creyó que era un bug): una frase por motivo
 * (`textoExcluidosCandidatos`), las ligas de cada gasto en OTRA pestaña (el
 * diálogo se queda abierto) y «Volver a buscar» para repetir la búsqueda tras
 * corregir el gasto. La frase de los gastos en EFECTIVO lleva «Mostrar estos
 * gastos» (`a.mostrar`, 6-oct-2026): enciende el interruptor y los trae. Sin
 * avisos (API previo o nada que explicar) el marcado es IDÉNTICO al de antes
 * (lo congela el test).
 */
export function VacioCandidatos({
  texto,
  avisos,
  onVolverABuscar,
  onMostrarNoBancarios,
}: {
  texto: string;
  avisos: readonly AvisoExcluidos[];
  onVolverABuscar?: () => void;
  onMostrarNoBancarios?: (m: NonNullable<AvisoExcluidos["mostrar"]>) => void;
}) {
  const vacio = <p className="px-3 py-4 text-center text-xs text-muted-foreground">{texto}</p>;
  if (avisos.length === 0) return vacio;
  return (
    <>
      {vacio}
      <div className="space-y-2 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
        {avisos.map((a, i) => (
          <div key={`${a.motivo}-${i}`} className="space-y-0.5">
            <p>{a.texto}</p>
            {a.mostrar && onMostrarNoBancarios && (
              <BotonMostrarNoBancarios mostrar={a.mostrar} onMostrar={onMostrarNoBancarios} />
            )}
            {a.ligas.length > 0 && (
              <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                <span>{ETIQUETA_LIGAS_EXCLUIDOS}</span>
                {a.ligas.map((l) => (
                  <Link
                    key={l.key}
                    href={l.href}
                    target="_blank"
                    prefetch={false}
                    title={l.titulo}
                    className="text-brand-600 underline underline-offset-2 hover:no-underline"
                  >
                    {l.texto}
                  </Link>
                ))}
              </p>
            )}
          </div>
        ))}
        {onVolverABuscar && (
          <button
            type="button"
            className="cursor-pointer text-brand-600 underline underline-offset-2 hover:no-underline"
            onClick={onVolverABuscar}
          >
            {BOTON_VOLVER_A_BUSCAR}
          </button>
        )}
      </div>
    </>
  );
}

/** «Mostrar estos gastos»: enciende el interruptor con la ventana y el monto de esos gastos. */
function BotonMostrarNoBancarios({
  mostrar,
  onMostrar,
}: {
  mostrar: NonNullable<AvisoExcluidos["mostrar"]>;
  onMostrar: (m: NonNullable<AvisoExcluidos["mostrar"]>) => void;
}) {
  return (
    <button
      type="button"
      className="cursor-pointer font-medium text-brand-600 underline underline-offset-2 hover:no-underline"
      onClick={() => onMostrar(mostrar)}
    >
      {BOTON_MOSTRAR_NO_BANCARIOS}
    </button>
  );
}

/**
 * Interruptor «Incluir gastos en efectivo y otros medios» (6-oct-2026, API
 * 0.0.63): apagado por default; encendido, la lista trae también los gastos
 * en efectivo o con dinero personal (nunca bodega), después de los del banco.
 * Solo se monta cuando el API demostró que lo sabe hacer.
 */
export function InterruptorNoBancarios({
  activo,
  onCambiar,
  disabled = false,
}: {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs">
        <Switch size="sm" checked={activo} disabled={disabled} onCheckedChange={(c) => onCambiar(c)} />
        <span>{ETIQUETA_INCLUIR_NO_BANCARIOS}</span>
      </label>
      {activo && <p className="text-[11px] text-muted-foreground">{AYUDA_INCLUIR_NO_BANCARIOS}</p>}
    </div>
  );
}

/** Insignia del medio de un candidato que NO pasó por el banco («Efectivo»); nada con uno bancario o un API previo. */
export function BadgeMedioCandidato({ candidato }: { candidato: GastoCandidato }) {
  if (!esCandidatoNoBancario(candidato)) return null;
  return (
    <Badge
      variant="outline"
      className="h-4 shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
      title={tituloBadgeCandidatoNoBancario(candidato.medio_pago)}
    >
      {etiquetaMedioNoBancario(candidato.medio_pago)}
    </Badge>
  );
}

const CLASE_TONO_JUSTIFICACION: Record<TonoJustificacion, string> = {
  neutro: "text-muted-foreground",
  ambar: "text-amber-700 dark:text-amber-300",
  rojo: "text-destructive",
};

/**
 * «¿Por qué se vincula un gasto en efectivo a este cargo?» (obligatoria, 10 a
 * 300 caracteres): aparece al marcar un gasto que no pasó por el banco. La
 * razón queda anotada en el cargo y en el gasto; el medio de pago no cambia.
 */
export function CampoJustificacion({
  id,
  etiqueta,
  valor,
  onCambiar,
  disabled = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  disabled?: boolean;
}) {
  const estado = estadoJustificacion(valor);
  return (
    <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
      <Label htmlFor={id} className="text-xs leading-snug">
        {etiqueta}
      </Label>
      <Textarea
        id={id}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={PLACEHOLDER_JUSTIFICACION}
        maxLength={JUSTIFICACION_MAX}
        rows={2}
        required
        disabled={disabled}
        aria-describedby={`${id}-ayuda ${id}-estado`}
        className="min-h-14 bg-background text-sm"
      />
      <p id={`${id}-ayuda`} className="text-[11px] text-muted-foreground">
        {AYUDA_JUSTIFICACION}
      </p>
      <p id={`${id}-estado`} className={cn("text-[11px]", CLASE_TONO_JUSTIFICACION[estado.tono])}>
        {estado.texto}
      </p>
    </div>
  );
}

type Carga = { clave: string; r: ActionResult<GastosCandidatosResponse> };

type EstadoSugerencia =
  | { tipo: "nada" }
  | { tipo: "cargando" }
  | { tipo: "listo"; data: SugerenciaConciliacion };

const CLASE_TONO: Record<TonoSumaLote, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  ambar: "text-amber-600 dark:text-amber-400",
  rojo: "text-destructive",
  neutro: "text-muted-foreground",
};

const sinConexion = (err: unknown) => ({
  ok: false as const,
  error: err instanceof Error && err.message ? err.message : MSG_SIN_CONEXION,
});

function SelectorGastos({
  movimiento,
  gastos,
  conIa,
  onCerrar,
}: {
  movimiento: MovimientoBancario;
  gastos: SearchableSelectOption[];
  conIa: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const idBuscar = useId();
  const idJustificacion = useId();
  const [pending, start] = useTransition();

  // Buscador: lo tecleado y, 300 ms después, lo que viaja al servidor.
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dias, setDias] = useState(VENTANA_CARGO_DIAS);
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  // Moneda de la CUENTA del cargo: no cambia entre búsquedas, así que se
  // conserva mientras llega la siguiente (las casillas vetadas no parpadean).
  const [monedaCuenta, setMonedaCuenta] = useState<string | null>(null);
  // La misma moneda para los callbacks asíncronos (la IA contesta cuando
  // quiera): sin ella la preselección no conocía la cuenta (revisión 2-oct).
  const monedaRef = useRef<string | null>(null);
  // Turno del pedido: una respuesta vieja (búsqueda anterior) jamás pisa a
  // la nueva.
  const pedidoRef = useRef(0);
  // El API no sabe de lotes (respaldo: lista precargada, un solo gasto): el
  // aviso dice POR QUÉ (falta el API o falta la migración de la BD).
  const [avisoSinLote, setAvisoSinLote] = useState<string | null>(null);
  // Fichas MARCADAS, en el orden en que se marcaron (suben al principio
  // aunque no coincidan con la búsqueda).
  const [marcados, setMarcados] = useState<GastoCandidato[]>([]);
  // Respaldo: un solo gasto en el selector de siempre.
  const [seleccionUnica, setSeleccionUnica] = useState("");
  const [sug, setSug] = useState<EstadoSugerencia>(conIa ? { tipo: "cargando" } : { tipo: "nada" });
  // Gastos en EFECTIVO u otro medio no bancario (6-oct-2026, API 0.0.63): el
  // interruptor arranca APAGADO y solo aparece cuando el API demostró que lo
  // sabe hacer (`apiOfreceNoBancarios`, pegajoso). Vincular uno exige la
  // justificación (no cambia el medio de pago ni la caja del piloto).
  const [incluirNoBancarios, setIncluirNoBancarios] = useState(false);
  const [apiNoBancarios, setApiNoBancarios] = useState(false);
  const [textoJustificacion, setTextoJustificacion] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaParaApi(texto)), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const clave = `${dias}|${busqueda}|${recarga}|${incluirNoBancarios ? "nb" : ""}`;
  useEffect(() => {
    const turno = ++pedidoRef.current;
    void gastosCandidatosAction(movimiento.id, {
      q: busqueda,
      dias,
      incluir_no_bancarios: incluirNoBancarios,
    })
      .catch(sinConexion)
      .then((r) => {
        if (turno !== pedidoRef.current) return;
        if (r.ok && r.data) {
          monedaRef.current = r.data.movimiento.moneda ?? null;
          setMonedaCuenta(monedaRef.current);
          // El API sabe incluir gastos en efectivo: aparece el interruptor.
          if (apiOfreceNoBancarios(r.data)) setApiNoBancarios(true);
        }
        setCarga({ clave, r });
      });
    return () => {
      pedidoRef.current += 1;
    };
  }, [movimiento.id, busqueda, dias, incluirNoBancarios, clave]);

  const cargando = carga === null || carga.clave !== clave;
  const respuesta = !cargando && carga ? carga.r : null;
  const respaldoPorBusqueda = respuesta !== null && !respuesta.ok && esApiSinLote(respuesta);
  const modoRespaldo = avisoSinLote != null || respaldoPorBusqueda;
  const avisoRespaldo = avisoSinLote ?? mensajeApiSinLote(respaldoPorBusqueda ? respuesta : null);
  const data = respuesta?.ok ? (respuesta.data ?? null) : null;
  const errorBusqueda =
    respuesta && !respuesta.ok && !modoRespaldo ? mensajeErrorBusquedaGastos(respuesta) : null;

  const sugerencia = sug.tipo === "listo" ? sug.data : null;
  const sugerido = fichaSugerida(sugerencia);
  const resultados = useMemo(() => data?.candidatos ?? [], [data]);
  const filas = useMemo(
    () => listaConMarcadosPrimero(conSugeridoAlFrente(resultados, sugerido), marcados),
    [resultados, sugerido, marcados],
  );
  const estado = estadoBuscadorGastos({
    cargando,
    error: errorBusqueda,
    q: busqueda,
    resultados: resultados.length,
    truncado: data?.truncado ?? false,
    dias,
    incluyeNoBancarios: incluirNoBancarios,
  });
  // El campo «¿Por qué…?» aparece con un gasto no bancario marcado y el
  // botón «Vincular» espera a que la justificación sea válida.
  const hayNoBancarios = hayNoBancariosMarcados(marcados);
  const faltaJustificacion = hayNoBancarios && !estadoJustificacion(textoJustificacion).valida;
  const suma = textoSumaLote(
    estadoLoteCargo({ montoCargo: movimiento.monto, monedaCuenta, gastos: marcados }),
  );
  const motivo = motivoPendienteDe(movimiento);
  const notaSugerido =
    sugerido && !modoRespaldo
      ? textoSugeridoSinMarcar(
          marcados.some((m) => m.id === sugerido.id),
          marcados.length > 0,
        )
      : null;

  /** La IA PROPONE: marca ★ su gasto (y lo preselecciona si no había nada marcado); nunca liga sola. */
  const consultarIa = useCallback(() => {
    void sugerirMovimientoAction(movimiento.id)
      .catch(sinConexion)
      .then((r) => {
        if (!r.ok || !r.data) {
          const t = textoErrorSugerencia(r);
          toast.error(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
          setSug({ tipo: "nada" });
          return;
        }
        const s = r.data;
        setSug({ tipo: "listo", data: s });
        const ficha = fichaSugerida(s);
        if (!ficha) return;
        // Se preselecciona SOLO si no había nada marcado; si no, solo lleva ★.
        setSeleccionUnica((prev) => prev || ficha.id);
        setMarcados((prev) => marcadosTrasSugerencia(prev, ficha, monedaRef.current));
      });
  }, [movimiento.id]);

  // «Sugerir con IA» desde el menú: se pide UNA vez al abrir.
  const iaPendienteRef = useRef(conIa);
  useEffect(() => {
    if (!iaPendienteRef.current) return;
    iaPendienteRef.current = false;
    consultarIa();
  }, [consultarIa]);

  const pedirIa = () => {
    setSug({ tipo: "cargando" });
    consultarIa();
  };

  /** Apagarlo desmarca los gastos no bancarios (ya no están en la lista) y lo dice. */
  const cambiarNoBancarios = (activo: boolean) => {
    setIncluirNoBancarios(activo);
    if (activo) return;
    const quitados = marcados.filter((m) => esCandidatoNoBancario(m)).length;
    if (quitados === 0) return;
    setMarcados((prev) => marcadosSinNoBancarios(prev));
    toast.info(textoDesmarcadosNoBancarios(quitados));
  };

  /** «Mostrar estos gastos» (bajo el vacío): enciende el interruptor y los busca por su monto. */
  const mostrarNoBancarios = (m: NonNullable<AvisoExcluidos["mostrar"]>) => {
    setApiNoBancarios(true);
    setIncluirNoBancarios(true);
    if (m.dias > dias) setDias(m.dias);
    const q = busquedaParaMostrarNoBancarios(busqueda, m.monto);
    if (q !== busqueda) {
      setTexto(q);
      setBusqueda(q);
    }
  };

  const alternar = (c: GastoCandidato) => {
    const yaMarcado = marcados.some((m) => m.id === c.id);
    if (!yaMarcado && marcados.length >= MAX_GASTOS_LOTE) {
      toast.error(MSG_TOPE_GASTOS_LOTE);
      return;
    }
    setMarcados((prev) =>
      yaMarcado ? prev.filter((m) => m.id !== c.id) : prev.some((m) => m.id === c.id) ? prev : [...prev, c],
    );
  };

  const etiquetaDe = (id: string) => {
    const f = marcados.find((m) => m.id === id) ?? resultados.find((m) => m.id === id);
    return f ? etiquetaCandidatoGasto(fichaCandidatoGasto(f)) : null;
  };

  const tras = (r: ActionResult<MovimientoBancario>, conJustificacion = false) => {
    if (r.ok) {
      // Con justificación, el toast dice que quedó anotada y que el medio no cambió.
      const t = conNotaJustificacion(toastVinculoGastos(r.data), conJustificacion);
      toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
      onCerrar();
      return;
    }
    const e = mensajeErrorVincularGastos(r, etiquetaDe);
    toast.error(e.titulo, e.descripcion ? { description: e.descripcion } : undefined);
    const noBancarios = e.noBancarios ?? [];
    if (noBancarios.length > 0) {
      // 400 JUSTIFICACION_REQUERIDA: el API dijo cuáles no son bancarios; se
      // marcan así y aparece el campo «¿Por qué…?».
      setMarcados((prev) => marcadosConNoBancarios(prev, noBancarios));
    }
    if (e.apiSinLote) {
      // El API no sabe de lotes: queda el camino de siempre (un gasto).
      setAvisoSinLote(e.titulo);
      return;
    }
    if (e.recargar) {
      onCerrar();
      router.refresh();
      return;
    }
    // Rechazo legítimo (no cuadra, ya cubierto…): los faltantes pudieron
    // cambiar; se vuelve a pedir la lista sin perder lo marcado.
    setRecarga((n) => n + 1);
  };

  const vincular = () => {
    // Las vetadas (otra moneda, cruzado) NUNCA viajan dentro de un lote.
    const ids = idsParaVincular(marcados, monedaCuenta);
    // …y tampoco se quitan en silencio: el botón dice «Vincular 3 gastos» y
    // se ligan 3 o nada (lo que ve el operador es lo que se liga).
    const vetados = textoVetadosAlVincular(marcados, monedaCuenta);
    if (vetados) {
      toast.error(vetados);
      return;
    }
    if (ids.length === 0) {
      toast.error(MSG_ELIGE_UN_GASTO);
      return;
    }
    // Un gasto que no pasó por el banco viaja SOLO con su justificación; sin
    // uno marcado no viaja nada nuevo (el cuerpo de siempre).
    const justificacion = justificacionParaEnviar(marcados, textoJustificacion) ?? undefined;
    if (hayNoBancariosMarcados(marcados) && !justificacion) {
      toast.error(MSG_FALTA_JUSTIFICACION);
      return;
    }
    start(async () => {
      const r =
        ids.length >= 2
          ? await linkMovimientoGastosAction(movimiento.id, ids, { justificacion }).catch(sinConexion)
          : await linkMovimientoAction(movimiento.id, ids[0], { justificacion }).catch(sinConexion);
      tras(r, justificacion != null);
    });
  };

  const vincularUno = () => {
    if (!seleccionUnica) {
      toast.error(MSG_ELIGE_UN_GASTO);
      return;
    }
    start(async () => {
      const r = await linkMovimientoAction(movimiento.id, seleccionUnica).catch(sinConexion);
      tras(r);
    });
  };

  const opcionesRespaldo = useMemo(
    () => opcionesRespaldoVincular(gastos, sugerencia),
    [gastos, sugerencia],
  );

  return (
    <>
      <div className="space-y-2">
        {motivo && (
          <p className="text-xs text-muted-foreground" title={motivo.detalle}>
            {textoMotivoPendienteDialogo(motivo.etiqueta)}
          </p>
        )}

        {modoRespaldo ? (
          <div className="space-y-1.5">
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              {avisoRespaldo}
            </p>
            <SearchableSelect
              options={opcionesRespaldo}
              value={seleccionUnica}
              onChange={setSeleccionUnica}
              placeholder={PLACEHOLDER_BUSCAR_GASTO}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor={idBuscar}>{etiquetaListaCandidatos(dias)}</Label>
              {dias < VENTANA_AMPLIADA_DIAS && (
                <button
                  type="button"
                  className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline"
                  onClick={() => setDias(VENTANA_AMPLIADA_DIAS)}
                >
                  {textoAmpliarVentana(VENTANA_AMPLIADA_DIAS)}
                </button>
              )}
            </div>
            <Input
              id={idBuscar}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={PLACEHOLDER_BUSCAR_GASTO}
              maxLength={LARGO_MAX_BUSQUEDA}
              autoComplete="off"
            />
            {/* Gastos en efectivo y otros medios (6-oct-2026): solo con un API
                que lo sabe hacer (o ya encendido, para poder apagarlo). */}
            {(apiNoBancarios || incluirNoBancarios) && (
              <InterruptorNoBancarios
                activo={incluirNoBancarios}
                onCambiar={cambiarNoBancarios}
                disabled={pending}
              />
            )}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filas
                .filter((c) => estado.tipo === "lista" || marcados.some((m) => m.id === c.id))
                .map((c) => {
                  const marcado = marcados.some((m) => m.id === c.id);
                  const bloqueo = bloqueoDeFila(c, monedaCuenta, marcados);
                  const ficha = fichaCandidatoGasto(c);
                  const desc = descripcionCandidatoGasto(ficha);
                  // El title del <span> tapa el del <label>: el tooltip de la
                  // descripción repite el MOTIVO del veto y lleva el folio entero.
                  const tituloDesc = tituloDescripcionCandidatoGasto(ficha, bloqueo);
                  const esSugerido = c.id === sugerido?.id;
                  return (
                    <label
                      key={c.id}
                      title={bloqueo ?? undefined}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2 text-sm",
                        bloqueo ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={bloqueo != null}
                        onChange={() => alternar(c)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="block min-w-0 truncate font-medium">
                            {esSugerido ? "★ " : ""}
                            {etiquetaCandidatoGasto(ficha)}
                          </span>
                          {/* «Efectivo»: no pasó por el banco (pide justificación). */}
                          <BadgeMedioCandidato candidato={c} />
                        </span>
                        {/* La línea se recorta: completa (con el número de
                            factura entero y, si la casilla va apagada, el
                            motivo) en el tooltip. */}
                        {desc && (
                          <span
                            className="block truncate text-xs text-muted-foreground"
                            title={tituloDesc ?? undefined}
                          >
                            {desc}
                          </span>
                        )}
                        {esSugerido && (
                          <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {ETIQUETA_SUGERIDO}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              {estado.tipo === "cargando" ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">{estado.texto}</p>
              ) : estado.tipo === "error" ? (
                <div className="space-y-1 px-3 py-3 text-center text-xs">
                  <p className="text-amber-700 dark:text-amber-300">{estado.texto}</p>
                  <button
                    type="button"
                    className="cursor-pointer text-brand-600 underline underline-offset-2 hover:no-underline"
                    onClick={() => setRecarga((n) => n + 1)}
                  >
                    {BOTON_REINTENTAR}
                  </button>
                </div>
              ) : estado.tipo === "vacio_sin_q" || estado.tipo === "vacio_con_q" ? (
                // Debajo del vacío, POR QUÉ no salen los gastos del mismo
                // monto (`excluidos`, API 0.0.63; sin él, el vacío de siempre).
                <VacioCandidatos
                  texto={estado.texto}
                  avisos={textoExcluidosCandidatos(data?.excluidos, movimiento.monto, {
                    monedaCuenta,
                    dias,
                    montoBuscado: data?.excluidos_monto,
                    incluyeNoBancarios: incluirNoBancarios,
                    fechaCargo: movimiento.fecha,
                  })}
                  onVolverABuscar={() => setRecarga((n) => n + 1)}
                  onMostrarNoBancarios={mostrarNoBancarios}
                />
              ) : null}
            </div>
            {estado.tipo === "lista" && estado.texto && (
              <p className="text-[11px] text-muted-foreground">{estado.texto}</p>
            )}
            {suma && <p className={cn("text-xs font-medium", CLASE_TONO[suma.tono])}>{suma.texto}</p>}
            {hayNoBancarios && (
              <CampoJustificacion
                id={idJustificacion}
                etiqueta={etiquetaJustificacion(marcados)}
                valor={textoJustificacion}
                onCambiar={setTextoJustificacion}
                disabled={pending}
              />
            )}
          </div>
        )}

        {/* La IA PROPONE (★ dentro de la lista); vincular lo confirma una persona. */}
        <div className="flex flex-wrap items-center gap-2">
          {sug.tipo === "cargando" ? (
            <span className="text-xs text-muted-foreground">{BUSCANDO_SUGERENCIA_IA}</span>
          ) : (
            <button
              type="button"
              className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={pedirIa}
              disabled={pending}
            >
              {BOTON_SUGERIR_IA}
            </button>
          )}
        </div>
        {sugerencia && sugerencia.gasto_id_sugerido && (
          <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                {ETIQUETA_SUGERENCIA_IA}
              </Badge>
              <span className="text-muted-foreground">{textoConfianza(sugerencia.confianza).texto}</span>
            </div>
            {sugerencia.razon && <p className="text-muted-foreground">{sugerencia.razon}</p>}
            {(sugerencia.evidencias?.length ?? 0) > 0 && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {sugerencia.evidencias!.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
            {notaSugerido && <p className="text-[11px] text-amber-700 dark:text-amber-300">{notaSugerido}</p>}
            <p className="text-[11px] text-muted-foreground">{NOTA_IA_PROPONE}</p>
          </div>
        )}
        {sugerencia && !sugerencia.disponible && (
          <p className="text-xs text-muted-foreground">{TEXTO_IA_NO_DISPONIBLE}</p>
        )}
        {sugerencia &&
          sugerencia.disponible &&
          !sugerencia.gasto_id_sugerido &&
          (sugerencia.motivo_sin_match ?? sugerencia.razon) && (
            <p className="text-xs text-muted-foreground">
              {textoIaSinPropuesta(sugerencia.motivo_sin_match ?? sugerencia.razon ?? "")}
            </p>
          )}

        {!modoRespaldo && (
          <p className="text-[11px] text-muted-foreground">{NOTA_VENTANA_CARGO(dias, incluirNoBancarios)}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={pending}>
          {BOTON_CANCELAR}
        </Button>
        {modoRespaldo ? (
          <Button onClick={vincularUno} disabled={pending || !seleccionUnica}>
            {pending ? TEXTO_VINCULANDO : botonVincularGastos(seleccionUnica ? 1 : 0)}
          </Button>
        ) : (
          <Button onClick={vincular} disabled={pending || marcados.length === 0 || faltaJustificacion}>
            {pending ? TEXTO_VINCULANDO : botonVincularGastos(marcados.length)}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
