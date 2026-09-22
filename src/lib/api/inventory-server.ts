import { apiServer } from "./server";
import { isApiError } from "./errors";
import type {
  InventarioItemDetail,
  InventarioItemResumen,
  InventarioListResponse,
  MovimientoEliminado,
  MovimientoListResponse,
} from "@/types/inventory";

export interface ListInventarioQuery {
  q?: string;
  categoria?: string;
  activo?: boolean;
  bajo_stock?: boolean;
  /** Acotan SOLO las ventas/ganancia por ítem (YYYY-MM-DD, día Cancún); sin ellos = acumulado. */
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listInventario(query: ListInventarioQuery = {}) {
  return apiServer<InventarioListResponse>("/v1/inventory/items", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * Inventario COMPLETO, sin cap: el API acepta a lo más 300 por consulta
 * (`@Max(300)` del DTO — pedir 500 era un 400 y la tabla se quedaba sin
 * nada), así que se pagina con offset hasta cubrir `count` (patrón anti-cap
 * de expenses-server). Con la alta masiva la bodega pasa de una página y,
 * pidiendo una sola, la tabla "perdía" ítems. Los totales valorizados del
 * API son POR PÁGINA: aquí se re-suman sobre todo lo leído. `bajo_stock` no
 * se acepta: el API lo filtra DESPUÉS de paginar y descuadraría el offset
 * (la página filtra localmente).
 */
export async function listInventarioTodo(
  query: Omit<ListInventarioQuery, "limit" | "offset" | "bajo_stock"> = {},
): Promise<
  Pick<InventarioListResponse, "data" | "count" | "valor_total_usd" | "valor_total_mxn"> & {
    /** Σ en DÓLARES de lo comprado sin T.C. — JAMÁS se suma con los pesos. */
    valor_total_usd_sin_tc: number;
    ventas_total_mxn: number;
    ganancia_total_mxn: number;
  }
> {
  const limit = 300;
  const base = { ...query, limit };
  const first = await listInventario({ ...base, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listInventario({ ...base, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    data,
    count: first.count,
    valor_total_usd: round2(data.reduce((s, d) => s + (Number(d.valor_usd) || 0), 0)),
    // DOS monedas, DOS sumas: `valor_mxn` trae SOLO pesos reales y lo
    // comprado en dólares sin T.C. se suma APARTE, en dólares (invariante 8
    // del API, 22-sep-2026). Juntarlas aquí reintroduciría el bug que
    // reportó el cliente, esta vez en el panel.
    valor_total_mxn: round2(data.reduce((s, d) => s + (Number(d.valor_mxn) || 0), 0)),
    valor_total_usd_sin_tc: round2(
      data.reduce((s, d) => s + (Number(d.valor_usd_sin_tc) || 0), 0),
    ),
    // Ganancia / pérdida acumulada de la bodega (Σ de lo que manda el API por
    // ítem; null = ese ítem nunca vendió con precio y no suma).
    ventas_total_mxn: round2(data.reduce((s, d) => s + (Number(d.ventas_mxn) || 0), 0)),
    ganancia_total_mxn: round2(data.reduce((s, d) => s + (Number(d.ganancia_mxn) || 0), 0)),
  };
}

/**
 * Resumen del producto para el detalle (4-sep-2026): bloques COMPRAS |
 * VENTAS | RESUMEN por día + totales, calculados por el API con el mismo
 * FIFO/ganancia del balance. `desde`/`hasta` (YYYY-MM-DD) opcionales.
 */
export function getInventarioItemResumen(
  id: string,
  query: { desde?: string; hasta?: string } = {},
) {
  return apiServer<InventarioItemResumen>(`/v1/inventory/items/${id}/resumen`, {
    searchParams: query as Record<string, string | undefined>,
    cache: "no-store",
  });
}

export function getInventarioItem(id: string) {
  return apiServer<InventarioItemDetail>(`/v1/inventory/items/${id}`, {
    cache: "no-store",
  });
}

/**
 * Historial de movimientos de cardex ELIMINADOS del ítem (21-sep-2026).
 *
 * Tres desenlaces, y se distinguen a propósito:
 * - `disponible:false` → el API contestó 404 a la RUTA (backend sin
 *   desplegar): la acción «Eliminar» no se muestra y no se pinta la sección.
 * - `falla:true` → la lectura falló por otra cosa (502 de un deploy, red):
 *   NO se esconde la acción y la sección lo DICE. Pintar «sin eliminados»
 *   cuando la carga falló sería la mentira que la regla del panel prohíbe.
 * - normal → las filas (el API devuelve [] si falta la migración).
 *
 * Nunca lanza: es una sección ACCESORIA del detalle del ítem y no puede
 * tumbar la pantalla entera.
 */
export interface MovimientosEliminadosResultado {
  disponible: boolean;
  filas: MovimientoEliminado[];
  falla: boolean;
}

export async function listMovimientosEliminados(
  itemId: string,
): Promise<MovimientosEliminadosResultado> {
  try {
    const filas = await apiServer<MovimientoEliminado[]>(
      `/v1/inventory/items/${itemId}/movimientos-eliminados`,
      { cache: "no-store" },
    );
    return { disponible: true, filas: Array.isArray(filas) ? filas : [], falla: false };
  } catch (err) {
    // 404 = la ruta no existe en ese API (el ítem sí: la página ya lo leyó).
    if (isApiError(err) && err.status === 404) {
      return { disponible: false, filas: [], falla: false };
    }
    // 401/403 (rol sin permiso) degrada en silencio: recargar no lo arregla.
    if (isApiError(err) && (err.status === 401 || err.status === 403)) {
      return { disponible: true, filas: [], falla: false };
    }
    return { disponible: true, filas: [], falla: true };
  }
}

export interface ListMovimientosQuery {
  item_id?: string;
  aeronave_id?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  /** true = solo movimientos con costo USD en 0 (entradas sin costo real). */
  sin_costo?: boolean;
  limit?: number;
  offset?: number;
}

export function listMovimientos(query: ListMovimientosQuery = {}) {
  return apiServer<MovimientoListResponse>("/v1/inventory/movimientos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
