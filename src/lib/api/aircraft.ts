import { apiServer } from "./server";
import type {
  Aircraft,
  AircraftMetrics,
  AircraftSnapshot,
  ListResponse,
  PaisAeronave,
} from "@/types/aircraft";

export interface ListAircraftQuery {
  pais_registro?: PaisAeronave;
  activa?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listAircraft(query: ListAircraftQuery = {}) {
  return apiServer<ListResponse<Aircraft>>("/v1/aircraft", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getAircraftSnapshot(id: string) {
  return apiServer<AircraftSnapshot>(`/v1/aircraft/${id}/snapshot`, {
    cache: "no-store",
  });
}

/**
 * Contrato ampliado de `/v1/aircraft/:id/metrics` (jul 2026). Los campos
 * nuevos se tipan OPCIONALES a propósito: el API se despliega en paralelo y
 * la UI debe degradar a "—" mientras tanto — nunca inventar un 0 falso.
 */
export interface AircraftMetricsDetalle extends AircraftMetrics {
  airworthiness: AircraftMetrics["airworthiness"] & {
    /** Razones de no-apto ya redactadas por el API (incluyen discrepancias ALTA). */
    razones?: string[];
    /** Discrepancias abiertas de severidad ALTA, si el API las desglosa. */
    discrepancias_altas?: { id?: string; descripcion: string }[];
  };
  /** Horómetro (Hobbs) actual de la aeronave. */
  horas_actuales?: number | null;
  /** true si la aeronave tiene un vuelo EN_VUELO en este momento. */
  en_vuelo?: boolean;
  /** Próximo servicio del programa por horas. */
  proximo_servicio?: {
    titulo: string;
    horas_objetivo: number;
    faltan_hr: number;
  } | null;
  /** false = el avión NO tiene programa de servicio capturado (distinto de
   *  "sin datos"): el KPI lo dice y pide configurarlo. */
  programa_configurado?: boolean;
}

export function getAircraftMetrics(id: string) {
  return apiServer<AircraftMetricsDetalle>(`/v1/aircraft/${id}/metrics`, {
    cache: "no-store",
  });
}
