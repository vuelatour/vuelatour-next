"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type {
  FlightCobro,
  FlightEscala,
  FlightListItem,
} from "@/types/flights";
import type { MetodoPago } from "@/types/quote";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

function revalidateFlight(id: string) {
  revalidatePath("/admin/flights");
  revalidatePath(`/admin/flights/${id}`);
}

export interface AssignFlightPayload {
  aeronave_id?: string;
  piloto_id?: string;
  fecha_vuelo?: string;
}

export async function assignFlightAction(
  id: string,
  payload: AssignFlightPayload,
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(`/v1/flights/${id}/assign`, {
      method: "POST",
      body: payload,
    });
    revalidateFlight(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePermisoAction(
  flightId: string,
  estado_permiso: "no_aplica" | "pendiente" | "emitido",
): Promise<ActionResult<FlightListItem>> {
  try {
    const data = await apiServer<FlightListItem>(`/v1/flights/${flightId}/permiso`, {
      method: "PATCH",
      body: { estado_permiso },
    });
    revalidateFlight(flightId);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface PilotoDisponibilidad {
  id: string;
  nombre: string;
  horas_mes: number;
  limite_horas_mes: number;
  excede_limite: boolean;
  cerca_limite: boolean;
  conflicto: boolean;
  conflicto_folio: number | null;
}

export async function getPilotosDisponibilidadAction(
  flightId: string,
): Promise<ActionResult<PilotoDisponibilidad[]>> {
  try {
    const data = await apiServer<PilotoDisponibilidad[]>(
      `/v1/flights/${flightId}/pilotos-disponibilidad`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function startFlightAction(
  id: string,
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(`/v1/flights/${id}/start`, {
      method: "POST",
    });
    revalidateFlight(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function completeFlightAction(
  id: string,
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(
      `/v1/flights/${id}/complete`,
      { method: "POST" },
    );
    revalidateFlight(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface UpdateFlightPayload {
  piloto_id?: string | null;
  fecha_vuelo?: string;
  fecha_traslado_final?: string;
  estado_permiso?: "no_aplica" | "pendiente" | "emitido";
  notas?: string;
  notas_internas?: string;
  facturado?: boolean;
  cobrado?: boolean;
}

export async function updateFlightAction(
  id: string,
  payload: UpdateFlightPayload,
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(`/v1/flights/${id}`, {
      method: "PATCH",
      body: payload,
    });
    revalidateFlight(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface RegisterCobroPayload {
  monto: number;
  moneda: "USD" | "MXN";
  metodo_cobro: MetodoPago;
  tc_usd_mxn?: number;
  referencia?: string;
  fecha_cobro?: string;
  notas?: string;
}

export async function registerCobroAction(
  flightId: string,
  payload: RegisterCobroPayload,
): Promise<ActionResult<FlightCobro>> {
  if (!(payload.monto > 0)) {
    return { ok: false, error: "El monto debe ser mayor a 0" };
  }
  try {
    const cobro = await apiServer<FlightCobro>(
      `/v1/flights/${flightId}/payments`,
      {
        method: "POST",
        body: payload,
      },
    );
    revalidateFlight(flightId);
    return { ok: true, data: cobro };
  } catch (err) {
    return fail(err);
  }
}

// ============ Escalas ============

export interface EscalaPayload {
  orden: number;
  origen_iata: string;
  destino_iata: string;
  hora_salida?: string;
  hora_llegada?: string;
  notas?: string;
}

export async function createEscalaAction(
  flightId: string,
  payload: EscalaPayload,
): Promise<ActionResult<FlightEscala>> {
  try {
    const escala = await apiServer<FlightEscala>(
      `/v1/flights/${flightId}/legs`,
      { method: "POST", body: payload },
    );
    revalidateFlight(flightId);
    return { ok: true, data: escala };
  } catch (err) {
    return fail(err);
  }
}

export interface AssignEscalaPayload {
  aeronave_id?: string;
  piloto_id?: string;
  fecha_salida_plan?: string;
}

/** Asigna aeronave/piloto a UN tramo (ida o regreso por separado). */
export async function assignEscalaAction(
  flightId: string,
  escalaId: string,
  payload: AssignEscalaPayload,
): Promise<ActionResult<FlightEscala>> {
  try {
    const escala = await apiServer<FlightEscala>(
      `/v1/flights/${flightId}/legs/${escalaId}/assign`,
      { method: "POST", body: payload },
    );
    revalidateFlight(flightId);
    return { ok: true, data: escala };
  } catch (err) {
    return fail(err);
  }
}

/** Actualiza el permiso de pista de un tramo. */
export async function updateEscalaPermisoAction(
  flightId: string,
  escalaId: string,
  estado_permiso: "no_aplica" | "pendiente" | "emitido",
): Promise<ActionResult<FlightEscala>> {
  try {
    const escala = await apiServer<FlightEscala>(
      `/v1/flights/legs/${escalaId}/permiso`,
      { method: "PATCH", body: { estado_permiso } },
    );
    revalidateFlight(flightId);
    return { ok: true, data: escala };
  } catch (err) {
    return fail(err);
  }
}

export async function updateEscalaAction(
  flightId: string,
  escalaId: string,
  payload: Partial<EscalaPayload>,
): Promise<ActionResult<FlightEscala>> {
  try {
    const escala = await apiServer<FlightEscala>(
      `/v1/flights/legs/${escalaId}`,
      { method: "PATCH", body: payload },
    );
    revalidateFlight(flightId);
    return { ok: true, data: escala };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteEscalaAction(
  flightId: string,
  escalaId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/flights/legs/${escalaId}`, { method: "DELETE" });
    revalidateFlight(flightId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ============ Vuelos externos ============

export interface CreateExternalFlightPayload {
  cliente_id: string;
  operador_externo: string;
  costo_externo_usd: number;
  monto_total_usd: number;
  origen_iata: string;
  destino_iata: string;
  pasajeros: number;
  fecha_vuelo?: string;
  notas?: string;
  notas_internas?: string;
}

// ============ Reserva tentativa ============

export interface CreateReservaPayload {
  cliente_id: string;
  origen_iata: string;
  destino_iata: string;
  fecha_vuelo: string;
  fecha_traslado_final?: string;
  pasajeros?: number;
  aeronave_id?: string;
  piloto_id?: string;
  cotizacion_abierta?: boolean;
  notas?: string;
  notas_internas?: string;
}

/** Aparta el espacio en el calendario SIN cotización (vuelo propio tentativo). */
export async function createReservaAction(
  payload: CreateReservaPayload,
): Promise<ActionResult<FlightListItem>> {
  if (!payload.cliente_id) return { ok: false, error: "Cliente requerido" };
  if (!payload.fecha_vuelo) return { ok: false, error: "Fecha requerida" };
  try {
    const flight = await apiServer<FlightListItem>("/v1/flights/reserva", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/flights");
    revalidatePath("/admin/calendar");
    return { ok: true, data: flight };
  } catch (err) {
    return fail(err);
  }
}

export async function createExternalFlightAction(
  payload: CreateExternalFlightPayload,
): Promise<ActionResult<FlightListItem>> {
  if (!payload.cliente_id) return { ok: false, error: "Cliente requerido" };
  if (!(payload.monto_total_usd > 0))
    return { ok: false, error: "Monto total debe ser > 0" };
  if (!(payload.costo_externo_usd >= 0))
    return { ok: false, error: "Costo externo debe ser >= 0" };
  try {
    const flight = await apiServer<FlightListItem>("/v1/flights/external", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/flights");
    return { ok: true, data: flight };
  } catch (err) {
    return fail(err);
  }
}
