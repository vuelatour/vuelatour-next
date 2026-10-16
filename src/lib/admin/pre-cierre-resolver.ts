/**
 * «Resolver →» del pre-cierre que MARCA EN ÁMBAR lo que hay que resolver
 * (PEDIDO 2 del cliente, 15-oct-2026): «el botón de Resolver estaría genial
 * que te marque bien lo que se debe resolver en amarillo, para poder saber
 * dónde atacar».
 *
 * Mecánica (todo PURO; prueba `__tests__/pre-cierre-resolver.test.ts`):
 *  1. La card del pre-cierre arma el «Resolver →» de cada renglón con la
 *     pantalla destino DE SIEMPRE (su filtro + su periodo) y le ANEXA el foco:
 *     `pc` (clave), `pcn` (count del API), `pcp` (periodo), `pct`/`pcd`
 *     (título y detalle, recortados) e `ids` (los registros que el API contó,
 *     ≤ `TOPE_IDS_URL`).
 *  2. La pantalla destino lee el foco con `leerFocoPreCierre` (VALIDADO: un
 *     `pc` basura o un id que no es uuid se ignoran, jamás un 400), pone esas
 *     filas PRIMERO (`filasResaltadasPrimero`) y las pinta con la MISMA marca
 *     ámbar de la fila enfocada de Conciliación / Facturas emitidas
 *     (`CLASE_FILA_RESALTADA`), y monta la franja `FranjaPreCierre` arriba.
 *  3. NADA se resuelve solo: es solo lectura (resaltar y ordenar).
 *
 * El API decide qué se cuenta; el panel solo pinta. «N por resolver» sale del
 * `count` del renglón; «M en esta vista» es cuántos de los ids que viajaron SÍ
 * están en la lista que se pintó. Los 6 parámetros son SOLO del panel: ninguna
 * consulta al API los reenvía.
 */

import { periodoDefaultVista } from "./balance-vista";
import { CLASE_FILA_ENFOCADA, ETIQUETA_QUITAR_RESALTADO } from "./conciliacion-vista";
import { esDiaValido, esUuid, uuidFiltro } from "./url-params";

// ── Constantes ─────────────────────────────────────────────────────────────

export const PARAM_PC = "pc"; // clave del renglón
export const PARAM_IDS = "ids"; // uuids separados por coma (≤ TOPE_IDS_URL)
export const PARAM_CONTEO = "pcn"; // count del renglón (entero ≥ 0)
export const PARAM_TITULO = "pct"; // item.titulo (≤ MAX_TITULO_URL)
export const PARAM_DETALLE = "pcd"; // item.detalle (≤ MAX_DETALLE_URL)
export const PARAM_PERIODO = "pcp"; // "YYYY-MM-DD,YYYY-MM-DD" (desde,hasta del pre-cierre)
export const PARAMS_FOCO_PRE_CIERRE = [
  PARAM_PC,
  PARAM_IDS,
  PARAM_CONTEO,
  PARAM_TITULO,
  PARAM_DETALLE,
  PARAM_PERIODO,
] as const;
export const TOPE_IDS_URL = 100;
export const MAX_TITULO_URL = 120;
export const MAX_DETALLE_URL = 400;
/** La MISMA marca ámbar de la fila enfocada (Conciliación `?mov=`, Facturas `?resaltar=`). */
export const CLASE_FILA_RESALTADA = CLASE_FILA_ENFOCADA;
export const ANCLA_PRE_CIERRE = "pre-cierre";
/** `pc` válido: minúsculas, dígitos y guion bajo, 3–60 (todas las claves del API cumplen). */
export const RE_CLAVE_PRE_CIERRE = /^[a-z][a-z0-9_]{2,59}$/;

// ── Textos (exactos, congelados en la prueba) ─────────────────────────────

export const PREFIJO_FRANJA_PRE_CIERRE = "Del pre-cierre:";
export const TITULO_FRANJA_GENERICO = "Pendiente del pre-cierre";
export const ETIQUETA_VOLVER_PRE_CIERRE = "Volver al pre-cierre →";
export { ETIQUETA_QUITAR_RESALTADO }; // "Quitar resaltado" (la de Conciliación)
export const NOTA_VISTA_TACO_LIVE =
  "Tacómetros en vivo muestra un día a la vez: aquí se resaltan los vuelos de este día; los de otros días se abren desde el pre-cierre (cada folio) o cambiando la fecha.";
export const NOTA_VISTA_MES =
  "Esta pantalla muestra un mes completo; si el periodo del pre-cierre no es un mes, puede haber renglones de más o de menos.";

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface PeriodoPreCierre {
  desde: string;
  hasta: string;
}

