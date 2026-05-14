import { apiServer } from "./server";
import type { Card, CardListResponse } from "@/types/cards";

export interface ListCardsQuery {
  q?: string;
  usuario_id?: string;
  activa?: boolean;
  limit?: number;
  offset?: number;
}

export function listCards(query: ListCardsQuery = {}) {
  return apiServer<CardListResponse>("/v1/cards", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getCard(id: string) {
  return apiServer<Card>(`/v1/cards/${id}`, { cache: "no-store" });
}
