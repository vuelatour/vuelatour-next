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
  /** Copiloto del viaje (segundo piloto). null = quitarlo. */
  copiloto_id?: string | null;
  /** Apoyo en tierra (maletas, pagos, cobros, gastos). null = quitarlo. */
  apoyo_id?: string | null;
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

/**
 * Convierte un vuelo propio en CUBIERTO por operador externo (suelta avión,
 * piloto y tacómetros; el cobro al cliente no cambia). Sobre un vuelo ya
 * externo solo actualiza operador/costo.
 */
export async function cubrirExternoAction(
  id: string,
  payload: {
    operador_externo: string;
    costo_externo_usd: number;
    /** TC MXN/USD pactado (opcional): habilita facturar el vuelo en MXN. */
    tc_usd_mxn?: number;
  },
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(
      `/v1/flights/${id}/cubrir-externo`,
      { method: "POST", body: payload },
    );
    revalidateFlight(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Regresa un vuelo cubierto por externo a vuelo PROPIO (asignable de nuevo). */
export async function revertirExternoAction(
  id: string,
): Promise<ActionResult<FlightListItem>> {
  try {
    const updated = await apiServer<FlightListItem>(
      `/v1/flights/${id}/revertir-externo`,
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
  pasajeros_nombres?: string[];
  fecha_vuelo?: string;
  fecha_traslado_final?: string;
  estado_permiso?: "no_aplica" | "pendiente" | "emitido";
  /** Solo vuelos externos sin desglose de cotización (el API lo valida). */
  metodo_cobro?: string;
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
  /** % que el banco retiene de este cobro; el banco deposita monto − comisión. */
  comision_banco_pct?: number;
  /** Comisión como MONTO directo (moneda del cobro): manda sobre el %. */
  comision_banco_monto?: number;
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

/** Elimina un cobro capturado por error (oficina). El backend recalcula la bandera cobrado. */
export async function deleteCobroAction(
  flightId: string,
  cobroId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/flights/cobros/${cobroId}`, { method: "DELETE" });
    revalidateFlight(flightId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Elimina un vuelo SIN actividad (solicitud fantasma). El backend rechaza si tiene cobros/gastos/tacos. */
export async function deleteFlightAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/flights/${id}`, { method: "DELETE" });
    revalidatePath("/admin/flights");
    revalidatePath("/admin/quotes");
    revalidatePath("/admin/calendar");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Cancela el vuelo (con motivo). Los gastos ya capturados SE CONSERVAN y
 * siguen sumando en reportes/reparto (regla del cliente: la operación pagada
 * de un vuelo que no se hizo cuenta, salvo que el proveedor cancele la
 * factura — en ese caso oficina elimina el gasto).
 */
export async function cancelFlightAction(
  id: string,
  motivo: string,
): Promise<ActionResult<FlightListItem>> {
  try {
    const data = await apiServer<FlightListItem>(`/v1/flights/${id}/cancel`, {
      method: "POST",
      body: { motivo },
    });
    revalidateFlight(id);
    revalidatePath("/admin/calendar");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Cambio de aeronave de último minuto: clona el vuelo (cobros se mueven) y el original queda CANCELADO con sus gastos. */
export async function reassignAircraftAction(
  id: string,
  payload: { aeronave_id: string; motivo?: string },
): Promise<ActionResult<FlightListItem>> {
  try {
    const clon = await apiServer<FlightListItem>(`/v1/flights/${id}/reassign-aircraft`, {
      method: "POST",
      body: payload,
    });
    revalidateFlight(id);
    revalidatePath("/admin/calendar");
    return { ok: true, data: clon };
  } catch (err) {
    return fail(err);
  }
}

// ============ Escalas ============

export interface EscalaPayload {
  orden: number;
  origen_iata: string;
  destino_iata: string;
  /** Salida PROGRAMADA (la que ve el piloto). Las horas reales las pone el sistema al capturar tacos. */
  fecha_salida_plan?: string;
  /** Tramo de sobrevuelo (recorrido sobre una zona, no un traslado normal). */
  es_sobrevuelo?: boolean;
  /** Ferry/posicionamiento: sin pasajeros; el piloto lo ve, el cliente no. */
  es_ferry?: boolean;
  /** Pasajeros del tramo (0 en ferry). */
  pasajeros?: number;
  /** Manifiesto de nombres de ESTE tramo (array vacío = borrar los guardados). */
  pasajeros_nombres?: string[];
  /** El piloto pernocta tras este tramo. */
  requiere_pernocta?: boolean;
  /** Parada de servicio/técnica (cambiar llanta, revisión…). */
  tipo_parada?: "NORMAL" | "SERVICIO";
  /** Detalle de la parada de servicio (null = limpiar al apagar el switch). */
  servicio_notas?: string | null;
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

export interface OperationalLegPayload {
  origen_iata: string;
  destino_iata: string;
  pasajeros?: number;
  /** Manifiesto de nombres de ESTE tramo (un ferry vuela vacío). */
  pasajeros_nombres?: string[];
  es_ferry?: boolean;
  es_sobrevuelo?: boolean;
  requiere_pernocta?: boolean;
  tipo_parada?: "NORMAL" | "SERVICIO";
  servicio_notas?: string;
  fecha_salida_plan?: string;
  notas?: string;
}

/** Agrega un tramo operativo interno (ruta real) sin tocar la cotización. */
export async function createOperationalLegAction(
  flightId: string,
  payload: OperationalLegPayload,
): Promise<ActionResult<FlightEscala>> {
  try {
    const escala = await apiServer<FlightEscala>(
      `/v1/flights/${flightId}/operational-legs`,
      { method: "POST", body: payload },
    );
    revalidateFlight(flightId);
    revalidatePath("/admin/calendar");
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

/**
 * Cancela UN tramo que no voló (motivo obligatorio): anula sus lecturas
 * provisionales y lo saca de horas/completitud/calendario/app del piloto.
 */
export async function cancelEscalaAction(
  flightId: string,
  escalaId: string,
  motivo: string,
): Promise<ActionResult<FlightEscala>> {
  try {
    const data = await apiServer<FlightEscala>(
      `/v1/flights/legs/${escalaId}/cancel`,
      { method: "POST", body: { motivo } },
    );
    revalidateFlight(flightId);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Restaura un tramo cancelado a la ruta activa (las lecturas no regresan). */
export async function restoreEscalaAction(
  flightId: string,
  escalaId: string,
): Promise<ActionResult<FlightEscala>> {
  try {
    const data = await apiServer<FlightEscala>(
      `/v1/flights/legs/${escalaId}/restore`,
      { method: "POST" },
    );
    revalidateFlight(flightId);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ============ Tacómetros: revisión de oficina ============

export interface ConfirmTacoPayload {
  taco_salida?: number;
  taco_llegada?: number;
  nota?: string;
}

/** Oficina confirma una lectura marcada para revisión (amarillo → verde). */
export async function confirmTacoAction(
  flightId: string,
  escalaId: string,
  payload: ConfirmTacoPayload = {},
): Promise<ActionResult<FlightEscala>> {
  try {
    const data = await apiServer<FlightEscala>(
      `/v1/flights/legs/${escalaId}/taco/confirm`,
      { method: "POST", body: payload },
    );
    revalidateFlight(flightId);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Rellena huecos de tacómetro del vuelo con el promedio del tramo (queda amarillo). */
/**
 * Última lectura de tacómetro del avión del vuelo (historial): el diálogo de
 * captura/corrección la precarga como salida sugerida.
 */
export async function getUltimoTacoAction(
  flightId: string,
): Promise<ActionResult<{ ultimo_taco: number | null }>> {
  try {
    const data = await apiServer<{ ultimo_taco: number | null }>(
      `/v1/flights/${flightId}/ultimo-taco`,
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function fillTacoGapsAction(
  flightId: string,
): Promise<ActionResult<{ escalas_actualizadas: number }>> {
  try {
    const data = await apiServer<{ escalas_actualizadas: number }>(
      `/v1/flights/${flightId}/taco/fill-gaps`,
      { method: "POST", body: {} },
    );
    revalidateFlight(flightId);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ============ Vuelos externos ============

// ============ Reserva tentativa ============

/** Tramo del itinerario de OPERACIÓN (la ruta real que ve el piloto). */
export interface ReservaEscalaPayload {
  origen_iata: string;
  destino_iata: string;
  hora_salida?: string;
  es_ferry?: boolean;
  es_sobrevuelo?: boolean;
  pasajeros?: number;
  pasajeros_nombres?: string[];
  /** El piloto pernocta tras este tramo (se suma a la derivación por fechas). */
  requiere_pernocta?: boolean;
  /** Parada de servicio/técnica del tramo. */
  tipo_parada?: "NORMAL" | "SERVICIO";
  servicio_notas?: string;
  notas?: string;
}

export interface CreateReservaPayload {
  cliente_id: string;
  /** Requeridos solo si NO se envía escalas_operacion. */
  origen_iata?: string;
  destino_iata?: string;
  /** Itinerario de operación completo (creación rápida). */
  escalas_operacion?: ReservaEscalaPayload[];
  fecha_vuelo: string;
  fecha_traslado_final?: string;
  pasajeros?: number;
  aeronave_id?: string;
  piloto_id?: string;
  /** Copiloto (2do piloto): ve todo el vuelo igual que el piloto. */
  copiloto_id?: string;
  cotizacion_abierta?: boolean;
  pasajeros_nombres?: string[];
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

