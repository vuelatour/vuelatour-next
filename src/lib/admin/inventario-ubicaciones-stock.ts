/**
 * STOCK POR UBICACIÓN Y TRASPASOS (27-oct-2026, API 0.0.111, invariante 111
 * del API) — regla PURA del panel.
 *
 * Pedido de la oficina (captura de la ficha del filtro CH48108): «tenemos
 * filtros en Córner y aparte filtros en Toledo … muchos de los productos se
 * encuentran en diferentes lugares … una tablita … de estos 200 aceites que
 * hay, 100 se encuentran en Toledo, cinco en Mérida y 95 en la bodega de
 * Córner. Y entonces así ya sabemos en dónde hay todo».
 *
 * El API deriva la existencia por bodega del cardex (fuente única
 * `inventario-cardex.util#stockPorUbicacion`): un movimiento sin bodega
 * cuenta en la PRINCIPAL del producto; un TRASPASO resta en el origen y suma
 * en el destino sin mover la existencia total ni el dinero. Aquí solo se
 * REDACTA (`item.stock_por_ubicacion`, `resumen.traspasos`) y se arman las
 * opciones del selector de bodega del movimiento. Prueba:
 * `__tests__/inventario-ubicaciones-stock.test.ts`.
 */
import { cantidadConUnidad } from "./inventario-eliminar";
import { TEXTO_SIN_UBICACION } from "./inventario-ubicacion";
import type { InventarioUbicacion, StockUbicacion } from "@/types/inventory";

export const TITULO_STOCK_UBICACIONES = "Stock y ubicaciones";
export const AYUDA_STOCK_UBICACIONES =
  "Dónde está cada pieza. Las entradas y salidas se registran en una bodega (si no eliges una, en la principal del producto); para mover piezas de una bodega a otra usa «Traspasar».";
export const SIN_STOCK_UBICACIONES = "Sin existencia en ninguna bodega.";
export const SIN_DATO_UBICACIONES =
  "El reparto por bodega aún no viene del servidor (versión previa). Recarga la página más tarde.";
export const ETIQUETA_PRINCIPAL = "principal";
export const TITULO_PRINCIPAL =
  "Ubicación principal del producto: ahí cuentan los movimientos que no dicen bodega.";
export const ETIQUETA_TRASPASAR = "Traspasar";
export const ETIQUETA_TOTAL = "Total";
export const NOMBRE_BODEGA_DESCONOCIDA = "Bodega sin nombre";
/** Texto de un origen sin bodega explícita (= la principal del producto). */
export const ETIQUETA_ORIGEN_PRINCIPAL = "Ubicación principal";

/** Tipo nuevo del selector del movimiento. */
export const TIPO_TRASPASO = {
  value: "TRASPASO",
  label: "Traspaso entre bodegas (mover piezas de una ubicación a otra)",
} as const;
export const ETIQUETA_BODEGA = "Bodega";
export const HINT_BODEGA = "Vacío = la ubicación principal del producto";
export const ETIQUETA_BODEGA_ORIGEN = "De (bodega de origen)";
export const ETIQUETA_BODEGA_DESTINO = "A (bodega que recibe)";
export const OPCION_BODEGA_PRINCIPAL = "Ubicación principal del producto";
export const NOTA_TRASPASO =
  "Un traspaso no cambia la existencia total ni cuesta nada: solo reparte el stock entre bodegas. Solo sale lo que de verdad hay en la bodega de origen.";
export const ERROR_DESTINO_REQUERIDO = "Elige la bodega que recibe las piezas";
export const ERROR_DESTINO_IGUAL = "La bodega que recibe debe ser distinta a la de origen";
export const ETIQUETA_CARDEX_TRASPASO = "Traspaso";

/** ¿Es un traspaso entre bodegas? (espejo de `esTraspaso` del API). */
export function esTraspaso(m: { tipo: string } | null | undefined): boolean {
  return m?.tipo === "TRASPASO";
}

