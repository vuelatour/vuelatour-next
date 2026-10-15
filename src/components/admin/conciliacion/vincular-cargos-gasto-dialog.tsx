"use client";

/**
 * «Vincular N cargos a un gasto» (14-oct-2026, API 0.0.77, invariante 76 del
 * API). Pedido: «Necesitamos poder seleccionar varias filas de conciliaciones
 * pendientes para todo eso ponerlas a un solo gasto…».
 *
 * Lo abre la barra de la selección con 2..50 cargos de UNA moneda (con uno,
 * la tabla abre el «Vincular gasto» de siempre), con la lista CONGELADA al
 * abrir: un refresh de la página no lo desmonta ni le cambia la lista. Se
 * carga con `next/dynamic` (sin SSR) y se monta SOLO al abrirse.
 *
 * Al abrir y con cada búsqueda (300 ms) pide al API los gastos que podrían
 * pagar JUNTOS esos cargos (`gastosCandidatosDeCargosAction`): la SUMA, el
 * orden y si cada gasto queda cubierto, parcial o se pasa los calcula el API;
 * la guía de color NUNCA apaga el botón (decide el API al ligar). Avisos
 * ámbar: cargos que tienen SU propio gasto que cuadra (lo dice el API) y
 * cargos de cuentas distintas. Se elige UN gasto; el resumen visible («Se
 * vincularán 2 cargos ($400.00) al gasto «…»…») y el botón «Vincular los 2
 * cargos» son la confirmación (sin otro AlertDialog, como «Mover a…»). La
 * liga es UNA transacción del API (`ligarCargosAGastoAction`): todo o nada.
 *
 * Éxito ⇒ toast, cerrar, el padre limpia la selección y UN `router.refresh()`
 * (la server action no revalida). 4xx ⇒ caja roja con el texto del API + «No
 * se vinculó ningún cargo.» y la lista se vuelve a pedir sin perder lo
 * elegido; los cargos que ya no están pendientes se quitan de la selección
 * con un clic. Sin respuesta ⇒ «No se pudo confirmar si se vincularon…» +
 * refresh (jamás «no se vinculó»). Todos los textos en
 * `lib/admin/conciliacion-cargos-gasto.ts`.
 *
 * «¿No está el gasto? Créalo por $X» (paso 4, solo con `catalogosGasto` y la
 * suma del API): el paso previo «Crear el gasto con la suma» dentro de este
 * diálogo (los POSIBLES DUPLICADOS del mismo monto en ±120 días con los
 * `excluidos` del API —si la lectura falla, la casilla queda bloqueada—, la
 * nota de que la IA no revisa varios cargos y la casilla obligatoria) y,
 * ANIDADA, el alta de SIEMPRE (`ExpenseCreateDialog` en modo controlado)
 * prellenada con la suma y con `conciliarConMovimientos` + `clientRequestId`
 * (UNA llave por sesión del diálogo: un reintento no duplica). El API crea el
 * gasto SIN auto-cruce y le liga los cargos en la MISMA petición; si la liga
 * falla, retira el gasto. Éxito ⇒ el alta avisa, este diálogo cierra, el
 * padre limpia la selección y UN `router.refresh()`; error ⇒ el alta sigue
 * abierta con su caja roja.
 */