export interface FocoPreCierre {
  /** Validada con `RE_CLAVE_PRE_CIERRE` ("" = sin foco). */
  clave: string;
  /** uuids válidos, minúsculas, sin repetidos (al leer la URL: ≤ TOPE_IDS_URL). */
  ids: string[];
  /** `pcn`; null si no vino o no es entero ≥ 0. */
  count: number | null;
  /** `pct` recortado (trim); null si vacío. */
  titulo: string | null;
  /** `pcd` recortado (trim); null si vacío. */
  detalle: string | null;
  /** `pcp` válido (dos días que existen; invertido se corrige). */
  periodo: PeriodoPreCierre | null;
  /** true = había más de TOPE_IDS_URL: viaja solo el conteo (sin ids). */
  truncado: boolean;
}

/**
 * El renglón del pre-cierre tal como lo manda el API: TODO opcional
 * (tolerancia a cualquier versión del API).
 */
export interface ItemPreCierreResolver {
  clave: string;
  titulo?: string | null;
  detalle?: string | null;
  count?: number | null;
  informativo?: boolean;
  /** El API NO pudo leer el dato (count 0 que no significa «no hay»). */
  lectura_fallida?: boolean;
  ids?: unknown;
  ids_truncado?: unknown;
  vuelos?: ReadonlyArray<{ id?: unknown }> | null;
  cobros?: ReadonlyArray<{ id?: unknown }> | null;
  ligas?: ReadonlyArray<{ movimiento_id?: unknown }> | null;
  grupos?: ReadonlyArray<{ grupo_id?: unknown }> | null;
  sobres?: ReadonlyArray<{ grupo_id?: unknown }> | null;
  /** `socio` puede venir como objeto `{ id, … }`, como texto o null (tolerado). */
  socios?: ReadonlyArray<{ socio?: unknown }> | null;
}

type ParamsUrl = Record<string, string | string[] | undefined>;

// ── Utilidades internas ───────────────────────────────────────────────────

/** uuids válidos, en minúsculas, sin repetidos, en su orden. */
function limpiarIds(valores: ReadonlyArray<unknown>): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of valores) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!esUuid(s)) continue;
    const id = s.toLowerCase();
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(id);
  }
  return out;
}

/** Recorta a `max` caracteres (contando la «…» final). */
function recortar(texto: string, max: number): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function textoONull(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const t = recortar(valor, max);
  return t ? t : null;
}

function enteroNoNegativo(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isInteger(valor) && valor >= 0 ? valor : null;
  }
  if (typeof valor === "string" && /^\d{1,9}$/.test(valor.trim())) {
    return Number(valor.trim());
  }
  return null;
}

function periodoValido(desde: unknown, hasta: unknown): PeriodoPreCierre | null {
  if (typeof desde !== "string" || typeof hasta !== "string") return null;
  if (!esDiaValido(desde) || !esDiaValido(hasta)) return null;
  return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
}

function idDeSocio(socio: unknown): unknown {
  return socio && typeof socio === "object" ? (socio as { id?: unknown }).id : undefined;
}

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

// ── Del renglón a la URL ──────────────────────────────────────────────────

/**
 * Ids del renglón, en este orden de preferencia (la primera fuente que tenga
 * algún uuid válido): item.ids → vuelos[].id → cobros[].id →
 * ligas[].movimiento_id → grupos[].grupo_id → sobres[].grupo_id →
 * socios[].socio.id → []. Filtra con `esUuid`, minúsculas, dedupe, conserva
 * el orden. Nunca inventa.
 */
export function idsDeItemPreCierre(item: ItemPreCierreResolver): string[] {
  const fuentes: Array<() => ReadonlyArray<unknown>> = [
    () => (Array.isArray(item.ids) ? (item.ids as unknown[]) : []),
    () => (item.vuelos ?? []).map((v) => v?.id),
    () => (item.cobros ?? []).map((c) => c?.id),
    () => (item.ligas ?? []).map((l) => l?.movimiento_id),
    () => (item.grupos ?? []).map((g) => g?.grupo_id),
    () => (item.sobres ?? []).map((s) => s?.grupo_id),
    () => (item.socios ?? []).map((s) => idDeSocio(s?.socio)),
  ];
  for (const fuente of fuentes) {
    const ids = limpiarIds(fuente());
    if (ids.length > 0) return ids;
  }
  return [];
}

