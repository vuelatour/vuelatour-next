import { apiServer } from "./server";
import type {
  InventarioItemDetail,
  InventarioListResponse,
  MovimientoListResponse,
} from "@/types/inventory";

export interface ListInventarioQuery {
  q?: string;
  categoria?: string;
  activo?: boolean;
  bajo_stock?: boolean;
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
  Pick<InventarioListResponse, "data" | "count" | "valor_total_usd" | "valor_total_mxn">
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
    valor_total_mxn: round2(data.reduce((s, d) => s + (Number(d.valor_mxn) || 0), 0)),
  };
}

export function getInventarioItem(id: string) {
  return apiServer<InventarioItemDetail>(`/v1/inventory/items/${id}`, {
    cache: "no-store",
  });
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
