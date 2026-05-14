import { apiServer } from "./server";
import type { Route, RouteListResponse } from "@/types/routes";

export interface ListRoutesQuery {
  origen?: string;
  destino?: string;
  q?: string;
  activa?: boolean;
  limit?: number;
  offset?: number;
}

export function listRoutes(query: ListRoutesQuery = {}) {
  return apiServer<RouteListResponse>("/v1/routes", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getRoute(id: string) {
  return apiServer<Route>(`/v1/routes/${id}`, { cache: "no-store" });
}