/** Foco de un renglón; `truncado` = más ids de los que caben en la URL. */
export function focoDeItem(item: ItemPreCierreResolver, periodo: PeriodoPreCierre): FocoPreCierre {
  const clave = typeof item.clave === "string" && RE_CLAVE_PRE_CIERRE.test(item.clave) ? item.clave : "";
  const ids = idsDeItemPreCierre(item);
  return {
    clave,
    ids,
    count: enteroNoNegativo(item.count),
    titulo: textoONull(item.titulo, MAX_TITULO_URL),
    detalle: textoONull(item.detalle, MAX_DETALLE_URL),
    periodo: periodoValido(periodo?.desde, periodo?.hasta),
    // `ids_truncado` del API (más de 500) implica más de 100: también aquí.
    truncado: ids.length > TOPE_IDS_URL || item.ids_truncado === true,
  };
}

/**
 * Anexa los params del foco a un href (respeta un `?` existente y deja el
 * `#hash` al final), en este orden fijo: pc, pcn, pcp, pct, pcd, ids. `ids`
 * viaja SOLO si 1 ≤ length ≤ TOPE_IDS_URL (con más, viaja solo `pcn`).
 * Un foco sin clave deja el href intacto.
 */
export function anexarFocoPreCierre(href: string, foco: FocoPreCierre): string {
  if (!foco.clave || !RE_CLAVE_PRE_CIERRE.test(foco.clave)) return href;
  const iHash = href.indexOf("#");
  const base = iHash >= 0 ? href.slice(0, iHash) : href;
  const hash = iHash >= 0 ? href.slice(iHash) : "";
  const partes: string[] = [`${PARAM_PC}=${foco.clave}`];
  const n = enteroNoNegativo(foco.count);
  if (n !== null) partes.push(`${PARAM_CONTEO}=${n}`);
  const p = foco.periodo ? periodoValido(foco.periodo.desde, foco.periodo.hasta) : null;
  if (p) partes.push(`${PARAM_PERIODO}=${p.desde},${p.hasta}`);
  const titulo = textoONull(foco.titulo, MAX_TITULO_URL);
  if (titulo) partes.push(`${PARAM_TITULO}=${encodeURIComponent(titulo)}`);
  const detalle = textoONull(foco.detalle, MAX_DETALLE_URL);
  if (detalle) partes.push(`${PARAM_DETALLE}=${encodeURIComponent(detalle)}`);
  const ids = limpiarIds(foco.ids);
  if (ids.length >= 1 && ids.length <= TOPE_IDS_URL) partes.push(`${PARAM_IDS}=${ids.join(",")}`);
  const sep = base.includes("?") ? (base.endsWith("?") || base.endsWith("&") ? "" : "&") : "?";
  return `${base}${sep}${partes.join("&")}${hash}`;
}

/**
 * «Resolver →» de un renglón: sin destino ⇒ null; un renglón INFORMATIVO o
 * con la lectura FALLIDA ⇒ el destino tal cual (no hay nada que resaltar, y
 * una franja diría «0 por resolver» de algo que no se pudo verificar); si no,
 * el destino + foco.
 */
export function hrefResolverItem(
  item: ItemPreCierreResolver,
  periodo: PeriodoPreCierre,
  baseHref: string | null | undefined,
): string | null {
  if (!baseHref) return null;
  if (item.informativo === true || item.lectura_fallida === true) return baseHref;
  return anexarFocoPreCierre(baseHref, focoDeItem(item, periodo));
}

// ── En la pantalla destino ────────────────────────────────────────────────

/**
 * Lee y VALIDA el foco de la URL de una pantalla destino (`sp` = searchParams
 * ya resueltos; un valor en arreglo toma el primero). `pc` inválido ⇒ null (no
 * hay foco). ids: split(","), uuid cada uno, minúsculas, dedupe, corte a
 * TOPE_IDS_URL. pcn: entero ≥ 0 o null. pcp: dos días válidos (si no, null;
 * «Volver al pre-cierre» cae entonces en el periodo default).
 */
export function leerFocoPreCierre(sp: ParamsUrl | null | undefined): FocoPreCierre | null {
  if (!sp) return null;
  const clave = primero(sp[PARAM_PC]);
  if (typeof clave !== "string" || !RE_CLAVE_PRE_CIERRE.test(clave)) return null;
  const crudos = (primero(sp[PARAM_IDS]) ?? "").split(",").map((s) => uuidFiltro(s.trim()));
  const ids = limpiarIds(crudos).slice(0, TOPE_IDS_URL);
  const count = enteroNoNegativo(primero(sp[PARAM_CONTEO]));
  const pcp = (primero(sp[PARAM_PERIODO]) ?? "").split(",");
  const periodo = pcp.length === 2 ? periodoValido(pcp[0].trim(), pcp[1].trim()) : null;
  return {
    clave,
    ids,
    count,
    titulo: textoONull(primero(sp[PARAM_TITULO]), MAX_TITULO_URL),
    detalle: textoONull(primero(sp[PARAM_DETALLE]), MAX_DETALLE_URL),
    periodo,
    truncado: ids.length === 0 && count !== null && count > TOPE_IDS_URL,
  };
}

