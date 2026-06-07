import { apiServer } from "./server";
import type { MultasResponse } from "@/types/multas";

export function listMultas(query: { aeronave_id?: string; estado?: string } = {}) {
  return apiServer<MultasResponse>("/v1/multas", {
    searchParams: { ...query, limit: 300 },
    cache: "no-store",
  });
}
