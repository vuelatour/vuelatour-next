/**
 * Parámetros de la URL: validarlos ANTES de hablar con el API — 21-sep-2026.
 *
 * El síntoma: enlaces viejos y marcadores del navegador tumbaban la pantalla
 * al error boundary porque el valor inválido viajaba al API, Nest respondía
 * 400 (`forbidNonWhitelisted` + `IsEnum`/`IsUUID`/`IsDateString`) y `apiFetch`
 * lanzaba. Casos reproducidos: `/admin/inventory/<no-uuid>`,
 * `/admin/flights?cobro=<inválido>`, `/admin/flights?estado=<inválido>`,
 * `/admin/quotes?estado=<inválido>`, `/admin/expenses?desde=2026-13-45`,
 * `/admin/profit-sharing?desde=nada`.
 *
 * Las dos reglas:
 *  - **Id de una ruta de detalle** que no sea uuid ⇒ `notFound()` SIN llamar
 *    al API (ese id no puede existir: es un 404, no un error del sistema).
 *  - **Filtro de una lista** con valor fuera de su catálogo o fecha inválida
 *    ⇒ se IGNORA (no se manda al API). La lista sale completa, que es lo que
 *    el operador espera al abrir un enlace viejo, en vez de una pantalla rota.
 *
 * Todo aquí es PURO (prueba `__tests__/url-params.test.ts`).
 */

import { ESTADO_LABELS } from "./estado-vuelo";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Es un uuid del API? (mismo criterio que `@IsUUID()` de Nest en la práctica). */
export function esUuid(valor: string | null | undefined): boolean {
  return typeof valor === "string" && UUID_RE.test(valor);
}

/** Id de un filtro: se manda solo si es uuid; cualquier otra cosa se ignora. */
export function uuidFiltro(valor: string | null | undefined): string | undefined {
  return esUuid(valor) ? (valor as string) : undefined;
}

/**
 * Valor de un filtro que pertenece a un catálogo cerrado (enum del API).
 * Fuera del catálogo ⇒ `undefined` (se ignora, no se manda).
 */
export function valorDeCatalogo<T extends string>(
  valor: string | null | undefined,
  catalogo: readonly T[],
): T | undefined {
  if (!valor) return undefined;
  return (catalogo as readonly string[]).includes(valor) ? (valor as T) : undefined;
}

/** Estados de vuelo/cotización válidos (enum `EstadoVuelo` del API). */
export const ESTADOS_VUELO = Object.keys(ESTADO_LABELS) as EstadoVuelo[];

/** Estados de COBRO válidos (`ListFlightsQuery.cobro` del API). */
export const ESTADOS_COBRO = [
  "COBRADO",
  "POR_COBRAR",
  "PARCIAL",
  "SIN_COBROS",
] as const;
export type EstadoCobroFiltro = (typeof ESTADOS_COBRO)[number];

/** `?estado=` de las listas de vuelos y cotizaciones. */
export function estadoFiltro(valor: string | null | undefined): EstadoVuelo | undefined {
  return valorDeCatalogo(valor, ESTADOS_VUELO);
}

/** `?cobro=` de la lista de vuelos. */
export function cobroFiltro(
  valor: string | null | undefined,
): EstadoCobroFiltro | undefined {
  return valorDeCatalogo(valor, ESTADOS_COBRO);
}

const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Día de pared `YYYY-MM-DD` que EXISTE de verdad: `2026-13-45` y `2026-02-30`
 * no pasan (el `@IsDateString()` del API los rechaza con 400). Se valida con
 * aritmética UTC a mediodía para no correr el día en hora Cancún.
 */
export function esDiaValido(valor: string | null | undefined): boolean {
  const m = typeof valor === "string" ? DIA_RE.exec(valor) : null;
  if (!m) return false;
  const [, y, mes, dia] = m;
  const d = new Date(`${valor}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === Number(y) &&
    d.getUTCMonth() + 1 === Number(mes) &&
    d.getUTCDate() === Number(dia)
  );
}

/**
 * Filtro de fecha: acepta el día `YYYY-MM-DD` o un ISO completo (los dos los
 * admite el API). Inválido ⇒ `undefined`: se ignora el filtro en vez de
 * tumbar la pantalla.
 */
export function fechaFiltro(valor: string | null | undefined): string | undefined {
  if (!valor) return undefined;
  if (esDiaValido(valor)) return valor;
  // ISO completo: debe parsear Y conservar su día (descarta "2026-13-45T00:00").
  if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime()) && esDiaValido(valor.slice(0, 10))) return valor;
  }
  return undefined;
}

/**
 * Rango de fechas de una lista: además de validar cada extremo, corrige el
 * rango invertido (dedazo del selector) en vez de dejar que el API responda
 * 400 y se pierda la pantalla entera.
 */
export function rangoFiltro(
  desde: string | null | undefined,
  hasta: string | null | undefined,
): { desde?: string; hasta?: string } {
  const d = fechaFiltro(desde);
  const h = fechaFiltro(hasta);
  if (d && h && d > h) return { desde: h, hasta: d };
  return { desde: d, hasta: h };
}