/**
 * Las filas cuyo id está en `ids` van PRIMERO (en el orden de `ids`), las
 * demás conservan su orden. Sin ids, o sin ninguna en la vista ⇒ el MISMO
 * arreglo y `encontrados` 0. Generaliza `filasConFoco` a un conjunto.
 * `encontrados` = cuántos ids distintos SÍ están en la lista.
 */
export function filasResaltadasPrimero<T>(
  filas: readonly T[],
  ids: readonly string[],
  idDe: (f: T) => string,
): { filas: T[]; encontrados: number } {
  if (ids.length === 0) return { filas: filas as T[], encontrados: 0 };
  const orden = new Map<string, number>();
  ids.forEach((id, i) => {
    const k = id.toLowerCase();
    if (!orden.has(k)) orden.set(k, i);
  });
  const arriba: Array<{ fila: T; i: number; pos: number }> = [];
  const resto: T[] = [];
  const hallados = new Set<string>();
  filas.forEach((fila, pos) => {
    const id = idDe(fila);
    const k = typeof id === "string" ? id.toLowerCase() : "";
    const i = orden.get(k);
    if (i === undefined) {
      resto.push(fila);
    } else {
      arriba.push({ fila, i, pos });
      hallados.add(k);
    }
  });
  if (arriba.length === 0) return { filas: filas as T[], encontrados: 0 };
  arriba.sort((a, b) => a.i - b.i || a.pos - b.pos);
  return { filas: [...arriba.map((a) => a.fila), ...resto], encontrados: hallados.size };
}

/** Set en minúsculas para `rowClassName`. */
export function conjuntoResaltado(
  foco: { ids: readonly string[] } | readonly string[] | null | undefined,
): ReadonlySet<string> {
  if (!foco) return new Set();
  const ids = Array.isArray(foco) ? (foco as readonly string[]) : (foco as { ids: readonly string[] }).ids;
  return new Set((ids ?? []).filter((s) => typeof s === "string").map((s) => s.toLowerCase()));
}

/** `CLASE_FILA_RESALTADA` si el id está en el conjunto; si no, undefined. */
export function claseFilaResaltada(
  resaltados: ReadonlySet<string>,
  id: string | null | undefined,
): string | undefined {
  if (!id || resaltados.size === 0) return undefined;
  return resaltados.has(id.toLowerCase()) ? CLASE_FILA_RESALTADA : undefined;
}

/**
 * Texto del conteo de la franja. N = count (o el largo de ids), K = ids que
 * viajaron, M = `encontrados` (null ⇒ la pantalla no es una lista o no resalta).
 */
export function textoConteoResolver(foco: FocoPreCierre, encontrados: number | null): string {
  const k = foco.ids.length;
  const n = foco.count ?? k;
  const base = `${n} por resolver`;
  if (encontrados === null || (k === 0 && !foco.truncado)) return base;
  if (k === 0) {
    return `${base} · son más de ${TOPE_IDS_URL}: no se resaltan uno por uno; revisa la lista con los filtros del periodo`;
  }
  const m = Math.max(0, Math.min(encontrados, k));
  if (m === 0) {
    return `${base} · ninguno está en esta vista (cambia los filtros, o quizá ya se resolvieron)`;
  }
  const faltan = k - m;
  const cola =
    faltan === 0
      ? ""
      : faltan === 1
        ? " · 1 ya no está en esta vista (quizá ya se resolvió)"
        : ` · ${faltan} ya no están en esta vista (quizá ya se resolvieron)`;
  return `${base} · ${m} en esta vista${cola}`;
}

/** La URL actual sin los 6 params del foco (conserva todo lo demás, sin hash). */
export function hrefQuitarResaltado(pathname: string, sp: ParamsUrl | null | undefined): string {
  const fuera = new Set<string>(PARAMS_FOCO_PRE_CIERRE);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (fuera.has(k) || v === undefined) continue;
    for (const valor of Array.isArray(v) ? v : [v]) q.append(k, valor);
  }
  const qs = q.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** `/admin/reportes?desde=…&hasta=…#pre-cierre` con el periodo del foco o el default (mes en curso). */
export function hrefVolverPreCierre(foco: FocoPreCierre, hoy: string): string {
  const p = foco.periodo ?? periodoDefaultVista(hoy);
  return `/admin/reportes?desde=${p.desde}&hasta=${p.hasta}#${ANCLA_PRE_CIERRE}`;
}
