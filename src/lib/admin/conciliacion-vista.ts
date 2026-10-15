/**
 * Vista de Conciliación: pestaña, cuenta y RANGO DE FECHAS en la URL
 * (12-oct-2026). Todo aquí es PURO (prueba `__tests__/conciliacion-vista.test.ts`).
 *
 * Pedido de oficina: «en /admin/conciliacion necesitamos un filtro de fecha,
 * de tal fecha a tal fecha». El rango vive en la URL (`?desde`/`?hasta`,
 * días de pared Cancún `YYYY-MM-DD`) y es UNO para toda la vista: la lista de
 * movimientos, las tarjetas por cuenta y las pestañas «sin banco» lo aplican,
 * y lo heredan «Cruzar pendientes», «Emparejar devoluciones», «Sugerir con
 * IA», el reporte Excel y la auditoría Paywise (que ya leían `?desde/?hasta`).
 *
 * Sin rango la vista sigue como siempre: todo el historial en la lista (tope
 * del API) y «últimos 90 días» en las pestañas «sin banco».
 */

import { fmtDateOnly } from "@/lib/datetime";
import { fmtInt } from "@/lib/format";
import { diaMas } from "./conciliacion-auto";
import { fmtMontoConciliacion, numeroDe } from "./conciliacion-parcial";
import { esDiaValido, uuidFiltro } from "./url-params";

/**
 * Pestañas de la vista. «omitidos» (14-oct-2026, API 0.0.77, invariante 75)
 * = los movimientos que la oficina omitió de la conciliación con un motivo:
 * la lista la filtra el API (`solo_omitidos`), no el panel.
 */
export type FiltroConciliacion =
  | "todos"
  | "pendientes"
  | "conciliados"
  | "omitidos"
  | "sin_banco"
  | "cobros_sin_banco"
  | "paywise";

export const FILTROS_CONCILIACION: readonly FiltroConciliacion[] = [
  "todos",
  "pendientes",
  "conciliados",
  "omitidos",
  "sin_banco",
  "cobros_sin_banco",
  "paywise",
];

/** `?f=` de la vista: fuera del catálogo ⇒ «todos». */
export function filtroConciliacionDeUrl(f: string | null | undefined): FiltroConciliacion {
  return (FILTROS_CONCILIACION as readonly string[]).includes(f ?? "")
    ? (f as FiltroConciliacion)
    : "todos";
}

/**
 * La pestaña que preselecciona el Reporte Excel (sus 4 estados). «Omitidos»
 * ⇒ «Conciliados» (14-oct-2026): los omitidos SON conciliados (el Excel los
 * marca con estatus «Omitido»); «Cobros sin banco» y Paywise ⇒ «Todos».
 */
export function filtroReporteDeVista(
  filtro: FiltroConciliacion,
): "todos" | "pendientes" | "conciliados" | "sin_banco" {
  if (filtro === "omitidos") return "conciliados";
  if (filtro === "cobros_sin_banco" || filtro === "paywise") return "todos";
  return filtro;
}

export interface RangoVista {
  desde?: string;
  hasta?: string;
}

/** Ventana por default de las pestañas «sin banco» (la misma del API). */
export const DIAS_SIN_BANCO_DEFAULT = 90;

/**
 * Rango de la URL ya VALIDADO para el API (`RE_DIA_CONCILIACION`: solo
 * `YYYY-MM-DD`, nunca un ISO con hora):
 *  - un día que no existe (`2026-13-45`) se IGNORA (regla de `url-params`);
 *  - invertido (dedazo del selector) se corrige en vez de un 400 del API;
 *  - un «hasta» futuro se recorta a HOY y un «desde» futuro se descarta: no
 *    hay movimientos en el futuro y «cobros-sin-banco» responde 400 si
 *    `desde` > `hasta`.
 */
export function rangoVistaConciliacion(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string,
): RangoVista {
  let d = esDiaValido(desde) ? (desde as string) : undefined;
  let h = esDiaValido(hasta) ? (hasta as string) : undefined;
  if (d && h && d > h) [d, h] = [h, d];
  if (h && h > hoy) h = hoy;
  if (d && d > hoy) d = undefined;
  const out: RangoVista = {};
  if (d) out.desde = d;
  if (h) out.hasta = h;
  return out;
}

