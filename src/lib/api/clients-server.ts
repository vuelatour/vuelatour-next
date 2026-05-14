import { apiServer } from "./server";
import type { Client, ClientListResponse } from "@/types/clients";

export interface ListClientsQuery {
  q?: string;
  canal_origen?: string;
  es_broker?: boolean;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listClients(query: ListClientsQuery = {}) {
  return apiServer<ClientListResponse>("/v1/clients", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getClient(id: string) {
  return apiServer<Client>(`/v1/clients/${id}`, { cache: "no-store" });
}
