import { apiServer } from "./server";
import type { ProfitSharingResult } from "@/types/profit-sharing";

export interface ProfitSharingQuery {
  desde?: string;
  hasta?: string;
  aeronave_id?: string;
}

export function getProfitSharing(query: ProfitSharingQuery) {
  return apiServer<ProfitSharingResult>("/v1/profit-sharing", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