export function hayRango(r: RangoVista): boolean {
  return !!(r.desde || r.hasta);
}

/**
 * Rango que viaja a `gastos-sin-banco` y `cobros-sin-banco`. Su default es
 * «últimos 90 días» y `cobros-sin-banco` responde 400 si `desde` > `hasta`:
 * con solo `?hasta` (p. ej. un mes de hace medio año) el default del API
 * quedaría DESPUÉS y la pestaña caería en «No se pudo consultar». Por eso con
 * solo «hasta» se manda la misma ventana de 90 días pero anclada a esa fecha.
 */
export function rangoParaSinBanco(r: RangoVista): RangoVista {
  if (r.desde && r.hasta) return { desde: r.desde, hasta: r.hasta };
  if (r.desde) return { desde: r.desde };
  if (r.hasta) return { desde: diaMas(r.hasta, -DIAS_SIN_BANCO_DEFAULT), hasta: r.hasta };
  return {};
}

/** «del 01 oct 2026 al 12 oct 2026» · «desde el …» · «hasta el …» · null sin rango. */
export function textoRangoVista(r: RangoVista): string | null {
  if (r.desde && r.hasta) return `del ${fmtDateOnly(r.desde)} al ${fmtDateOnly(r.hasta)}`;
  if (r.desde) return `desde el ${fmtDateOnly(r.desde)}`;
  if (r.hasta) return `hasta el ${fmtDateOnly(r.hasta)}`;
  return null;
}

/** Ventana que describen las pestañas «sin banco» (espejo de `rangoParaSinBanco`). */
export function textoVentanaSinBanco(r: RangoVista): string {
  if (r.desde && r.hasta) return `del ${fmtDateOnly(r.desde)} al ${fmtDateOnly(r.hasta)}`;
  if (r.desde) return `desde el ${fmtDateOnly(r.desde)}`;
  if (r.hasta) return `${DIAS_SIN_BANCO_DEFAULT} días hasta el ${fmtDateOnly(r.hasta)}`;
  return `últimos ${DIAS_SIN_BANCO_DEFAULT} días`;
}

/**
 * Las pestañas «Gastos sin banco» y «Cobros sin banco» cuando su lista NO se
 * pudo leer (14-oct-2026). Regla del proyecto: jamás «sin datos» cuando la
 * carga falló — una lista de dinero vacía porque el API no contestó lleva a
 * capturar dos veces o a dar por cerrado lo que falta. Hasta hoy «Gastos sin
 * banco» pintaba la tabla VACÍA (la página atrapa el fallo con null y montaba
 * la tabla con cero filas); «Cobros sin banco» ya lo decía. Lo pinta
 * `AvisoListaSinBancoNoCargo` en las dos, con «Reintentar».
 */
export const MSG_LISTA_SIN_BANCO_NO_CARGO =
  "No se pudo consultar la lista (el API no respondió). Pulsa «Reintentar» o recarga la página.";
export const BOTON_REINTENTAR_LISTA = "Reintentar";
export const TEXTO_REINTENTANDO_LISTA = "Reintentando…";

/**
 * Nota cuando la lista llegó al tope del API y hay más movimientos de los
 * que se ven: acotar el periodo es la salida. null si se ven todos.
 */
export function textoListaRecortada(mostrados: number, total: number): string | null {
  if (!(total > mostrados) || mostrados <= 0) return null;
  return `Se muestran los ${fmtInt(mostrados)} movimientos más recientes de ${fmtInt(total)}. Acota el periodo con «Desde» y «Hasta» para ver los demás.`;
}

