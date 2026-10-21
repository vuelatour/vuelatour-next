import { apiServer } from "./server";
import type {
  CompraDetalle,
  CompraEstado,
  CompraListItem,
  CompraListResponse,
} from "@/types/compras";

export interface ListComprasQuery {
  estado?: CompraEstado;
  limit?: number;
  offset?: number;
}

/** Compras de refacciones (lista). */
export function listCompras(query: ListComprasQuery = {}) {
  return apiServer<CompraListResponse>("/v1/compras", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * TODAS las compras, SIN cap (21-oct-2026): pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200 de `listGastosAll`). La pantalla de Compras
 * reparte las pestañas («Por recibir», «Sin gasto», «Completas») con los
 * estados que manda el API y un corte silencioso escondería compras.
 */
export async function listComprasTodas(): Promise<{ data: CompraListItem[]; count: number }> {
  const limit = 200;
  const first = await listCompras({ limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listCompras({ limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

/** Detalle de una compra: líneas con costo final, pagos ligados y resumen. */
export function getCompra(id: string) {
  return apiServer<CompraDetalle>(`/v1/compras/${id}`, { cache: "no-store" });
}
