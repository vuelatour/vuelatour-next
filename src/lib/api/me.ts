import { cache } from "react";
import type { MeResponse } from "@/types/me";
import { apiServer } from "./server";

/**
 * Cacheado per-request (react.cache): el layout y la página pueden llamarlo
 * sin generar duplicados de HTTP hacia /v1/me.
 */
export const getMe = cache(async (): Promise<MeResponse> => {
  return apiServer<MeResponse>("/v1/me");
});