/**
 * CARGA COMPLETA de la lista de movimientos (13-oct-2026). Pedido de la
 * oficina con la captura «Se muestran los 300 movimientos más recientes de
 * 782»: «¿tenemos una forma de no limitar a los 300?». La bandeja pedía UNA
 * página de 300 y la búsqueda rápida de la tabla (que filtra en el navegador)
 * no encontraba lo que quedaba fuera — «aircra» de agosto, por ejemplo.
 *
 * Por qué NO se pagina con `offset`: el API ordena por `fecha desc,
 * created_at desc` y una importación inserta su estado de cuenta en UN lote
 * (mismo `created_at`): hay cientos de empates, y con `LIMIT/OFFSET` el orden
 * de los empates puede cambiar entre una página y la siguiente (Postgres arma
 * cada página con otro top-N) ⇒ filas REPETIDAS o SALTADAS en silencio. Se
 * pagina por VENTANA DE FECHA: cada página pide `hasta` = la fecha más vieja
 * que trajo la anterior (INCLUSIVA, así ningún movimiento de ese día se
 * pierde) y lo que ya llegó se descarta por `id`. Es exacto mientras ningún
 * día tenga más movimientos que una página (500; hoy el día más cargado no
 * llega a 60): si pasa, se corta y se DICE (`truncado`), nunca en silencio.
 */
/** = `@Max(500)` de `ListConciliacionQuery.limit` en el API. */
export const PAGINA_MOVIMIENTOS_API = 500;
/** Tope de la vista: la tabla recibe las filas completas (payload RSC). */
export const TOPE_MOVIMIENTOS_VISTA = 2000;

export interface PasoPaginaMovimientos<T> {
  /** Movimientos únicos acumulados, en el orden del API (fecha desc). */
  filas: T[];
  /** `hasta` (YYYY-MM-DD) de la siguiente página; null = ya no se pide más. */
  siguienteHasta: string | null;
  /** true = se cortó antes de traer TODO (tope, o un día con más de una página). */
  truncado: boolean;
}

/**
 * Suma una página al acumulado y decide la siguiente (PURA). `total` = el
 * `count` de la PRIMERA respuesta (el universo de la vista); `hastaPedido` =
 * el `hasta` con que se pidió ESTA página (null = sin `hasta`).
 */
export function fusionarPaginaMovimientos<T extends { id: string; fecha: string }>(
  acumulado: readonly T[],
  pagina: readonly T[],
  opts: { limite: number; tope: number; total: number; hastaPedido: string | null },
): PasoPaginaMovimientos<T> {
  const vistos = new Set(acumulado.map((m) => m.id));
  const filas = [...acumulado];
  for (const m of pagina) {
    if (vistos.has(m.id)) continue;
    vistos.add(m.id);
    filas.push(m);
  }
  if (filas.length >= opts.tope) {
    return {
      filas: filas.slice(0, opts.tope),
      siguienteHasta: null,
      truncado: Math.max(opts.total, filas.length) > opts.tope,
    };
  }
  // Todo lo que dijo el API ya está, o la página vino incompleta: no hay más.
  if (filas.length >= opts.total || pagina.length < opts.limite) {
    return { filas, siguienteHasta: null, truncado: false };
  }
  let masVieja: string | null = null;
  for (const m of pagina) {
    const dia = String(m.fecha ?? "").slice(0, 10);
    if (esDiaValido(dia) && (masVieja === null || dia < masVieja)) masVieja = dia;
  }
  // Sin avance: la página entera es del día que ya se pidió (más movimientos
  // en un día que una página) o no trajo nada nuevo. No se adivina: se corta.
  const sinAvance =
    masVieja === null ||
    filas.length === acumulado.length ||
    (opts.hastaPedido !== null && masVieja >= opts.hastaPedido);
  if (sinAvance) return { filas, siguienteHasta: null, truncado: true };
  return { filas, siguienteHasta: masVieja, truncado: false };
}

/**
 * Prefijo de la tabla de movimientos (`DataTable`): su búsqueda rápida vive
 * en `?mvq=` y su página en `?mvp=` (la página tiene dos tablas).
 */
export const SYNC_ID_MOVIMIENTOS = "mv";
/** La búsqueda que la tabla RESTAURA al montar (`${syncId}q`). */
export const PARAM_BUSQUEDA_MOVIMIENTOS = `${SYNC_ID_MOVIMIENTOS}q`;
/** Tope del texto de búsqueda que viaja en la URL (el mismo del buscador). */
const LARGO_MAX_BUSCAR = 80;

