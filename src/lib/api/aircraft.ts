import { apiServer } from "./server";
import type {
  Aircraft,
  AircraftMetrics,
  AircraftSnapshot,
  ListResponse,
  OrdenServicioProgramada,
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
    searchParams: query as Record<
      string,
      string | number | boolean | undefined
    >,
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
  /** Tiempo TOTAL del planeador (base histórica + delta del taco). */
  tiempo_total_planeador?: number | null;
  /** true si la aeronave tiene un vuelo EN_VUELO en este momento. */
  en_vuelo?: boolean;
  /** Próximo servicio del programa por horas. */
  proximo_servicio?: {
    titulo: string;
    horas_objetivo: number;
    faltan_hr: number;
    /** Checklist de la(s) etapa(s) que caen en ese hito. */
    tareas?: string[];
    /**
     * Orden de servicio ABIERTA que cubre ese hito (ADITIVO, 19-sep-2026).
     * `undefined` = API sin desplegar; `null` = no hay orden. La línea que se
     * pinta la arma `lib/admin/proximo-servicio.ts` — el panel no decide
     * solo si «ya existe la orden».
     */
    orden?: OrdenServicioProgramada | null;
    /**
     * ¿La orden se crea sola y con qué margen? (ADITIVO, 20-sep-2026). Con
     * `activo:false` la tarjeta deja de prometer «se genera sola»: con la
     * regla apagada esa promesa es justo la queja del cliente. `null` = el
     * API no pudo leer la configuración; ausente = API sin desplegar.
     */
    aviso_automatico?: { activo: boolean; umbral_hr: number } | null;
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

/** Un mes del detalle de combustible del avión (moneda NATIVA, sin convertir). */
export interface CombustibleMes {
  mes: string; // YYYY-MM
  cargas: number;
  litros: number;
  /** Cargas del mes capturadas sin litros (el total de litros queda corto). */
  sin_litros: number;
  mxn: number;
  usd: number;
}

export interface CombustibleMensualResponse {
  desde: string;
  hasta: string;
  meses: CombustibleMes[];
}

/**
 * Gasto de combustible (GAS) del avión por mes — últimos 12 meses. Mismo
 * filtro que la hoja "combustible" del balance: los totales cuadran con el
 * Excel. Gateado a roles financieros (el expediente lo pide best-effort).
 */
export function getAircraftCombustibleMensual(id: string) {
  return apiServer<CombustibleMensualResponse>(
    `/v1/aircraft/${id}/combustible-mensual`,
    { cache: "no-store" },
  );
}
