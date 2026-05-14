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

export function getQuote(id: string) {
  return apiServer<PersistedQuote>(`/v1/quotes/${id}`, { cache: "no-store" });
}

export function getQuoteVersions(id: string) {
  return apiServer<CotizacionVersion[]>(`/v1/quotes/${id}/versions`, {
    cache: "no-store",
  });
}
