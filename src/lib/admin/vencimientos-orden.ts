/**
 * Orden de la tabla de Vencimientos — 26-oct-2026.
 *
 * Pedido del cliente (captura de `/admin/expirations` con las columnas
 * «Vence» y «Restante» encerradas en rojo): «podemos agregar un filtro para
 * ordenar los vencimientos por orden de fecha de vencimiento o de tiempo
 * restante, como quien dice. Tenemos filtros de otras cosas, pero nada más
 * falta eso».
 *
 * Órdenes (el valor viaja en `?orden=`; el default no se escribe en la URL):
 *  - `vence` (DEFAULT): por la fecha calendario de vencimiento, la más
 *    cercana arriba — los ya vencidos (fecha más vieja) van primero. Es el
 *    orden con el que el API ya entregaba la lista (fecha ascendente), ahora
 *    visible en el encabezado y reversible. Sin fecha (permanentes y los que
 *    SOLO vencen por horas) AL FINAL en las dos direcciones.
 *  - `vence-desc`: la fecha más lejana arriba.
 *  - `restante` / `restante-desc`: por lo que dice la columna «Restante».
 *    Días y horas NO se comparan entre sí (no hay tasa de vuelo que los
 *    convierta): primero los que tienen días (por días; negativo = vencido),
 *    luego los que solo tienen horas (por horas) y al final los que no
 *    tienen ni uno ni otro (permanentes, sin dato). Un documento con límite
 *    doble (horas + calendario) va por sus DÍAS, igual que en «Vence».
 *
 * Reglas comunes: empates por documento A–Z, luego por objetivo (matrícula /
 * piloto / motor) A–Z y al final por id — determinista (recargar no baraja).
 * Texto es-MX sin distinguir acentos ni mayúsculas.
 *
 * La página carga la lista completa (hasta 500) y el orden se aplica sobre
 * TODAS las filas antes de la búsqueda y del paginado de la tabla, nunca
 * solo sobre la página visible.
 *
 * Todo aquí es PURO (prueba `__tests__/vencimientos-orden.test.ts`); las
 * piezas comunes del patrón están en `orden-lista.ts`.
 */

import {
  coladorEsMx as colador,
  compararIds,
  direccionDeColumna as direccionDeColumnaLista,
  nulosAlFinal,
  numeroONulo,
  ordenAlPulsarColumna as ordenAlPulsarColumnaLista,
  resolverOrden,
  textoONulo,
  type DireccionOrden,
  type EleccionOrden as EleccionOrdenLista,
} from "./orden-lista";
import { valorDeCatalogo } from "./url-params";

export const ORDENES_VENCIMIENTOS = ["vence", "vence-desc", "restante", "restante-desc"] as const;
export type OrdenVencimientos = (typeof ORDENES_VENCIMIENTOS)[number];

/** El orden de siempre: lo que vence antes arriba. No se escribe en la URL. */
export const ORDEN_VENCIMIENTOS_DEFAULT: OrdenVencimientos = "vence";

/** Columnas de la tabla que se pueden ordenar con clic en su encabezado. */
export type ColumnaVencimientos = "vence" | "restante";

/** Atajos visibles junto al buscador (lo que el operador pidió, sin jerga). */
export const ATAJOS_ORDEN_VENCIMIENTOS: ReadonlyArray<{
  valor: OrdenVencimientos;
  etiqueta: string;
  titulo: string;
}> = [
  {
    valor: "vence",
    etiqueta: "Primero lo que vence antes",
    titulo:
      "Arriba lo que vence antes (los ya vencidos van primero); los permanentes y los que solo vencen por horas, al final",
  },
  {
    valor: "vence-desc",
    etiqueta: "Primero lo que vence más tarde",
    titulo:
      "Arriba lo que vence más tarde; los permanentes y los que solo vencen por horas, al final",
  },
];

/** Dirección con la que arranca cada columna al primer clic: lo urgente arriba. */
const PRIMERA_DIRECCION: Record<ColumnaVencimientos, DireccionOrden> = {
  vence: "asc",
  restante: "asc",
};

/**
 * `?orden=` → orden válido. Fuera de catálogo (enlace viejo, dedazo) o
 * ausente ⇒ el default: la lista sale completa y en su orden de siempre,
 * nunca una pantalla rota. Un parámetro repetido toma el primero.
 */
export function ordenVencimientosDeUrl(
  valor: string | readonly string[] | null | undefined,
): OrdenVencimientos {
  const v = Array.isArray(valor) ? valor[0] : (valor as string | null | undefined);
  return valorDeCatalogo(v, ORDENES_VENCIMIENTOS) ?? ORDEN_VENCIMIENTOS_DEFAULT;
}