/**
 * ENFOQUE desde Gastos (13-oct-2026, «conciliación al revés»): `?mov=` = el
 * movimiento que se abrió desde la hoja «Conciliación con el banco» (va
 * PRIMERO y resaltado) y `?gasto=` = el gasto que se viene a ver (su línea
 * del lote se resalta). `gasto` tiene el MISMO nombre y significado que en
 * `/admin/reportes/balance`. Los dos se validan con `uuidFiltro`.
 */
export const PARAM_MOVIMIENTO_FOCO = "mov";
export const PARAM_GASTO_FOCO = "gasto";
/**
 * `?cobro=` (15-oct-2026, API 0.0.78, conciliación al revés de una ENTRADA):
 * el cobro que se viene a ver desde la hoja de Ingresos o de la tarjeta de
 * cobros; su línea dentro del lote del abono se resalta (como `?gasto=`).
 */
export const PARAM_COBRO_FOCO = "cobro";
/** El anillo de la fila enfocada: el MISMO de «Por facturar». */
export const CLASE_FILA_ENFOCADA = "ring-2 ring-inset ring-amber-400 bg-amber-500/5";
/** La línea del gasto que se abrió dentro del lote del cargo. */
export const CLASE_LINEA_ENFOCADA = "rounded-sm bg-amber-500/10 font-semibold ring-1 ring-amber-400/60";
export const SUFIJO_GASTO_ENFOCADO = " · el que abriste";
export const TEXTO_MOVIMIENTO_NO_ENCONTRADO =
  "No encontramos en esta vista el cargo que abriste desde Gastos: puede estar en otra cuenta u otras fechas, o ya lo desvincularon. Quita los filtros para buscarlo.";
/** Sin `?gasto=` (se llegó desde la hoja de una ENTRADA: un abono). */
export const TEXTO_MOVIMIENTO_NO_ENCONTRADO_GENERICO =
  "No encontramos en esta vista el movimiento que abriste: puede estar en otra cuenta u otras fechas, o ya lo desvincularon. Quita los filtros para buscarlo.";

/** El aviso de «no está en esta vista»: con `?gasto=` el de Gastos (de siempre); si no, el genérico. */
export function textoMovimientoNoEncontrado(enfoque: { gasto?: string | null }): string {
  return enfoque.gasto ? TEXTO_MOVIMIENTO_NO_ENCONTRADO : TEXTO_MOVIMIENTO_NO_ENCONTRADO_GENERICO;
}
export const ETIQUETA_QUITAR_RESALTADO = "Quitar resaltado";
export const ETIQUETA_VER_TODOS_MOVIMIENTOS = "Ver todos los movimientos";

/**
 * URL de la vista (FUENTE ÚNICA): pestaña + cuenta + rango. «todos», una
 * cuenta vacía y un rango vacío quedan FUERA de la URL (default limpio).
 * ADITIVOS del 13-oct-2026 (sin ellos la URL es byte a byte la de antes),
 * al final y en este orden:
 *  - `mov` / `gasto`: el enfoque desde Gastos (solo si son uuid);
 *  - `cobro` (15-oct-2026): el cobro que se viene a ver desde la hoja de una
 *    entrada (solo si es uuid);
 *  - `buscar`: prellena la búsqueda rápida de la tabla (`?mvq=`, recortada a
 *    80). La tabla la lee AL MONTAR, por eso estas ligas se abren en una
 *    pestaña nueva (el chip «Factura 7360», «Buscar el cargo»).
 */
export function hrefConciliacion(v: {
  f?: string | null;
  cuenta?: string | null;
  desde?: string | null;
  hasta?: string | null;
  mov?: string | null;
  gasto?: string | null;
  cobro?: string | null;
  buscar?: string | null;
}): string {
  const q = new URLSearchParams();
  const f = filtroConciliacionDeUrl(v.f);
  if (f !== "todos") q.set("f", f);
  if (v.cuenta) q.set("cuenta", v.cuenta);
  if (v.desde) q.set("desde", v.desde);
  if (v.hasta) q.set("hasta", v.hasta);
  const mov = uuidFiltro(v.mov);
  if (mov) q.set(PARAM_MOVIMIENTO_FOCO, mov);
  const gasto = uuidFiltro(v.gasto);
  if (gasto) q.set(PARAM_GASTO_FOCO, gasto);
  const cobro = uuidFiltro(v.cobro);
  if (cobro) q.set(PARAM_COBRO_FOCO, cobro);
  const buscar = typeof v.buscar === "string" ? v.buscar.trim().slice(0, LARGO_MAX_BUSCAR).trim() : "";
  if (buscar) q.set(PARAM_BUSQUEDA_MOVIMIENTOS, buscar);
  const qs = q.toString();
  return qs ? `/admin/conciliacion?${qs}` : "/admin/conciliacion";
}

