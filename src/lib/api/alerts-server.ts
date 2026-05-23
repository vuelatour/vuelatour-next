import { apiServer } from "./server";
import type { AlertConfig } from "@/types/alerts";

export function getAlertConfigs() {
  return apiServer<AlertConfig[]>("/v1/alerts/config", { cache: "no-store" });
}