import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowPathIcon, LinkIcon, PlusIcon } from "@heroicons/react/24/outline";
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
  gastosCandidatosDeCargosAction,
  ligarCargosAGastoAction,
  type ActionResult,
} from "@/app/admin/conciliacion/actions";
import { BadgeMedioCandidato, VacioCandidatos } from "@/components/admin/conciliacion/vincular-gasto-dialog";
import { etiquetaCandidatoGasto, tituloDescripcionCandidatoGasto } from "@/lib/admin/conciliacion-auto";
import {
  BOTON_CANCELAR,
  BOTON_REINTENTAR,
  DEBOUNCE_BUSQUEDA_MS,
  LARGO_MAX_BUSQUEDA,
  MSG_SIN_CONEXION,
  TEXTO_VINCULANDO,
  VENTANA_AMPLIADA_DIAS,
  VENTANA_CARGO_DIAS,
  busquedaParaApi,
  fichaCandidatoGasto,
  textoExcluidosCandidatos,
  type AvisoExcluidos,
  type ResultadoAccionLote,
  type TipoEstadoBuscador,
} from "@/lib/admin/conciliacion-lote";
import {
  BOTON_AMPLIAR_120,
  DESCRIPCION_VINCULAR_CARGOS,
  ETIQUETA_LISTA_CARGOS,
  NOTA_CANDIDATO_PROPIO_NO_VERIFICADO,
  NOTA_SIN_IA_SUMA,
  TEXTO_ELIGE_GASTO,
  TEXTO_UN_SOLO_CARGO,
  avisoCargosConCandidatoPropio,
  avisoCargosConCandidatoPropioCrear,
  avisoFechasCargos,
  avisoVariasCuentas,
  botonAbrirCrearSuma,
  botonQuitarNoPendientes,
  botonVincularCargos,
  casillaCrearSuma,
  contextoCrearSuma,
  descripcionCandidatoSuma,
  encabezadoCargos,
  estadoDuplicadosSuma,
  estadoListaSuma,
  fichaElegidaVigente,
  guiaResultado,
  hayCandidatoQueCubre,
  lineaCargoVincular,
  marcaCandidatoPropio,
  mensajeErrorCandidatosSuma,
  mensajeErrorCargosGasto,
  mensajeErrorCrearSuma,
  motivoNoCrearSuma,
  motivoNoVincularCargos,
  notaPrellenadoSuma,
  notaVentanaSuma,
  placeholderBuscarSuma,
  prefillGastoDesdeCargos,
  qDuplicadosSuma,
  textoCargosSinSuma,
  textoExitoCrearSuma,
  textoResumenVincularCargos,
  textoVentanaSuma,
  toastCargosVinculados,
  tituloAbrirCrearSuma,
  tituloCrearSuma,
  tituloVincularCargos,
  type ElegidoSuma,
  type ErrorCandidatosSuma,
  type ErrorCargosGasto,
  type EstadoDuplicadosSuma,
  type TonoGuia,
} from "@/lib/admin/conciliacion-cargos-gasto";
import {
  BOTON_CREAR,
  BOTON_VOLVER,
  DIAS_DUPLICADOS,
  ETIQUETA_DUPLICADOS,
  TEXTO_SIN_DUPLICADOS,
  type CatalogosGastoDesdeCargo,
} from "@/lib/admin/gasto-desde-cargo";
import { MIN_CARGOS_A_GASTO, monedaDeMovimiento } from "@/lib/admin/conciliacion-seleccion";
import { cn } from "@/lib/utils";
import type {
  CandidatoGastoPorSuma,
  CargoConCandidatoPropio,
  CargosGastosCandidatosResponse,
  CargosResumen,
  MovimientoBancario,
} from "@/types/conciliacion";

/** La server action ni siquiera salió (sin red, un deploy de Vercel): nunca lanza. */
const sinConexion = (): ActionResult<never> => ({ ok: false, code: "SIN_CONEXION", error: MSG_SIN_CONEXION });

type Carga = { clave: string; r: ActionResult<CargosGastosCandidatosResponse> };

/** Los posibles duplicados del paso «crear» (de ESTOS cargos; `r` null = leyendo). */
type CargaDuplicados = { idsClave: string; r: ActionResult<CargosGastosCandidatosResponse> | null };

/**
 * El alta de gasto (el formulario completo de Gastos) se carga SOLO al llegar
 * al paso «crear» (sin SSR) y su chunk se PRECARGA al entrar a ese paso: un
 * Esc mientras baja no cierra este diálogo con lo elegido.
 */
const ExpenseCreateDialog = dynamic(
  () => import("@/components/admin/expenses/expense-create-dialog").then((m) => m.ExpenseCreateDialog),
  { ssr: false },
);
const precargarAlta = () => import("@/components/admin/expenses/expense-create-dialog");

/** uuid v4 de la llave de idempotencia (respaldo si el navegador no expone randomUUID). */
function uuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const CLASE_GUIA: Record<TonoGuia, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  aviso: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/10 text-destructive",
};

const CLASE_AVISO_AMBAR =
  "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200";

export interface VincularCargosGastoDialogProps {
  /** Copia CONGELADA al abrir: 2..50 cargos de una moneda (la barra ya lo revisó). */
  movimientos: MovimientoBancario[];
  /** Alias por cuenta (el encabezado y, si la selección mezcla cuentas, cada renglón). */
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  /** Moneda por cuenta (el monto de cada renglón; la suma es la del API). */
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras vincular: el padre limpia la selección (el diálogo ya cerró y refresca). */
  onVinculados?: (ids: string[]) => void;
  /** Sacar de la selección los que el API dijo que ya no están pendientes. */
  onQuitarDeSeleccion?: (ids: string[]) => void;
  /** Catálogos del alta de gasto (aviones y proveedores, los de «¿No está el
   *  gasto? Créalo» de un cargo): sin ellos no se ofrece «Créalo por $X». */
  catalogosGasto?: CatalogosGastoDesdeCargo | null;
  /** A dónde vuelve el foco al cerrar (Base UI); la tabla pasa `false` y lo pone ella tras el commit. Sin él, el de siempre. */
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
}

