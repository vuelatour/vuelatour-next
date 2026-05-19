import { apiServer } from "./server";
import type { DashboardOverview } from "@/types/dashboards";

export interface OverviewQuery {
  desde?: string;
  hasta?: string;
}

export function getDashboardOverview(query: OverviewQuery) {
  return apiServer<DashboardOverview>("/v1/dashboards/overview", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
