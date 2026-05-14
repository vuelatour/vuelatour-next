import { apiServer } from "./server";
import type { Provider, ProviderListResponse } from "@/types/providers";

export interface ListProvidersQuery {
  q?: string;
  tipo?: string;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listProviders(query: ListProvidersQuery = {}) {
  return apiServer<ProviderListResponse>("/v1/providers", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getProvider(id: string) {
  return apiServer<Provider>(`/v1/providers/${id}`, { cache: "no-store" });
}