/** Una fila de la tabla «Stock y ubicaciones». */
export interface FilaStockUbicacion {
  ubicacion_id: string | null;
  nombre: string;
  cantidad: number;
  /** % del total (entero); null cuando el total es 0. */
  pct: number | null;
  es_principal: boolean;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Filas de la tabla con lo que manda el API (ya ordenado: principal primero,
 * luego por cantidad, «Sin ubicación» al final). Se ocultan las bodegas que
 * quedaron en 0, salvo la principal (se ve aunque esté vacía: ahí caen los
 * movimientos sin bodega). Un negativo se VE, no se esconde.
 */
export function filasStockUbicacion(
  stock: readonly StockUbicacion[] | null | undefined,
): FilaStockUbicacion[] {
  const filas = (stock ?? []).filter((s) => s.es_principal || Math.abs(Number(s.cantidad)) > 1e-9);
  const total = filas.reduce((acc, s) => acc + Number(s.cantidad), 0);
  return filas.map((s) => ({
    ubicacion_id: s.ubicacion_id,
    nombre: s.nombre ?? (s.ubicacion_id ? NOMBRE_BODEGA_DESCONOCIDA : TEXTO_SIN_UBICACION),
    cantidad: round3(Number(s.cantidad)),
    pct: total > 1e-9 ? Math.round((Number(s.cantidad) / total) * 100) : null,
    es_principal: s.es_principal === true,
  }));
}

/** Σ de las filas (debe coincidir con la existencia total del producto). */
export function totalStockUbicaciones(filas: readonly FilaStockUbicacion[]): number {
  return round3(filas.reduce((acc, f) => acc + f.cantidad, 0));
}

/**
 * «200 cuarto (qt) en 3 bodegas: Locker Toledo 100 · Bodega Corner 95 · Taller
 * Merida 5» / «Todo (2 pieza) en Locker Toledo». Sin filas ⇒ null.
 */
export function textoResumenStockUbicaciones(
  filas: readonly FilaStockUbicacion[],
  unidad: string | null | undefined,
): string | null {
  const conStock = filas.filter((f) => Math.abs(f.cantidad) > 1e-9);
  if (conStock.length === 0) return null;
  const total = totalStockUbicaciones(conStock);
  if (conStock.length === 1) {
    return `Todo (${cantidadConUnidad(total, unidad)}) en ${conStock[0].nombre}`;
  }
  const partes = conStock.map((f) => `${f.nombre} ${f.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 3 })}`);
  return `${cantidadConUnidad(total, unidad)} en ${conStock.length} bodegas: ${partes.join(" · ")}`;
}

/** Opción del selector de bodega del movimiento. */
export interface OpcionBodega {
  value: string;
  label: string;
  description?: string;
}

/**
 * Opciones del selector de bodega: las ACTIVAS del catálogo (y la principal
 * aunque esté inactiva), cada una con su existencia; con `conPrincipal`,
 * primero la opción vacía «Ubicación principal del producto (Bodega Corner)».
 */
export function opcionesBodega(p: {
  catalogo: readonly InventarioUbicacion[] | null | undefined;
  stock: readonly StockUbicacion[] | null | undefined;
  principalId: string | null | undefined;
  unidad?: string | null;
  conPrincipal: boolean;
}): OpcionBodega[] {
  const existencia = new Map<string | null, number>();
  for (const s of p.stock ?? []) existencia.set(s.ubicacion_id, Number(s.cantidad));
  const descripcion = (id: string | null): string => {
    const n = existencia.get(id);
    return n != null && Math.abs(n) > 1e-9
      ? `${cantidadConUnidad(round3(n), p.unidad)} en existencia`
      : "sin existencia";
  };
  const principal = (p.catalogo ?? []).find((u) => u.id === p.principalId) ?? null;
  const lista = (p.catalogo ?? [])
    .filter((u) => u.activo || u.id === p.principalId)
    .map((u) => ({
      value: u.id,
      label: `${u.nombre}${u.id === p.principalId ? ` · ${ETIQUETA_PRINCIPAL}` : ""}${u.activo ? "" : " (inactiva)"}`,
      description: descripcion(u.id),
    }));
  if (!p.conPrincipal) return lista;
  return [
    {
      value: "",
      label: principal
        ? `${OPCION_BODEGA_PRINCIPAL} (${principal.nombre})`
        : `${OPCION_BODEGA_PRINCIPAL} (${TEXTO_SIN_UBICACION})`,
      description: descripcion(principal ? principal.id : null),
    },
    ...lista,
  ];
}

/** «Bodega Corner → Locker Toledo» (origen null = la principal). */
export function etiquetaTraspaso(p: {
  origen: string | null | undefined;
  destino: string | null | undefined;
}): string {
  return `${p.origen ?? ETIQUETA_ORIGEN_PRINCIPAL} → ${p.destino ?? "¿?"}`;
}

/** La misma etiqueta desde un movimiento del cardex (joins del API). */
export function etiquetaTraspasoMovimiento(m: {
  ubicacion?: { nombre: string } | null;
  ubicacion_destino?: { nombre: string } | null;
}): string {
  return etiquetaTraspaso({ origen: m.ubicacion?.nombre ?? null, destino: m.ubicacion_destino?.nombre ?? null });
}

/** Toast: «Traspaso registrado: 2 pieza de Bodega Corner a Locker Toledo». */
export function textoTraspasoRegistrado(p: {
  cantidad: number;
  unidad: string | null | undefined;
  origen: string | null | undefined;
  destino: string | null | undefined;
}): string {
  return `Traspaso registrado: ${cantidadConUnidad(p.cantidad, p.unidad)} de ${p.origen ?? ETIQUETA_ORIGEN_PRINCIPAL} a ${p.destino ?? "¿?"}`;
}

/**
 * Validación del traspaso ANTES de mandarlo (el zod y el API la repiten):
 * destino obligatorio y distinto al origen efectivo (el elegido o la
 * principal del producto).
 */
export function errorTraspaso(p: {
  origenId: string;
  destinoId: string;
  principalId: string | null | undefined;
}): string | null {
  if (!p.destinoId) return ERROR_DESTINO_REQUERIDO;
  const origenEfectivo = p.origenId || p.principalId || "";
  if (origenEfectivo && origenEfectivo === p.destinoId) return ERROR_DESTINO_IGUAL;
  return null;
}
