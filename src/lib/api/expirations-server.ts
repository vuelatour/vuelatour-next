import { apiServer } from "./server";
import type { Expiration, ExpirationListResponse } from "@/types/expirations";

export interface ListExpirationsQuery {
  aeronave_id?: string;
  piloto_id?: string;
  motor_id?: string;
  tipo_documento_id?: string;
  ambito?: string;
  estado?: string;
  limit?: number;
  offset?: number;
}

export function listExpirations(query: ListExpirationsQuery = {}) {
  return apiServer<ExpirationListResponse>("/v1/expirations", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getExpiration(id: string) {
  return apiServer<Expiration>(`/v1/expirations/${id}`, { cache: "no-store" });
}
