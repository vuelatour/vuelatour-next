"use client";

import { apiBrowser } from "./browser";
import type { DocumentType, Mantenimiento, Vencimiento } from "@/types/engineering";

export function listMaintenance(aircraftId: string) {
  return apiBrowser<Mantenimiento[]>(`/v1/engineering/aircraft/${aircraftId}/maintenance`);
}

export function createMaintenance(aircraftId: string, body: Record<string, unknown>) {
  return apiBrowser<Mantenimiento>(`/v1/engineering/aircraft/${aircraftId}/maintenance`, {
    method: "POST",
    body,
  });
}

export function listExpirations(aircraftId: string) {
  return apiBrowser<Vencimiento[]>(`/v1/engineering/aircraft/${aircraftId}/expirations`);
}

export function createExpiration(aircraftId: string, body: Record<string, unknown>) {
  return apiBrowser<Vencimiento>(`/v1/engineering/aircraft/${aircraftId}/expirations`, {
    method: "POST",
    body,
  });
}

export function listDocumentTypes() {
  return apiBrowser<DocumentType[]>("/v1/engineering/document-types");
}