/** Dirección con la que la columna está ordenando ahora (null = no ordena por ella). */
export function direccionDeColumna(
  columna: ColumnaVencimientos,
  orden: OrdenVencimientos,
): DireccionOrden | null {
  return direccionDeColumnaLista(columna, orden);
}

/** Clic en el encabezado: primero lo urgente arriba, el segundo clic invierte. */
export function ordenAlPulsarColumna(
  columna: ColumnaVencimientos,
  actual: OrdenVencimientos,
): OrdenVencimientos {
  return ordenAlPulsarColumnaLista(columna, actual, PRIMERA_DIRECCION);
}

/** Elección del clic mientras la URL (replaceState) se asienta. */
export type EleccionOrden = EleccionOrdenLista<OrdenVencimientos>;

/**
 * Qué orden se PINTA: la URL viva manda y la elección del clic solo gana
 * mientras la URL siga en el valor sobre el que se tomó (regla común en
 * `orden-lista.ts#resolverOrden`).
 */
export function resolverOrdenVencimientos(
  eleccion: EleccionOrden | null,
  ordenUrl: OrdenVencimientos,
): { orden: OrdenVencimientos; eleccion: EleccionOrden | null } {
  return resolverOrden(eleccion, ordenUrl);
}

/** Lo mínimo que se necesita de un vencimiento para ordenarlo. */
export interface VencimientoOrdenable {
  id: string;
  /** `PERMANENTE` no vence: cuenta como «sin fecha» aunque traiga una guardada. */
  vence_por?: string | null;
  /** Fecha calendario ISO (`YYYY-MM-DD`); null = permanente o solo por horas. */
  fecha_vencimiento?: string | null;
  /** Días hasta la fecha (negativo = vencido); null = sin fecha. */
  dias_restantes?: number | string | null;
  /** Horas de motor que faltan (≤ 0 = vencido); null = no vence por horas o sin tacómetro. */
  horas_restantes?: number | string | null;
  tipo?: { nombre?: string | null } | null;
  /** Matrícula / piloto / motor ya resuelto por la página. */
  objetivo?: string | null;
}

/** Fecha calendario como número comparable; null = sin fecha o inválida. */
function claveFecha(v: VencimientoOrdenable): number | null {
  if (v.vence_por === "PERMANENTE") return null;
  const ymd = textoONulo(v.fecha_vencimiento)?.slice(0, 10);
  if (!ymd) return null;
  const t = Date.parse(`${ymd}T12:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Lo que dice la columna «Restante»: días (grupo 0) o, si solo hay horas,
 * horas (grupo 1). Sin ninguno ⇒ null (al final en las dos direcciones).
 */
function claveRestante(v: VencimientoOrdenable): { grupo: 0 | 1; valor: number } | null {
  const dias = numeroONulo(v.dias_restantes);
  if (dias != null) return { grupo: 0, valor: dias };
  const horas = numeroONulo(v.horas_restantes);
  if (horas != null) return { grupo: 1, valor: horas };
  return null;
}

/** Desempate universal: documento A–Z, objetivo A–Z y, al final, id (determinista). */
function desempate(a: VencimientoOrdenable, b: VencimientoOrdenable): number {
  const porDocumento = colador.compare(a.tipo?.nombre ?? "", b.tipo?.nombre ?? "");
  if (porDocumento !== 0) return porDocumento;
  const porObjetivo = colador.compare(a.objetivo ?? "", b.objetivo ?? "");
  if (porObjetivo !== 0) return porObjetivo;
  return compararIds(a.id, b.id);
}

function comparador(
  orden: OrdenVencimientos,
): (a: VencimientoOrdenable, b: VencimientoOrdenable) => number {
  const signo = orden.endsWith("-desc") ? -1 : 1;
  switch (orden) {
    case "vence":
    case "vence-desc":
      return (a, b) =>
        nulosAlFinal(claveFecha(a), claveFecha(b), (x, y) => (x - y) * signo) ||
        desempate(a, b);
    case "restante":
    case "restante-desc":
      return (a, b) =>
        nulosAlFinal(claveRestante(a), claveRestante(b), (x, y) => {
          // Días antes que horas en las DOS direcciones (no se comparan).
          if (x.grupo !== y.grupo) return x.grupo - y.grupo;
          return (x.valor - y.valor) * signo;
        }) || desempate(a, b);
  }
}

/**
 * Ordena una COPIA de la lista (no muta la de entrada). Se aplica sobre la
 * lista completa, antes de la búsqueda y del paginado de la tabla.
 */
export function ordenarVencimientos<T extends VencimientoOrdenable>(
  filas: readonly T[],
  orden: OrdenVencimientos,
): T[] {
  return [...filas].sort(comparador(orden));
}
