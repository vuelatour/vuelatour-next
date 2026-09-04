import { apiServer } from "./server";
import type {
  CotizacionVersion,
  PersistedQuote,
  PersistedQuoteListResponse,
} from "@/types/quotes-persisted";

export interface ListQuotesQuery {
  cliente_id?: string;
  aeronave_id?: string;
  estado?: string;
  es_externo?: boolean;
  /** Solo los hijos de una cotización de GRUPO (vuelo.grupo_id). */
  grupo_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listQuotes(query: ListQuotesQuery = {}) {
  return apiServer<PersistedQuoteListResponse>("/v1/quotes", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * TODAS las cotizaciones del filtro, SIN cap: pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200, igual que `listFuelLoads`). Con el corte en
 * 200, una cotización recién creada podía "desaparecer" de la lista
 * (auditoría 29-ago: 'ya lo había guardado y no está').
 */
export async function listQuotesAll(
  query: Omit<ListQuotesQuery, "limit" | "offset"> = {},
) {
  const limit = 200;
  const first = await listQuotes({ ...query, limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listQuotes({ ...query, limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

export function getQuote(id: string) {
  return apiServer<PersistedQuote>(`/v1/quotes/${id}`, { cache: "no-store" });
}

export function getQuoteVersions(id: string) {
  return apiServer<CotizacionVersion[]>(`/v1/quotes/${id}/versions`, {
    cache: "no-store",
  });
}
