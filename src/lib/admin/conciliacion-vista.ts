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
import { diaMas } from "./conciliacion-auto";
import { esDiaValido } from "./url-params";

export type FiltroConciliacion =
  | "todos"
  | "pendientes"
  | "conciliados"
  | "sin_banco"
  | "cobros_sin_banco"
  | "paywise";

export const FILTROS_CONCILIACION: readonly FiltroConciliacion[] = [
  "todos",
  "pendientes",
  "conciliados",
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
 * Nota cuando la lista llegó al tope del API y hay más movimientos de los
 * que se ven: acotar el periodo es la salida. null si se ven todos.
 */
export function textoListaRecortada(mostrados: number, total: number): string | null {
  if (!(total > mostrados) || mostrados <= 0) return null;
  return `Se muestran los ${mostrados} movimientos más recientes de ${total}. Acota el periodo con «Desde» y «Hasta» para ver los demás.`;
}

/**
 * URL de la vista (FUENTE ÚNICA): pestaña + cuenta + rango. «todos», una
 * cuenta vacía y un rango vacío quedan FUERA de la URL (default limpio).
 */
export function hrefConciliacion(v: {
  f?: string | null;
  cuenta?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): string {
  const q = new URLSearchParams();
  const f = filtroConciliacionDeUrl(v.f);
  if (f !== "todos") q.set("f", f);
  if (v.cuenta) q.set("cuenta", v.cuenta);
  if (v.desde) q.set("desde", v.desde);
  if (v.hasta) q.set("hasta", v.hasta);
  const qs = q.toString();
  return qs ? `/admin/conciliacion?${qs}` : "/admin/conciliacion";
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
