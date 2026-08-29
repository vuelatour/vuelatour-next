"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { CalculateQuoteRequest } from "@/types/quote";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

export interface OperationalLegInput {
  origen_iata: string;
  destino_iata: string;
  es_ferry?: boolean;
  pasajeros?: number;
  /** Manifiesto de nombres de ESTE tramo (un ferry vuela vacío). */
  pasajeros_nombres?: string[];
  /** El piloto pernocta tras este tramo (se suma a la derivación por fechas). */
  requiere_pernocta?: boolean;
  /** Parada de servicio/técnica del tramo. */
  tipo_parada?: "NORMAL" | "SERVICIO";
  servicio_notas?: string;
  hora_salida?: string;
  notas?: string;
}

export interface CreateQuotePayload extends CalculateQuoteRequest {
  pasajeros_nombres?: string[];
  cliente_id: string;
  /** Ruta OPERATIVA real (opcional): escalas del piloto; la cotización no las pisa. */
  escalas_operacion?: OperationalLegInput[];
  tipo?: "REDONDO" | "MULTIESCALA";
  fecha_vuelo?: string;
  fecha_traslado_final?: string;
  notas?: string;
  notas_internas?: string;
  /** Vuelo CUBIERTO por operador externo: nace sin avión propio ni tacómetros;
      el avión seleccionado queda solo como referencia de tarifa. */
  es_externo?: boolean;
  operador_externo?: string;
  /** Lo que cobra el operador externo (costo para VuelaTour) en su moneda
      NATIVA. Con MXN el API deriva el USD con tc_usd_mxn (obligatorio ahí). */
  costo_externo_monto?: number;
  costo_externo_moneda?: "USD" | "MXN";
}

export async function createQuoteAction(payload: CreateQuotePayload): Promise<ActionResult<PersistedQuote>> {
  if (!payload.cliente_id) return { ok: false, error: "cliente_id es requerido" };
  try {
    const created = await apiServer<PersistedQuote>("/v1/quotes", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/quotes");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/** Ruta sugerida del historial del cliente (grupo de itinerarios iguales). */
export interface RutaSugerida {
  clave: string;
  etiqueta: string;
  veces: number;
  ultima_fecha: string | null;
  ruta_id: string | null;
  tramos: {
    origen_iata: string;
    destino_iata: string;
    millas_nauticas: number;
    pasajeros: number | null;
    es_ferry: boolean;
    requiere_pernocta: boolean;
    pernocta_costo_usd: number | null;
    tipo_parada: "NORMAL" | "SERVICIO";
    servicio_notas: string | null;
  }[];
}

/** Rutas que el cliente suele pedir, según su historial real de vuelos. */
export async function getRutasSugeridasAction(
  clienteId: string,
): Promise<ActionResult<RutaSugerida[]>> {
  try {
    const data = await apiServer<RutaSugerida[]>(
      `/v1/quotes/rutas-sugeridas?cliente_id=${clienteId}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface QuickAdjustPayload {
  /** monto_usd = monto NATIVO en la moneda del renglón (nombre legado). */
  extras?: {
    concepto: string;
    monto_usd: number;
    moneda?: "USD" | "MXN";
    aplica_iva?: boolean;
  }[];
  pasajeros?: number;
  motivo?: string;
}

/** Ajuste rápido (extras/pasajeros) desde el detalle; versiona como revisión. */
export async function quickAdjustQuoteAction(
  id: string,
  payload: QuickAdjustPayload,
): Promise<ActionResult<PersistedQuote>> {
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/ajuste`, {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    revalidatePath(`/admin/flights/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface ReviseQuotePayload extends CalculateQuoteRequest {
  pasajeros_nombres?: string[];
  fecha_vuelo?: string;
  fecha_traslado_final?: string;
  motivo: string;
  notas?: string;
  /** Vuelo externo (28-ago): operador y lo que cobra el operador externo se
      editan también al revisar. monto null limpia el costo; con MXN el API
      deriva el USD con tc_usd_mxn (obligatorio ahí). */
  operador_externo?: string;
  costo_externo_monto?: number | null;
  costo_externo_moneda?: "USD" | "MXN";
}

export async function reviseQuoteAction(
  id: string,
  payload: ReviseQuotePayload,
): Promise<ActionResult<PersistedQuote>> {
  if (!payload.motivo) return { ok: false, error: "motivo es requerido" };
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/revise`, {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmQuoteAction(id: string): Promise<ActionResult<PersistedQuote>> {
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/confirm`, {
      method: "POST",
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelQuoteAction(
  id: string,
  motivo?: string,
): Promise<ActionResult<PersistedQuote>> {
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/cancel`, {
      method: "POST",
      body: { motivo },
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}