export function VincularCargosGastoDialog(p: VincularCargosGastoDialogProps) {
  const router = useRouter();
  const idBuscar = useId();
  const nombreGrupo = useId();
  const [lista, setLista] = useState<MovimientoBancario[]>(() => p.movimientos);
  // Buscador: lo tecleado y, 300 ms después, lo que viaja al servidor.
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dias, setDias] = useState(VENTANA_CARGO_DIAS);
  const [recarga, setRecarga] = useState(0);
  const [carga, setCarga] = useState<Carga | null>(null);
  // La última respuesta BUENA para ESTOS cargos: su suma, cuentas y avisos no
  // cambian entre búsquedas (el encabezado no parpadea mientras llega otra).
  const [base, setBase] = useState<{ idsClave: string; data: CargosGastosCandidatosResponse } | null>(null);
  // El gasto elegido CON los cargos para los que el API calculó su ficha (se
  // conserva aunque la búsqueda lo deje fuera; si cambian los cargos, ya no
  // vale: `fichaElegidaVigente`).
  const [elegido, setElegido] = useState<ElegidoSuma | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCargosGasto | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Turno del pedido: una respuesta vieja jamás pisa a la nueva.
  const pedidoRef = useRef(0);
  const enviandoRef = useRef(false);
  const refrescarAlCerrarRef = useRef(false);
  // «¿No está el gasto? Créalo por $X» (paso 4): el paso previo, la casilla,
  // los posibles duplicados (con su turno) y el alta anidada. La LLAVE de la
  // captura nace al entrar la primera vez al paso y vale para TODA la sesión
  // del diálogo: cada «Guardar» la repite y un reintento no duplica (aunque se
  // vuelva a la lista y se regrese); cerrar el diálogo y volver a abrirlo da
  // otra.
  const [paso, setPaso] = useState<"lista" | "crear">("lista");
  const [confirmado, setConfirmado] = useState(false);
  const [dup, setDup] = useState<CargaDuplicados | null>(null);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [llave, setLlave] = useState<string | null>(null);
  const dupRef = useRef(0);

  const ids = useMemo(() => lista.map((m) => m.id), [lista]);
  const idsClave = ids.join(",");
  const unSolo = lista.length < MIN_CARGOS_A_GASTO;

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(busquedaParaApi(texto)), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const clave = `${idsClave}|${dias}|${busqueda}|${recarga}`;
  useEffect(() => {
    // Con un solo cargo el API respondería LOTE_INVALIDO: no se pregunta.
    if (unSolo) return;
    const turno = ++pedidoRef.current;
    void gastosCandidatosDeCargosAction(ids, { q: busqueda, dias })
      .catch(sinConexion)
      .then((r) => {
        if (turno !== pedidoRef.current) return;
        if (r.ok && r.data) setBase({ idsClave, data: r.data });
        setCarga({ clave, r });
      });
    return () => {
      pedidoRef.current += 1;
    };
  }, [ids, idsClave, busqueda, dias, clave, unSolo]);

  const cargando = !unSolo && (carga === null || carga.clave !== clave);
  // Solo la respuesta de ESTA lista, búsqueda y ventana (nunca una vieja).
  const respuesta = carga && carga.clave === clave ? carga.r : null;
  const data = respuesta?.ok ? (respuesta.data ?? null) : null;
  const errorLista = respuesta && !respuesta.ok ? mensajeErrorCandidatosSuma(respuesta) : null;
  const vigente = base && base.idsClave === idsClave ? base.data : null;
  const resumen = vigente?.cargos ?? null;
  const resultados = useMemo(() => data?.candidatos ?? [], [data]);
  // La ficha MÁS reciente del elegido (sus faltantes pudieron cambiar) y SOLO
  // si es de ESTOS cargos (revisión del 15-oct-2026): con otra suma su
  // `resultado` y su guía dirían «queda cubierto» cuando el API lo dejaría
  // PARCIAL.
  const elegidoVigente = fichaElegidaVigente(elegido, idsClave, resultados);
  const filas =
    elegidoVigente && !resultados.some((c) => c.id === elegidoVigente.id)
      ? [elegidoVigente, ...resultados]
      : resultados;
  const estado = estadoListaSuma({
    cargando,
    error: errorLista?.texto ?? null,
    q: busqueda,
    resultados: resultados.length,
    truncado: data?.truncado ?? false,
    dias,
  });
  // Los gastos del monto de la suma que NO entraron (en efectivo, ya
  // conciliados, otra moneda, fuera de la ventana): bajo el vacío o cuando
  // ninguno de la lista queda cubierto.
  const avisosExcluidos = useMemo(
    () =>
      data && (resultados.length === 0 || !hayCandidatoQueCubre(resultados))
        ? textoExcluidosCandidatos(data.excluidos, data.cargos?.suma ?? 0, {
            monedaCuenta: data.cargos?.moneda ?? null,
            dias,
            montoBuscado: data.excluidos_monto,
            variosCargos: true,
          })
        : [],
    [data, resultados, dias],
  );
  const n = lista.length;
  const resumenTexto =
    elegidoVigente && resumen && !unSolo
      ? textoResumenVincularCargos({ n, suma: resumen.suma, moneda: resumen.moneda, gasto: elegidoVigente })
      : null;
  // Paso «crear»: los duplicados de ESTOS cargos y el alta prellenada con la SUMA DEL API.
  const enCrear = paso === "crear" && resumen !== null && !unSolo;
  const dupVigente = dup && dup.idsClave === idsClave ? dup : null;
  const duplicados = useMemo(
    () => estadoDuplicadosSuma(dupVigente?.r ?? null, resumen?.suma ?? 0),
    [dupVigente, resumen],
  );
  const prefill = useMemo(
    () => (resumen ? prefillGastoDesdeCargos(lista, resumen, p.aliasPorCuenta) : undefined),
    [lista, resumen, p.aliasPorCuenta],
  );
  // «Cargos con su propio gasto»: el de la lectura más reciente (la de los duplicados, si ya llegó).
  const propiosCrear =
    (dupVigente?.r?.ok ? dupVigente.r.data?.cargos_con_candidato_propio : undefined) ??
    vigente?.cargos_con_candidato_propio;

  const cambiarAbierto = (abierto: boolean) => {
    // Con la liga en curso no se cierra: su resultado se pinta aquí.
    if (!abierto && enviandoRef.current) return;
    // Un 409/404 (o una lectura que dijo que alguno ya no está pendiente): la
    // tabla quedó vieja y se pone al día UNA vez al cerrar.
    if (!abierto && (refrescarAlCerrarRef.current || errorLista?.refrescar)) {
      refrescarAlCerrarRef.current = false;
      router.refresh();
    }
    p.onOpenChange(abierto);
  };

  /**
   * Saca cargos de la lista del diálogo Y de la selección (sin cargos,
   * cierra). Los quitados ya no están pendientes (o no existen): la tabla se
   * pone al día al cerrar.
   */
  const quitar = (quitarIds: string[]) => {
    const fuera = new Set(quitarIds.map((x) => x.toLowerCase()));
    const resto = lista.filter((m) => !fuera.has(m.id.toLowerCase()));
    p.onQuitarDeSeleccion?.(quitarIds);
    refrescarAlCerrarRef.current = true;
    setError(null);
    setAviso(null);
    // Con otros cargos cambia la suma: el gasto elegido se vuelve a elegir
    // (su ficha era de la suma anterior) y de vuelta a la lista (los
    // duplicados se releen al volver a «Créalo»).
    setElegido(null);
    dupRef.current += 1;
    setDup(null);
    setPaso("lista");
    setConfirmado(false);
    setCrearAbierto(false);
    if (resto.length === 0) {
      cambiarAbierto(false);
      return;
    }
    setLista(resto);
  };

  const elegir = (c: CandidatoGastoPorSuma) => {
    setElegido({ idsClave, candidato: c });
    setAviso(null);
    setError(null);
  };

  const vincular = () => {
    // Un doble clic o un clic con el diálogo ya cerrándose no corre dos veces.
    if (!p.open || enviandoRef.current) return;
    // El resumen visible ES la confirmación: con la lista cargándose, sin
    // gasto elegido para ESTOS cargos o sin el resumen, no se llama al API (el
    // botón nunca se apaga: el clic dice por qué).
    const motivo = motivoNoVincularCargos({
      unSolo,
      cargando,
      elegido: elegidoVigente !== null,
      conResumen: resumenTexto !== null,
    });
    const gasto = elegidoVigente;
    if (motivo !== null || gasto === null) {
      setAviso(motivo ?? TEXTO_ELIGE_GASTO);
      return;
    }
    // Se congela lo que se ve: ESE gasto y ESTOS cargos.
    const idsEnvio = [...ids];
    setAviso(null);
    setError(null);
    enviandoRef.current = true;
    setEnviando(true);
    void ligarCargosAGastoAction(gasto.id, idsEnvio)
      .catch(sinConexion)
      .then((r) => {
        enviandoRef.current = false;
        setEnviando(false);
        if (r.ok) {
          const t = toastCargosVinculados(r.data, idsEnvio.length);
          toast.success(t.titulo, t.descripcion ? { description: t.descripcion } : undefined);
          p.onVinculados?.(idsEnvio);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        const e = mensajeErrorCargosGasto(r);
        if (e.incierto) {
          // No se sabe si quedaron ligados: se dice así y la lista se pone al día.
          toast.error(e.titulo);
          refrescarAlCerrarRef.current = false;
          p.onOpenChange(false);
          router.refresh();
          return;
        }
        if (e.refrescar) refrescarAlCerrarRef.current = true;
        if (e.soltarGasto) setElegido(null);
        // Nada se escribió y los faltantes pudieron cambiar: la lista se
        // vuelve a pedir sin perder lo elegido.
        if (e.recargarLista) setRecarga((x) => x + 1);
        setError(e);
      });
  };

  // ===== «¿No está el gasto? Créalo por $X» (paso 4) =====

  /**
   * Los posibles duplicados: la SUMA como monto, ±120 días (con los
   * `excluidos` del API). Cada lectura nueva pide volver a marcar la casilla:
   * se confirma sobre la lista que se VE.
   */
  const cargarDuplicados = (suma: number) => {
    const turno = ++dupRef.current;
    const deIds = idsClave;
    setDup({ idsClave: deIds, r: null });
    setConfirmado(false);
    void gastosCandidatosDeCargosAction(ids, { q: qDuplicadosSuma(suma), dias: DIAS_DUPLICADOS })
      .catch(sinConexion)
      .then((r) => {
        if (turno !== dupRef.current) return;
        setDup({ idsClave: deIds, r });
      });
  };

  const abrirCrear = () => {
    if (!p.catalogosGasto || !resumen || unSolo || enviandoRef.current) return;
    setPaso("crear");
    setAviso(null);
    setError(null);
    if (llave === null) setLlave(uuidV4());
    // Siempre frescos al entrar: alguien pudo capturar el gasto mientras tanto.
    cargarDuplicados(resumen.suma);
    void precargarAlta().catch(() => undefined);
  };

  const volverALista = () => {
    setPaso("lista");
    setConfirmado(false);
    setAviso(null);
  };

  /** «Crear el gasto»: nunca se apaga; sin la revisión terminada o sin la casilla, el clic dice por qué. */
  const crear = () => {
    const motivo = motivoNoCrearSuma({ confirmado, duplicados });
    if (motivo) {
      setAviso(motivo);
      return;
    }
    setAviso(null);
    setCrearAbierto(true);
  };

  /**
   * El API YA registró el gasto Y le ligó los cargos (todo o nada; el alta ya
   * avisó con `textoExitoCrearSuma`): se cierra TODO, el padre limpia la
   * selección y UN `router.refresh()` (la action no revalida).
   */
  const trasCrearSuma = () => {
    setCrearAbierto(false);
    p.onVinculados?.([...ids]);
    refrescarAlCerrarRef.current = false;
    p.onOpenChange(false);
    router.refresh();
  };

  /**
   * El fallo del alta: su texto (la caja roja del alta, que sigue abierta).
   * Si la tabla quedó vieja, refresh al cerrar; si pudo quedar un gasto
   * registrado, se releen los duplicados y la lista (y la casilla se vuelve a
   * marcar sobre lo que se lea).
   */
  const textoErrorAlta = (r: ResultadoAccionLote): string => {
    const e = mensajeErrorCrearSuma(r);
    if (e.refrescar) refrescarAlCerrarRef.current = true;
    if (e.releer && resumen) {
      setRecarga((x) => x + 1);
      cargarDuplicados(resumen.suma);
    }
    return e.texto;
  };

  const quedanTrasQuitar = error ? n - error.quitarIds.length : n;

  return (
    <Dialog open={p.open} onOpenChange={cambiarAbierto}>
      <DialogContent className="sm:max-w-xl" finalFocus={p.finalFocus}>
        <DialogHeader>
          <DialogTitle>{enCrear ? tituloCrearSuma(n) : tituloVincularCargos(n)}</DialogTitle>
          <DialogDescription>{DESCRIPCION_VINCULAR_CARGOS}</DialogDescription>
        </DialogHeader>

        {enCrear && resumen ? (
          <div className="space-y-3">
            <PasoCrearGastoSuma
              lista={lista}
              resumen={resumen}
              propios={propiosCrear}
              aliasPorCuenta={p.aliasPorCuenta}
              monedaPorCuenta={p.monedaPorCuenta}
              duplicados={duplicados}
              confirmado={confirmado}
              onConfirmado={(v) => {
                setConfirmado(v);
                setAviso(null);
              }}
              onReintentar={() => cargarDuplicados(resumen.suma)}
              onQuitar={p.onQuitarDeSeleccion ? quitar : undefined}
            />
            {aviso && (
              <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {aviso}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <CargosDelLote
              lista={lista}
              resumen={resumen}
              propios={vigente ? vigente.cargos_con_candidato_propio : undefined}
              aliasPorCuenta={p.aliasPorCuenta}
              monedaPorCuenta={p.monedaPorCuenta}
            />

            {unSolo ? (
              <p role="status" className={CLASE_AVISO_AMBAR}>
                {TEXTO_UN_SOLO_CARGO}
              </p>
            ) : (
              <ListaGastosPorSuma
                idBuscar={idBuscar}
                nombreGrupo={nombreGrupo}
                texto={texto}
                onTexto={setTexto}
                suma={resumen?.suma ?? null}
                dias={dias}
                onAmpliar={() => setDias(VENTANA_AMPLIADA_DIAS)}
                estado={estado}
                filas={filas}
                elegidoId={elegidoVigente?.id ?? null}
                onElegir={elegir}
                errorLista={errorLista}
                onReintentar={() => setRecarga((x) => x + 1)}
                onQuitar={p.onQuitarDeSeleccion ? quitar : undefined}
                avisos={avisosExcluidos}
                disabled={enviando}
              />
            )}

            {resumenTexto && (
              <p data-resumen-vincular="" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium">
                {resumenTexto}
              </p>
            )}

            {aviso && (
              <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {aviso}
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <p>{error.titulo}</p>
                {error.descripcion && <p className="font-medium">{error.descripcion}</p>}
                {p.onQuitarDeSeleccion && error.quitarIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => quitar(error.quitarIds)}
                    className="cursor-pointer rounded-md border border-destructive/40 px-2 py-0.5 font-medium hover:bg-destructive/20"
                  >
                    {botonQuitarNoPendientes(error.quitarIds.length)}
                  </button>
                )}
                {error.quitarIds.length > 0 && quedanTrasQuitar < MIN_CARGOS_A_GASTO && <p>{TEXTO_UN_SOLO_CARGO}</p>}
              </div>
            )}
          </div>
        )}

        {enCrear ? (
          <DialogFooter>
            <Button type="button" variant="outline" className="cursor-pointer" onClick={volverALista}>
              {BOTON_VOLVER}
            </Button>
            <Button type="button" className="cursor-pointer gap-1.5" onClick={crear}>
              <PlusIcon className="h-4 w-4" aria-hidden />
              {BOTON_CREAR}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="sm:justify-between">
            {/* «¿No está el gasto? Créalo por $X» (paso 4): solo con los
                catálogos del alta y la SUMA DEL API (sin respuesta, no se sabe
                por cuánto); abre el paso «Crear el gasto con la suma». */}
            {p.catalogosGasto && resumen && !unSolo ? (
              <button
                type="button"
                className="cursor-pointer self-center text-xs text-brand-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
                onClick={abrirCrear}
                disabled={enviando}
                title={tituloAbrirCrearSuma(n)}
              >
                {botonAbrirCrearSuma(resumen.suma, resumen.moneda)}
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => cambiarAbierto(false)}
                disabled={enviando}
              >
                {BOTON_CANCELAR}
              </Button>
              <Button type="button" className="cursor-pointer gap-1.5" onClick={vincular} disabled={enviando}>
                <LinkIcon className="h-4 w-4" aria-hidden />
                {enviando ? TEXTO_VINCULANDO : botonVincularCargos(n)}
              </Button>
            </div>
          </DialogFooter>
        )}

        {/* El alta de SIEMPRE, en modo controlado y ANIDADA (Base UI apila los
            diálogos: Esc cierra solo la de arriba), prellenada con la suma y
            con los cargos: el API la crea y le liga los cargos en un paso. */}
        {enCrear && p.catalogosGasto && resumen && llave && (
          <ExpenseCreateDialog
            aircraft={p.catalogosGasto.aircraft}
            providers={p.catalogosGasto.providers}
            abierto={crearAbierto}
            onAbiertoChange={setCrearAbierto}
            prefill={prefill}
            titulo={tituloCrearSuma(n)}
            contexto={contextoCrearSuma(resumen, p.aliasPorCuenta)}
            onCreado={trasCrearSuma}
            conciliarConMovimientos={ids}
            clientRequestId={llave}
            textoExito={textoExitoCrearSuma}
            textoError={textoErrorAlta}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Los cargos que se vinculan: el encabezado con la SUMA DEL API (mientras no
 * llega, solo el conteo), un renglón por cargo (con la marca ámbar si tiene
 * su propio gasto) y los avisos ámbar del API y de cuentas distintas.
 */
export function CargosDelLote({
  lista,
  resumen,
  propios,
  aliasPorCuenta,
  monedaPorCuenta,
  paraCrear = false,
}: {
  lista: readonly MovimientoBancario[];
  /** `cargos` del API (null mientras no responde o si falló). */
  resumen: CargosResumen | null;
  /** `cargos_con_candidato_propio` del API: null = no se pudo revisar; undefined = sin respuesta. */
  propios: readonly CargoConCandidatoPropio[] | null | undefined;
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  /** Paso «crear» (paso 4): el aviso ámbar dice que quizá ya está capturado por separado. */
  paraCrear?: boolean;
}) {
  const propioDe = new Map((propios ?? []).map((x) => [x.id, x]));
  const variasCuentas = new Set(lista.map((m) => m.cuenta_bancaria_id)).size > 1;
  const avisoPropio = paraCrear ? avisoCargosConCandidatoPropioCrear(propios) : avisoCargosConCandidatoPropio(propios);
  const avisoCuentas = resumen ? avisoVariasCuentas(resumen.cuentas, aliasPorCuenta) : null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{resumen ? encabezadoCargos(resumen, aliasPorCuenta) : textoCargosSinSuma(lista.length)}</p>
      <ul
        aria-label={ETIQUETA_LISTA_CARGOS}
        className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
      >
        {lista.map((m) => {
          const l = lineaCargoVincular(
            m,
            variasCuentas ? (aliasPorCuenta?.[m.cuenta_bancaria_id] ?? null) : null,
            monedaDeMovimiento(m, monedaPorCuenta) ?? resumen?.moneda ?? null,
          );
          const propio = propioDe.get(m.id);
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate" title={m.descripcion ?? undefined}>
                {l.texto}
                {propio && (
                  <span data-cargo-con-propio="" className="text-amber-700 dark:text-amber-300">
                    {` · ${marcaCandidatoPropio(propio)}`}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">{l.monto}</span>
            </li>
          );
        })}
      </ul>
      {avisoPropio && (
        <p role="status" data-aviso-candidato-propio="" className={CLASE_AVISO_AMBAR}>
          {avisoPropio}
        </p>
      )}
      {propios === null && <p className="text-[11px] text-muted-foreground">{NOTA_CANDIDATO_PROPIO_NO_VERIFICADO}</p>}
      {avisoCuentas && (
        <p role="status" data-aviso-varias-cuentas="" className={CLASE_AVISO_AMBAR}>
          {avisoCuentas}
        </p>
      )}
    </div>
  );
}

/**
 * El buscador y la lista de gastos candidatos (UN gasto con radio), cada uno
 * con su ficha y la guía del `resultado` del API. El error va antes que el
 * vacío (jamás «ningún gasto» cuando la lectura falló).
 */
export function ListaGastosPorSuma(p: {
  idBuscar: string;
  nombreGrupo: string;
  texto: string;
  onTexto: (t: string) => void;
  /** La suma del API (el ejemplo del buscador); null mientras no responde. */
  suma: number | null;
  dias: number;
  onAmpliar: () => void;
  estado: { tipo: TipoEstadoBuscador; texto: string };
  filas: readonly CandidatoGastoPorSuma[];
  elegidoId: string | null;
  onElegir: (c: CandidatoGastoPorSuma) => void;
  errorLista: ErrorCandidatosSuma | null;
  onReintentar: () => void;
  /** Sin él (fuera de la selección) no se ofrece «Quitar…». */
  onQuitar?: (ids: string[]) => void;
  avisos: readonly AvisoExcluidos[];
  disabled: boolean;
}) {
  const { estado } = p;
  const visibles = p.filas.filter((c) => estado.tipo === "lista" || c.id === p.elegidoId);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Label htmlFor={p.idBuscar}>{textoVentanaSuma(p.dias)}</Label>
        {p.dias < VENTANA_AMPLIADA_DIAS && (
          <button
            type="button"
            className="cursor-pointer text-xs text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
            onClick={p.onAmpliar}
          >
            {BOTON_AMPLIAR_120}
          </button>
        )}
      </div>
      <Input
        id={p.idBuscar}
        value={p.texto}
        onChange={(e) => p.onTexto(e.target.value)}
        placeholder={placeholderBuscarSuma(p.suma)}
        maxLength={LARGO_MAX_BUSQUEDA}
        autoComplete="off"
      />
      <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {visibles.map((c) => {
          const elegido = c.id === p.elegidoId;
          const ficha = fichaCandidatoGasto(c);
          const desc = descripcionCandidatoSuma(c);
          const guia = guiaResultado(c);
          return (
            <label
              key={c.id}
              data-candidato-suma=""
              className={cn(
                "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50",
                elegido && "bg-brand-50 dark:bg-brand-900/30",
              )}
            >
              <input
                type="radio"
                name={p.nombreGrupo}
                checked={elegido}
                onChange={() => p.onElegir(c)}
                disabled={p.disabled}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block min-w-0 truncate font-medium">{etiquetaCandidatoGasto(ficha)}</span>
                  <BadgeMedioCandidato candidato={c} />
                </span>
                {desc && (
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={tituloDescripcionCandidatoGasto(ficha) ?? undefined}
                  >
                    {desc}
                  </span>
                )}
                {guia && (
                  <span
                    data-guia={guia.tono}
                    className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", CLASE_GUIA[guia.tono])}
                  >
                    {guia.texto}
                  </span>
                )}
              </span>
            </label>
          );
        })}
        {estado.tipo === "cargando" ? (
          <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
            {estado.texto}
          </p>
        ) : estado.tipo === "error" ? (
          <div role="alert" className="space-y-1.5 px-3 py-3 text-center text-xs">
            <p className="text-amber-700 dark:text-amber-300">{estado.texto}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {p.errorLista?.reintentar && (
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={p.onReintentar}
                >
                  <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
                  {BOTON_REINTENTAR}
                </button>
              )}
              {p.onQuitar && (p.errorLista?.quitarIds.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={() => p.onQuitar?.(p.errorLista?.quitarIds ?? [])}
                >
                  {botonQuitarNoPendientes(p.errorLista?.quitarIds.length ?? 0)}
                </button>
              )}
            </div>
          </div>
        ) : estado.tipo === "vacio_sin_q" || estado.tipo === "vacio_con_q" ? (
          <VacioCandidatos texto={estado.texto} avisos={p.avisos} onVolverABuscar={p.onReintentar} />
        ) : p.avisos.length > 0 ? (
          // Ninguno de la lista queda cubierto: los del monto de la suma que no entraron.
          <VacioCandidatos texto={null} avisos={p.avisos} onVolverABuscar={p.onReintentar} />
        ) : null}
      </div>
      {estado.tipo === "lista" && estado.texto && <p className="text-[11px] text-muted-foreground">{estado.texto}</p>}
      <p className="text-[11px] text-muted-foreground">{notaVentanaSuma(p.dias)}</p>
    </div>
  );
}

/**
 * El paso previo «Crear el gasto con la suma» (paso 4): los cargos con la
 * SUMA DEL API, los POSIBLES DUPLICADOS (mismo monto, ±120 días; debajo, en
 * ámbar, los del mismo monto que no son del universo: en efectivo, ya
 * conciliados…), la nota de que la IA no revisa varios cargos y la casilla
 * OBLIGATORIA, bloqueada hasta que la revisión de duplicados termine bien (si
 * falla: su texto y «Reintentar», jamás «no hay ninguno»). Aquí no se crea ni
 * se liga nada.
 */
export function PasoCrearGastoSuma(p: {
  lista: readonly MovimientoBancario[];
  /** `cargos` del API: la suma, la moneda y las fechas. */
  resumen: CargosResumen;
  propios: readonly CargoConCandidatoPropio[] | null | undefined;
  aliasPorCuenta?: Readonly<Record<string, string>> | null;
  monedaPorCuenta?: Readonly<Record<string, string | null | undefined>> | null;
  duplicados: EstadoDuplicadosSuma;
  confirmado: boolean;
  onConfirmado: (v: boolean) => void;
  onReintentar: () => void;
  /** Sin él (fuera de la selección) no se ofrece «Quitar…». */
  onQuitar?: (ids: string[]) => void;
}) {
  const idCasilla = useId();
  const { duplicados: dup, resumen } = p;
  const n = p.lista.length;
  const avisoFechas = avisoFechasCargos(resumen.fecha_min, resumen.fecha_max);
  return (
    <div className="space-y-3" data-paso-crear-suma="">
      <CargosDelLote
        lista={p.lista}
        resumen={resumen}
        propios={p.propios}
        aliasPorCuenta={p.aliasPorCuenta}
        monedaPorCuenta={p.monedaPorCuenta}
        paraCrear
      />
      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-xs font-medium">{ETIQUETA_DUPLICADOS}</p>
        {dup.tipo === "cargando" ? (
          <p role="status" className="px-3 py-4 text-center text-xs text-muted-foreground">
            {dup.texto}
          </p>
        ) : dup.tipo === "error" ? (
          <div role="alert" data-duplicados-error="" className="space-y-1.5 px-3 py-3 text-center text-xs">
            <p className="text-amber-700 dark:text-amber-300">{dup.texto}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                onClick={p.onReintentar}
              >
                <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
                {BOTON_REINTENTAR}
              </button>
              {p.onQuitar && dup.quitarIds.length > 0 && (
                <button
                  type="button"
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted"
                  onClick={() => p.onQuitar?.(dup.quitarIds)}
                >
                  {botonQuitarNoPendientes(dup.quitarIds.length)}
                </button>
              )}
            </div>
          </div>
        ) : dup.duplicados.length === 0 ? (
          // «No hay ninguno (ni en efectivo, ni ya conciliado)» SOLO si tampoco
          // hay del monto fuera del universo; si los hay, ellos son el aviso.
          <VacioCandidatos
            texto={dup.avisos.length > 0 ? null : TEXTO_SIN_DUPLICADOS}
            avisos={dup.avisos}
            onVolverABuscar={p.onReintentar}
          />
        ) : (
          <>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto">
              {dup.duplicados.map((c) => {
                const ficha = fichaCandidatoGasto(c);
                const desc = descripcionCandidatoSuma(c);
                return (
                  <li key={c.id} data-duplicado-suma="" className="px-3 py-2 text-xs">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{etiquetaCandidatoGasto(ficha)}</span>
                      <BadgeMedioCandidato candidato={c} />
                    </span>
                    {desc && (
                      <span
                        className="block truncate text-muted-foreground"
                        title={tituloDescripcionCandidatoGasto(ficha) ?? undefined}
                      >
                        {desc}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <VacioCandidatos texto={null} avisos={dup.avisos} onVolverABuscar={p.onReintentar} />
          </>
        )}
      </div>
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {NOTA_SIN_IA_SUMA}
      </p>
      <label htmlFor={idCasilla} className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          id={idCasilla}
          type="checkbox"
          checked={p.confirmado}
          onChange={(e) => p.onConfirmado(e.target.checked)}
          disabled={dup.tipo !== "listo"}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
        />
        <span className="font-medium">{casillaCrearSuma(n, resumen.suma, resumen.moneda)}</span>
      </label>
      {avisoFechas && (
        <p role="status" data-aviso-fechas-cargos="" className={CLASE_AVISO_AMBAR}>
          {avisoFechas}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{notaPrellenadoSuma(n)}</p>
    </div>
  );
}
