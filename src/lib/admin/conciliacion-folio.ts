/**
 * Conciliación: el NÚMERO DE FACTURA del gasto con el que se liga un cargo
 * (5-oct-2026, API 0.0.57). Pedido del cliente: «al momento de la conciliación
 * me apoyan a poner el número de la factura con la que se enlaza el
 * movimiento».
 *
 * El folio lo CALCULA el API (fuente única `folioComprobanteDeGasto`, en
 * `vuelatour-api/src/common/folio-comprobante.util.ts`) y lo manda ya resuelto
 * como `folio_comprobante` en el gasto conciliado (`gasto` y cada `gastos[]`
 * del lote) y en cada candidato de «Vincular gasto». Su orden: serie-folio del
 * CFDI de la factura recibida ligada («FEACZM-72128») ⇒ folio del ticket ⇒
 * folio leído por la IA ⇒ «CFDI <uuid>». El panel NO vuelve a decidir cuál
 * gana: solo lo ROTULA aquí. Campo ADITIVO: sin él (API previo) no se pinta
 * nada y la fila queda como antes.
 *
 * También vive aquí la columna «Folio» de Facturas recibidas (serie-folio del
 * CFDI que el API relee del XML; sin él, la referencia corta del UUID).
 *
 * Módulo PURO (sin React ni red). Prueba: `__tests__/conciliacion-folio.test.ts`.
 */

import { etiquetaSerieFolio } from "@/lib/admin/facturas-emitidas";

// ─────────────────────── Folio del gasto conciliado ───────────────────────

/** Prefijo del rótulo: «Factura FEACZM-72128». */
export const PREFIJO_FACTURA = "Factura";

/** «CFDI <uuid>»: el último recurso del API (factura sin serie ni folio). Solo
 *  con un UUID de verdad: un ticket «CFDI 123» se rotula tal cual. */
const RE_FOLIO_CFDI = /^CFDI\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Caracteres finales del UUID que se ven en la celda (como la referencia de siempre). */
export const LARGO_REFERENCIA_UUID = 8;

/** trim; vacío o no-texto ⇒ null. */
export function folioLimpio(folio: unknown): string | null {
  if (typeof folio !== "string" && typeof folio !== "number") return null;
  const t = String(folio).trim();
  return t.length > 0 ? t : null;
}

/** Referencia corta de un UUID fiscal: «…1A2B3C4D» (null si no hay). */
export function referenciaUuid(uuid: string | null | undefined): string | null {
  const u = folioLimpio(uuid);
  return u ? `…${u.slice(-LARGO_REFERENCIA_UUID)}` : null;
}

/**
 * Lo que se pinta debajo del gasto conciliado y en la descripción de cada
 * candidato: «Factura FEACZM-72128». El «CFDI <uuid>» del API se acorta a
 * «Factura CFDI …1A2B3C4D» (el UUID entero no cabe en la celda; completo va
 * en `tituloFolioComprobante`). null/vacío ⇒ null (no se pinta nada).
 */
export function etiquetaFolioComprobante(folio: string | null | undefined): string | null {
  const f = folioLimpio(folio);
  if (!f) return null;
  const cfdi = RE_FOLIO_CFDI.exec(f);
  if (cfdi) return `${PREFIJO_FACTURA} CFDI ${referenciaUuid(cfdi[1])}`;
  return `${PREFIJO_FACTURA} ${f}`;
}

/** Tooltip con el folio COMPLETO («Factura CFDI <uuid entero>»); null si no hay. */
export function tituloFolioComprobante(folio: string | null | undefined): string | null {
  const f = folioLimpio(folio);
  return f ? `${PREFIJO_FACTURA} ${f}` : null;
}

// ─────────────────────── Columna «Folio» de recibidas ───────────────────────

/** Encabezado de la columna nueva de Facturas recibidas. */
export const ENCABEZADO_FOLIO_RECIBIDA = "Folio";

/** Sin dato (API previo o factura solo PDF). */
export const SIN_FOLIO = "—";

/** Buscador de Facturas recibidas (ahora también encuentra por folio). */
export const PLACEHOLDER_BUSCAR_RECIBIDA = "Buscar factura (emisor, RFC, folio, UUID, concepto)…";

/** Lo que la tabla necesita de una factura recibida para su folio. */
export interface FacturaRecibidaFolio {
  /** ADITIVOS (API 0.0.57): `undefined` = el API no los manda (previo o sin migración). */
  serie?: string | null;
  folio?: string | null;
  uuid_fiscal?: string | null;
}

/**
 * Serie-folio del CFDI con la MISMA regla que el API (paso 1 de
 * `folioComprobanteDeGasto`): solo con `folio`; «A-0411», «FEACZM-72128» o
 * «0411» sin serie. Sin folio ⇒ null (una serie sola no es un número).
 */
export function serieFolioDeRecibida(f: FacturaRecibidaFolio | null | undefined): string | null {
  const folio = folioLimpio(f?.folio);
  return folio ? etiquetaSerieFolio(folioLimpio(f?.serie), folio) : null;
}

export interface CeldaFolioRecibida {
  texto: string;
  /** Tooltip (UUID completo) o null. */
  titulo: string | null;
}

/**
 * Celda «Folio»: serie-folio («A-0411»); si la factura no lo tiene (aún no se
 * relee el XML o el CFDI no trae Serie/Folio), «…últimos 8 del UUID» como la
 * referencia de siempre; con un API que todavía no manda `serie`/`folio`
 * (ninguno de los dos viene), «—». El tooltip lleva el UUID completo.
 */
export function celdaFolioRecibida(f: FacturaRecibidaFolio): CeldaFolioRecibida {
  const uuid = folioLimpio(f.uuid_fiscal);
  const titulo = uuid ? `UUID ${uuid}` : null;
  const serieFolio = serieFolioDeRecibida(f);
  if (serieFolio) return { texto: serieFolio, titulo };
  const apiConFolio = f.serie !== undefined || f.folio !== undefined;
  if (!apiConFolio) return { texto: SIN_FOLIO, titulo: null };
  const ref = referenciaUuid(uuid);
  return ref ? { texto: ref, titulo } : { texto: SIN_FOLIO, titulo: null };
}

/** Texto extra para el buscador de recibidas: serie-folio (vacío si no hay). */
export function textoBusquedaFolioRecibida(f: FacturaRecibidaFolio): string {
  return serieFolioDeRecibida(f) ?? "";
}
