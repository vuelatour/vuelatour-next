"use client";

import { apiBrowser } from "./browser";
import type { AlertConfig } from "@/types/alerts";

export function updateAlertConfig(
  clave: string,
  patch: Partial<Pick<AlertConfig, "activa" | "canal" | "roles" | "dias_anticipacion" | "horas_anticipacion">>,
): Promise<AlertConfig> {
  return apiBrowser<AlertConfig>(`/v1/alerts/config/${clave}`, {
    method: "PATCH",
    body: patch,
  });
}

export function runAlerts(): Promise<{ ejecutadas: string[] }> {
  return apiBrowser<{ ejecutadas: string[] }>("/v1/alerts/run", { method: "POST" });
}
