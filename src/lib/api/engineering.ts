"use client";

import { apiBrowser } from "./browser";
import type { DocumentType, Mantenimiento, Vencimiento, VencimientoEliminado } from "@/types/engineering";

export function listMaintenance(aircraftId: string) {
  return apiBrowser<Mantenimiento[]>(`/v1/engineering/aircraft/${aircraftId}/maintenance`);
}

export function createMaintenance(aircraftId: string, body: Record<string, unknown>) {
  return apiBrowser<Mantenimiento>(`/v1/engineering/aircraft/${aircraftId}/maintenance`, {
    method: "POST",
    body,
  });
}

export function updateMaintenance(maintenanceId: string, body: Record<string, unknown>) {
  return apiBrowser<Mantenimiento>(`/v1/engineering/maintenance/${maintenanceId}`, {
    method: "PATCH",
    body,
  });
}

export function listExpirations(aircraftId: string) {
  return apiBrowser<Vencimiento[]>(`/v1/engineering/aircraft/${aircraftId}/expirations`);
}

/** Documentos eliminados (borrado suave): quién/cuándo, restaurables. */
export function listExpirationsEliminadas(aircraftId: string) {
  return apiBrowser<VencimientoEliminado[]>(
    `/v1/engineering/aircraft/${aircraftId}/expirations-eliminadas`,
  );
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
