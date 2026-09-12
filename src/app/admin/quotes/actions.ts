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
  /** HTTP del API cuando el error viene de él (409 = candado/concurrencia). */
  status?: number;
  /** Código estructurado del API (p. ej. `COTIZACION_COBRADA`). */
  code?: string;
  /** Detalle estructurado del API (p. ej. `{discrepancias}` del squawk ALTA). */
  details?: unknown;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: err.message,
      status: err.status,
      code: err.code,
      details: err.details,
    };
  }
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
  /** Idempotencia (contrato 8-sep-2026): misma llave → misma cotización
      (un doble clic o un reintento no crean dos folios). uuid por intento. */
  client_request_id?: string;
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

/**
 * Respuesta de `POST /v1/quotes`: la cotización creada + `avisos[]` NO
 * bloqueantes (campo ADITIVO, siempre presente aunque vacío desde el
 * 11-sep-2026; p. ej. «el avión está en taller»). Se pintan con
 * `toastAvisos` DESPUÉS de crear — nunca bloquean el alta.
 */
export interface CreatedQuote extends PersistedQuote {
  avisos?: string[] | null;
}

export async function createQuoteAction(payload: CreateQuotePayload): Promise<ActionResult<CreatedQuote>> {
  if (!payload.cliente_id) return { ok: false, error: "cliente_id es requerido" };
  try {
    const created = await apiServer<CreatedQuote>("/v1/quotes", {
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

/**
 * Visibilidad en PDF de UN tramo, directo sobre la escala VIVA (1-sep): el
 * switch del cotizador se retiró (rehidrataba del snapshot y un guardado sin
 * la bandera la regresaba a visible). Presentación pura: el tramo oculto se
 * sigue cobrando y la numeración del PDF se ajusta sola.
 */
export async function setEscalaPdfVisibilidadAction(
  vueloId: string,
  escalaId: string,
  oculto: boolean,
): Promise<ActionResult> {
  try {
    const data = await apiServer<unknown>(
      `/v1/quotes/${vueloId}/escalas/${escalaId}/pdf-visibilidad`,
      { method: "PATCH", body: { oculto } },
    );
    revalidatePath(`/admin/quotes/${vueloId}`);
    revalidatePath(`/admin/flights/${vueloId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Fecha del tramo para el PDF del cliente (3-sep): MISMA ruta PATCH
 * pdf-visibilidad (el API acepta oculto y/o pdf_fecha). `pdf_fecha` es un
 * string 'YYYY-MM-DD' de PARED (sin hora ni zona; nunca un Date) o null para
 * quitarla. Presentación pura: no toca la ruta operativa ni las fechas de
 * vuelo y no crea versión de cotización.
 */
export async function setEscalaPdfFechaAction(
  vueloId: string,
  escalaId: string,
  pdf_fecha: string | null,
): Promise<ActionResult> {
  try {
    const data = await apiServer<unknown>(
      `/v1/quotes/${vueloId}/escalas/${escalaId}/pdf-visibilidad`,
      { method: "PATCH", body: { pdf_fecha } },
    );
    revalidatePath(`/admin/quotes/${vueloId}`);
    revalidatePath(`/admin/flights/${vueloId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Presentación del PDF a nivel COTIZACIÓN sin versión (D5, F2 8-sep-2026):
 * notas del cliente y los toggles «tarifa/hr» e «itinerario» son
 * presentación, igual que el ojito por tramo — cuando son lo ÚNICO que
 * cambió no generan versión. Contrato (5): `PATCH /v1/quotes/:id/pdf-visibilidad`
 * acepta `notas`, `pdf_mostrar_tarifa`, `pdf_mostrar_itinerario` (parcial:
 * solo viaja lo que cambió). Backend en paralelo: mientras no esté
 * desplegado responde 404 → el cotizador cae al guardado con versión.
 */
export interface PdfPresentacionPayload {
  notas?: string;
  pdf_mostrar_tarifa?: boolean;
  pdf_mostrar_itinerario?: boolean;
}

export async function setQuotePdfPresentacionAction(
  vueloId: string,
  payload: PdfPresentacionPayload,
): Promise<ActionResult> {
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "Nada que guardar" };
  }
  try {
    const data = await apiServer<unknown>(`/v1/quotes/${vueloId}/pdf-visibilidad`, {
      method: "PATCH",
      body: payload,
    });
    revalidatePath(`/admin/quotes/${vueloId}`);
    revalidatePath(`/admin/flights/${vueloId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface ReviseQuotePayload extends CalculateQuoteRequest {
  pasajeros_nombres?: string[];
  fecha_vuelo?: string;
  fecha_traslado_final?: string;
  motivo: string;
  /** Idempotencia (contrato 8-sep-2026): misma llave → misma versión; se
      reusa en los reintentos del MISMO intento de guardado. */
  client_request_id?: string;
  notas?: string;
  /** Vuelo externo (28-ago): operador y lo que cobra el operador externo se
      editan también al revisar. monto null limpia el costo; con MXN el API
      deriva el USD con tc_usd_mxn (obligatorio ahí). */
  operador_externo?: string;
  costo_externo_monto?: number | null;
  costo_externo_moneda?: "USD" | "MXN";
  /** Guardar la versión AUNQUE el avión nuevo tenga un squawk ALTA abierto
      (confirmación de la oficina en el diálogo; el API avisa al mecánico).
      Solo pesa cuando el cotizador CAMBIA el avión — invariante 14 del API. */
  aceptar_discrepancia_alta?: boolean;
}

/**
 * Respuesta de `revise` (API 0.0.6): la cotización guardada + `avisos[]` NO
 * bloqueantes (siempre presente; p. ej. «los tramos con tacómetro no se
 * movieron al avión nuevo»). Se pintan con `toastAvisos` DESPUÉS de guardar.
 */
export interface RevisedQuote extends PersistedQuote {
  avisos?: string[] | null;
}

export async function reviseQuoteAction(
  id: string,
  payload: ReviseQuotePayload,
): Promise<ActionResult<RevisedQuote>> {
  if (!payload.motivo) return { ok: false, error: "motivo es requerido" };
  try {
    const updated = await apiServer<RevisedQuote>(`/v1/quotes/${id}/revise`, {
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
