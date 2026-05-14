import { apiServer } from "./server";
import type {
  IssuingEntity,
  IssuingEntityListResponse,
} from "@/types/issuing-entities";

export interface ListIssuingEntitiesQuery {
  q?: string;
  activa?: boolean;
  limit?: number;
  offset?: number;
}

export function listIssuingEntities(query: ListIssuingEntitiesQuery = {}) {
  return apiServer<IssuingEntityListResponse>("/v1/issuing-entities", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getIssuingEntity(id: string) {
  return apiServer<IssuingEntity>(`/v1/issuing-entities/${id}`, { cache: "no-store" });
}