/** `?mov=` / `?gasto=` / `?cobro=` de la URL, validados (uuid) y en minúsculas; lo demás ⇒ null. */
export function enfoqueConciliacionDeUrl(sp: {
  mov?: string | null;
  gasto?: string | null;
  cobro?: string | null;
}): { mov: string | null; gasto: string | null; cobro: string | null } {
  const mov = uuidFiltro(sp?.mov ?? undefined);
  const gasto = uuidFiltro(sp?.gasto ?? undefined);
  const cobro = uuidFiltro(sp?.cobro ?? undefined);
  return {
    mov: mov ? mov.toLowerCase() : null,
    gasto: gasto ? gasto.toLowerCase() : null,
    cobro: cobro ? cobro.toLowerCase() : null,
  };
}

/**
 * La fila ENFOCADA va PRIMERO (una copia; las demás no se mueven): así queda
 * en la página 1 con cualquier tamaño de página, sin tocar `DataTable`. Sin
 * foco o si no está en la vista ⇒ el MISMO arreglo y `encontrado` false.
 */
export function filasConFoco<T extends { id: string }>(
  filas: T[],
  foco: string | null | undefined,
): { filas: T[]; encontrado: boolean } {
  if (!foco) return { filas, encontrado: false };
  const i = filas.findIndex((f) => f.id.toLowerCase() === foco.toLowerCase());
  if (i < 0) return { filas, encontrado: false };
  if (i === 0) return { filas, encontrado: true };
  return { filas: [filas[i], ...filas.slice(0, i), ...filas.slice(i + 1)], encontrado: true };
}

/**
 * La franja de la fila enfocada, por `m.tipo`: un CARGO (desde Gastos) ⇒
 * «Primero en la lista y resaltado: el cargo del 30 sep 2026 por $11,205.60
 * (EJE SCOTIA) que abriste desde Gastos.» (el de siempre); un ABONO (desde la
 * hoja de una entrada de dinero, 15-oct-2026) ⇒ «Primero en la lista y
 * resaltado: el abono del 15 sep 2026 por $69,183.00 (EJE SCOTIA) que
 * abriste.».
 */
export function textoMovimientoEnfocado(
  m: { fecha: string; monto: string | number; tipo?: string | null },
  alias?: string | null,
): string {
  const cuenta = (alias ?? "").trim();
  const abono = m.tipo === "ABONO";
  return `Primero en la lista y resaltado: el ${abono ? "abono" : "cargo"} del ${fmtDateOnly(m.fecha)} por ${fmtMontoConciliacion(
    Math.abs(numeroDe(m.monto)),
  )}${cuenta ? ` (${cuenta})` : ""} que abriste${abono ? "" : " desde Gastos"}.`;
}

/** Periodos rápidos del filtro (mismos cortes que Ingresos): días Cancún. */
export function periodosRapidosConciliacion(
  hoy: string,
): Array<{ clave: string; etiqueta: string; desde: string; hasta: string }> {
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMesAnterior = diaMas(inicioMes, -1);
  const inicioMesAnterior = `${finMesAnterior.slice(0, 7)}-01`;
  return [
    { clave: "mes", etiqueta: "Este mes", desde: inicioMes, hasta: hoy },
    { clave: "anterior", etiqueta: "Mes anterior", desde: inicioMesAnterior, hasta: finMesAnterior },
    {
      clave: "90",
      etiqueta: `Últimos ${DIAS_SIN_BANCO_DEFAULT} días`,
      desde: diaMas(hoy, -DIAS_SIN_BANCO_DEFAULT),
      hasta: hoy,
    },
  ];
}
