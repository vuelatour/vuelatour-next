/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» entre cotizaciones — 24-sep-2026.
 *
 * Pedido de Itzi (audio): «ya le piqué al vuelo del 20 de septiembre. Y si
 * hay una flechita arriba, pues me brinca el siguiente vuelito, ya sea de ese
 * mismo día o … hasta el siguiente día … estando adentro de la cotización me
 * pueda brincar a la siguiente».
 *
 * Quién decide QUÉ vuelo es el vecino: el API (`GET /v1/quotes/:id/vecinos`,
 * orden cronológico por fecha de vuelo con empate por folio, MISMOS filtros
 * que la lista). Aquí solo vive lo del panel, todo PURO (prueba
 * `__tests__/quote-navegacion.test.ts`):
 *  - qué filtros de la lista viajan al detalle y cómo se escriben en la URL
 *    (la lista y el detalle leen la MISMA función: si divergen, la flecha
 *    recorre otra cosa que la lista de donde vino);
 *  - los textos de las flechas («#341 · 27 sep · Maqar»);
 *  - cuándo una tecla ←/→ es un atajo y cuándo es del campo que tiene el foco.
 */

import { fechaCortaCancun } from "./facturas-emitidas";
import { estadoFiltro, uuidFiltro } from "./url-params";
import type { QuoteVecino } from "@/types/quote-vecinos";
import type { EstadoVuelo } from "@/types/quotes-persisted";

/**
 * Filtros de la BARRA de la lista de cotizaciones que respetan las flechas.
 * La búsqueda rápida LOCAL de la tabla (`tq`) NO está aquí: filtra en el
 * navegador sobre lo ya cargado y el API no la conoce.
 */
export const FILTROS_LISTA = ["estado", "cliente_id", "q", "grupo_id"] as const;
export type FiltroLista = (typeof FILTROS_LISTA)[number];

export interface FiltrosListaCotizaciones {
  estado?: EstadoVuelo;
  cliente_id?: string;
  q?: string;
  grupo_id?: string;
}

/** Tope del texto de búsqueda que viaja en la URL de las flechas. */
export const Q_MAX = 100;

type ParamsDeUrl = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Filtros de la lista YA VALIDADOS desde los `searchParams` de Next (mismas
 * reglas que `lib/admin/url-params.ts`): un estado fuera del catálogo o un id
 * que no es uuid se IGNORAN (no se mandan al API, que respondería 400);
 * `q` se recorta y se topa a `Q_MAX`. Lo que queda vacío no viaja.
 */
export function filtrosListaDeParams(sp: ParamsDeUrl): FiltrosListaCotizaciones {
  const f: FiltrosListaCotizaciones = {};
  const estado = estadoFiltro(primero(sp.estado));
  if (estado) f.estado = estado;
  const cliente = uuidFiltro(primero(sp.cliente_id));
  if (cliente) f.cliente_id = cliente;
  const grupo = uuidFiltro(primero(sp.grupo_id));
  if (grupo) f.grupo_id = grupo;
  const q = (primero(sp.q) ?? "").trim().slice(0, Q_MAX).trim();
  if (q) f.q = q;
  return f;
}

/**
 * Query string (SIN «?») de los filtros, en el orden fijo de `FILTROS_LISTA`
 * para que la misma combinación produzca siempre la misma URL. Vacío si no
 * hay filtros.
 */
export function qsFiltrosLista(f: FiltrosListaCotizaciones): string {
  const sp = new URLSearchParams();
  for (const k of FILTROS_LISTA) {
    const v = f[k];
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

/** Liga al detalle de una cotización conservando los filtros de la lista. */
export function hrefCotizacion(id: string, qs: string): string {
  return qs ? `/admin/quotes/${id}?${qs}` : `/admin/quotes/${id}`;
}

/** Liga de regreso a la lista con los mismos filtros. */
export function hrefListaCotizaciones(qs: string): string {
  return qs ? `/admin/quotes?${qs}` : "/admin/quotes";
}

/** «#341 · 27 sep» (fecha del vuelo en hora Cancún). */
export function textoCortoVecino(v: Pick<QuoteVecino, "folio" | "fecha_vuelo">): string {
  const fecha = fechaCortaCancun(v.fecha_vuelo);
  return fecha ? `#${v.folio} · ${fecha}` : `#${v.folio}`;
}

/** «#341 · 27 sep · Maqar» (sin cliente, sin la última parte; nunca «null»). */
export function textoVecino(v: QuoteVecino): string {
  const cliente = v.cliente_nombre?.trim();
  return cliente ? `${textoCortoVecino(v)} · ${cliente}` : textoCortoVecino(v);
}

export type DireccionFlecha = "anterior" | "siguiente";

/** Explicación de las flechas apagadas cuando la cotización no tiene fecha. */
export const MSG_SIN_FECHA =
  "Esta cotización no tiene fecha de vuelo: ponle fecha para brincar entre vuelos.";

/**
 * Tooltip / `aria-label` de una flecha. Con vecino dice ADÓNDE lleva («Vuelo
 * siguiente: #341 · 27 sep · Maqar»); sin vecino dice POR QUÉ está apagada.
 * `conFiltros` distingue «no hay más» de «no hay más con estos filtros».
 */
export function tituloFlecha(
  dir: DireccionFlecha,
  vecino: QuoteVecino | null,
  opts: { sinFecha?: boolean; conFiltros?: boolean } = {},
): string {
  if (opts.sinFecha) return MSG_SIN_FECHA;
  const nombre = dir === "anterior" ? "Vuelo anterior" : "Vuelo siguiente";
  if (vecino) return `${nombre}: ${textoVecino(vecino)}`;
  const cual = dir === "anterior" ? "un vuelo anterior" : "un vuelo siguiente";
  return opts.conFiltros
    ? `No hay ${cual} con estos filtros`
    : `No hay ${cual}`;
}

/** Subtítulo corto bajo una flecha apagada (se ve sin pasar el mouse). */
export function subtituloFlechaApagada(opts: { sinFecha?: boolean }): string {
  return opts.sinFecha ? "Sin fecha" : "No hay más";
}

// =============================================================================
// Atajo de teclado ←/→
// =============================================================================

export interface TeclaPulsada {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

export interface ContextoFoco {
  /** `tagName` del elemento con el foco (null = nada / el body). */
  etiqueta: string | null;
  /** `isContentEditable` del elemento con el foco. */
  editable: boolean;
  /** `role` del elemento con el foco (o de su contenedor de grupo). */
  rol: string | null;
  /** Hay un diálogo, menú o lista desplegable abiertos. */
  hayCapaAbierta: boolean;
}

/** Etiquetas donde ←/→ mueven el cursor o cambian el valor. */
const ETIQUETAS_CON_FLECHAS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
/** Roles ARIA donde ←/→ tienen significado propio. */
const ROLES_CON_FLECHAS = new Set([
  "slider",
  "spinbutton",
  "radio",
  "radiogroup",
  "tab",
  "tablist",
  "menuitem",
  "option",
  "combobox",
  "textbox",
  "listbox",
  "grid",
  "gridcell",
]);

/**
 * ¿Esta tecla es el atajo de una flecha? Solo ←/→ SIN modificadores, sin
 * autorrepetición y SOLO cuando el foco no está en algo que ya usa esas
 * teclas (un campo del cotizador —la hoja está hecha de inputs—, un select,
 * un grupo de pestañas…) ni hay un diálogo o menú abiertos. Ante la duda,
 * NO es atajo: brincar de cotización mientras se escribe sería peor que no
 * tener atajo. (Con cambios sin guardar, el clic que dispara el atajo pasa
 * por el MISMO guard que el clic del mouse.)
 */
export function direccionDeTecla(
  t: TeclaPulsada,
  ctx: ContextoFoco,
): DireccionFlecha | null {
  if (t.key !== "ArrowLeft" && t.key !== "ArrowRight") return null;
  if (t.altKey || t.ctrlKey || t.metaKey || t.shiftKey) return null;
  if (t.repeat || t.defaultPrevented) return null;
  if (ctx.hayCapaAbierta || ctx.editable) return null;
  if (ctx.etiqueta && ETIQUETAS_CON_FLECHAS.has(ctx.etiqueta.toUpperCase())) return null;
  if (ctx.rol && ROLES_CON_FLECHAS.has(ctx.rol)) return null;
  return t.key === "ArrowLeft" ? "anterior" : "siguiente";
}
