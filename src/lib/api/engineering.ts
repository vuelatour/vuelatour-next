"use client";

import { apiBrowser } from "./browser";
import type {
  AdjuntoIngenieria,
  AdjuntosIngenieriaRespuesta,
  ComponenteAeronave,
  ComponenteBody,
  ComponentesAeronaveRespuesta,
  DocumentType,
  Mantenimiento,
  ReemplazarComponenteBody,
  ReemplazoComponenteRespuesta,
  RegistrarAdjuntoBody,
  RetirarComponenteBody,
  UrlAdjuntoRespuesta,
  Vencimiento,
  VencimientoEliminado,
} from "@/types/engineering";

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

// ── Mantenimiento unificado (17-nov-2026, API 0.0.140) ──────────────────────

/** Evidencias y documentos de ingeniería del avión (mantenimientos, componentes, motores y hélices). */
export function listAdjuntosIngenieria(aircraftId: string) {
  return apiBrowser<AdjuntosIngenieriaRespuesta>(
    `/v1/engineering/aircraft/${aircraftId}/adjuntos`,
  );
}

/** Registra un archivo que el navegador YA subió al bucket `documentos-flota`. */
export function registrarAdjuntoIngenieria(body: RegistrarAdjuntoBody) {
  return apiBrowser<AdjuntoIngenieria>("/v1/engineering/adjuntos", {
    method: "POST",
    body,
  });
}

/** URL firmada (10 min) para ver o descargar el archivo. */
export function urlAdjuntoIngenieria(adjuntoId: string, descargar: boolean) {
  return apiBrowser<UrlAdjuntoRespuesta>(
    `/v1/engineering/adjuntos/${adjuntoId}/url`,
    { searchParams: { descargar } },
  );
}

/** Borrado suave: el archivo se conserva en el bucket. */
export function quitarAdjuntoIngenieria(adjuntoId: string) {
  return apiBrowser<{ ok: boolean }>(`/v1/engineering/adjuntos/${adjuntoId}`, {
    method: "DELETE",
  });
}

/** Componentes con vida límite del avión, con lo que les queda ya calculado. */
export function listComponentesAeronave(aircraftId: string) {
  return apiBrowser<ComponentesAeronaveRespuesta>(
    `/v1/engineering/aircraft/${aircraftId}/components`,
  );
}

export function crearComponenteAeronave(aircraftId: string, body: ComponenteBody) {
  return apiBrowser<ComponenteAeronave>(
    `/v1/engineering/aircraft/${aircraftId}/components`,
    { method: "POST", body },
  );
}

export function actualizarComponenteAeronave(componenteId: string, body: ComponenteBody) {
  return apiBrowser<ComponenteAeronave>(
    `/v1/engineering/components/${componenteId}`,
    { method: "PATCH", body },
  );
}

/** Cambio de componente: retira el instalado y da de alta el nuevo. */
export function reemplazarComponenteAeronave(
  componenteId: string,
  body: ReemplazarComponenteBody,
) {
  return apiBrowser<ReemplazoComponenteRespuesta>(
    `/v1/engineering/components/${componenteId}/reemplazar`,
    { method: "POST", body },
  );
}

/** Retira el componente sin poner otro. */
export function retirarComponenteAeronave(
  componenteId: string,
  body: RetirarComponenteBody,
) {
  return apiBrowser<ComponenteAeronave>(
    `/v1/engineering/components/${componenteId}/retirar`,
    { method: "POST", body },
  );
}

/** Borrado suave (captura por error). */
export function eliminarComponenteAeronave(componenteId: string) {
  return apiBrowser<{ ok: boolean }>(
    `/v1/engineering/components/${componenteId}`,
    { method: "DELETE" },
  );
}
