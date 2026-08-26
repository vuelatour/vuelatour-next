"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  AircraftFormSchema,
  EngineFormSchema,
  InsuranceFormSchema,
  OverhaulSchema,
  OwnerFormSchema,
  PlaneadorBaseSchema,
  PropellerFormSchema,
  ServicioProgramaEtapasSchema,
  SquawkFormSchema,
  TransplantSchema,
} from "./schema";
import type {
  Aircraft,
  AeronaveImagen,
  AeronaveDiscrepancia,
  AeronaveSeguro,
  AircraftOwner,
  ComponenteEvento,
  Motor,
  Propeller,
  TacometroHistorial,
} from "@/types/aircraft";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** HTTP status del API cuando la falla vino de él (p. ej. 409 = conflicto). */
  status?: number;
  fieldErrors?: Record<string, string[]>;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message, status: err.status };
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Error desconocido",
  };
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function revalidateAircraft(id?: string) {
  revalidatePath("/admin/aircraft");
  if (id) revalidatePath(`/admin/aircraft/${id}`);
}

export async function createAircraftAction(raw: unknown): Promise<ActionResult<Aircraft>> {
  const parsed = AircraftFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Aircraft>("/v1/aircraft", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft();
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateAircraftAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<Aircraft>> {
  const parsed = AircraftFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Aircraft>(`/v1/aircraft/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Histórico de tacómetros + horas actuales y próximo servicio de la aeronave. */
export async function aircraftTacometrosAction(
  id: string,
): Promise<ActionResult<TacometroHistorial>> {
  try {
    const data = await apiServer<TacometroHistorial>(`/v1/aircraft/${id}/tacometros`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Guarda el programa de servicio por ETAPAS (intervalo + nombre + tareas) y la
 * base. Manda SOLO servicio_etapas: el API deriva servicio_intervalos (fuente
 * de verdad única; mandarlos juntos divergiría).
 */
export async function updateServicioEtapasAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<Aircraft>> {
  const parsed = ServicioProgramaEtapasSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const etapas = parsed.data.servicio_etapas.map((e) => ({
      intervalo_hr: e.intervalo_hr,
      nombre: e.nombre?.trim() || undefined,
      tareas: (e.tareas ?? []).map((t) => t.trim()).filter((t) => t.length > 0),
    }));
    const updated = await apiServer<Aircraft>(`/v1/aircraft/${id}`, {
      method: "PATCH",
      body: {
        servicio_etapas: etapas,
        servicio_horas_base: parsed.data.servicio_horas_base,
      },
    });
    revalidateAircraft(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Base histórica del planeador (tiempo total = base + hobbs − ref). Las horas
 * operativas siguen derivándose del tacómetro; esto solo fija la base real.
 */
export async function updatePlaneadorBaseAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<Aircraft>> {
  const parsed = PlaneadorBaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Aircraft>(`/v1/aircraft/${id}`, {
      method: "PATCH",
      body: parsed.data,
    });
    revalidateAircraft(id);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAircraftAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/aircraft/${id}`, { method: "DELETE" });
    revalidateAircraft(id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Dueños / socios =====

export async function createOwnerAction(
  aircraftId: string,
  raw: unknown,
): Promise<ActionResult<AircraftOwner>> {
  const parsed = OwnerFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const owner = await apiServer<AircraftOwner>(`/v1/aircraft/${aircraftId}/owners`, {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: owner };
  } catch (err) {
    return fail(err);
  }
}

export async function updateOwnerAction(
  aircraftId: string,
  ownerId: string,
  raw: unknown,
): Promise<ActionResult<AircraftOwner>> {
  const parsed = OwnerFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const owner = await apiServer<AircraftOwner>(`/v1/aircraft/owners/${ownerId}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: owner };
  } catch (err) {
    return fail(err);
  }
}

export async function closeOwnerAction(
  aircraftId: string,
  ownerId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/aircraft/owners/${ownerId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Motores =====

export async function createEngineAction(
  aircraftId: string,
  raw: unknown,
): Promise<ActionResult<Motor>> {
  const parsed = EngineFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const engine = await apiServer<Motor>("/v1/engines", {
      method: "POST",
      body: { ...stripEmpty(parsed.data), aeronave_id: aircraftId },
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: engine };
  } catch (err) {
    return fail(err);
  }
}

export async function updateEngineAction(
  aircraftId: string,
  engineId: string,
  raw: unknown,
): Promise<ActionResult<Motor>> {
  const parsed = EngineFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const engine = await apiServer<Motor>(`/v1/engines/${engineId}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: engine };
  } catch (err) {
    return fail(err);
  }
}

// ===== Hélices =====

export async function deleteEngineAction(
  aircraftId: string,
  engineId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/engines/${engineId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createPropellerAction(
  aircraftId: string,
  raw: unknown,
): Promise<ActionResult<Propeller>> {
  const parsed = PropellerFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const prop = await apiServer<Propeller>("/v1/propellers", {
      method: "POST",
      body: { ...stripEmpty(parsed.data), aeronave_id: aircraftId },
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: prop };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePropellerAction(
  aircraftId: string,
  propellerId: string,
  raw: unknown,
): Promise<ActionResult<Propeller>> {
  const parsed = PropellerFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const prop = await apiServer<Propeller>(`/v1/propellers/${propellerId}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: prop };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePropellerAction(
  aircraftId: string,
  propellerId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/propellers/${propellerId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Componentes rotables (motores Y hélices): bitácora / traslado / overhaul =====

export type TipoComponente = "MOTOR" | "HELICE";

function componentBase(tipo: TipoComponente): string {
  return tipo === "MOTOR" ? "/v1/engines" : "/v1/propellers";
}

/** Bitácora del componente: instalaciones, traslados, overhauls y ajustes. */
export async function componentEventosAction(
  tipo: TipoComponente,
  componentId: string,
): Promise<ActionResult<ComponenteEvento[]>> {
  try {
    const data = await apiServer<ComponenteEvento[]>(
      `${componentBase(tipo)}/${componentId}/eventos`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Traslada el componente a otra aeronave conservando sus horas de vida.
 * 409 = la posición destino ya está ocupada (el dialog lo traduce).
 */
export async function transplantComponentAction(
  aircraftId: string,
  tipo: TipoComponente,
  componentId: string,
  raw: unknown,
): Promise<ActionResult> {
  const parsed = TransplantSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await apiServer(`${componentBase(tipo)}/${componentId}/transplant`, {
      method: "POST",
      body: parsed.data,
    });
    revalidateAircraft(aircraftId);
    // El avión destino también cambió (recibió el componente).
    revalidatePath(`/admin/aircraft/${parsed.data.aeronave_destino_id}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Registra un overhaul: TSO→0, TSN se conserva, queda en la bitácora. */
export async function overhaulComponentAction(
  aircraftId: string,
  tipo: TipoComponente,
  componentId: string,
  raw: unknown,
): Promise<ActionResult> {
  const parsed = OverhaulSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const v = parsed.data;
    await apiServer(`${componentBase(tipo)}/${componentId}/overhaul`, {
      method: "POST",
      body: {
        ...(v.fecha ? { fecha: v.fecha } : {}),
        ...(v.motivo?.trim() ? { motivo: v.motivo.trim() } : {}),
        ...(v.tbo_horas != null ? { tbo_horas: v.tbo_horas } : {}),
        ...(v.tbo_fecha ? { tbo_fecha: v.tbo_fecha } : {}),
      },
    });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Seguros =====

export async function createInsuranceAction(
  aircraftId: string,
  raw: unknown,
): Promise<ActionResult<AeronaveSeguro>> {
  const parsed = InsuranceFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const seguro = await apiServer<AeronaveSeguro>(`/v1/aircraft/${aircraftId}/insurance`, {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: seguro };
  } catch (err) {
    return fail(err);
  }
}

export async function updateInsuranceAction(
  aircraftId: string,
  seguroId: string,
  raw: unknown,
): Promise<ActionResult<AeronaveSeguro>> {
  const parsed = InsuranceFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const seguro = await apiServer<AeronaveSeguro>(`/v1/aircraft/insurance/${seguroId}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: seguro };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteInsuranceAction(
  aircraftId: string,
  seguroId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/aircraft/insurance/${seguroId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** URL firmada (1 h) de la copia de la póliza (bucket privado, solo oficina). */
export async function getSeguroArchivoAction(
  seguroId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const data = await apiServer<{ url: string }>(
      `/v1/aircraft/insurance/${seguroId}/archivo`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Discrepancias (squawks) =====

export async function createSquawkAction(
  aircraftId: string,
  raw: unknown,
): Promise<ActionResult<AeronaveDiscrepancia>> {
  const parsed = SquawkFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const sq = await apiServer<AeronaveDiscrepancia>(`/v1/aircraft/${aircraftId}/squawks`, {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: sq };
  } catch (err) {
    return fail(err);
  }
}

export async function updateSquawkAction(
  aircraftId: string,
  squawkId: string,
  raw: unknown,
): Promise<ActionResult<AeronaveDiscrepancia>> {
  const parsed = SquawkFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const sq = await apiServer<AeronaveDiscrepancia>(`/v1/aircraft/squawks/${squawkId}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidateAircraft(aircraftId);
    return { ok: true, data: sq };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSquawkAction(
  aircraftId: string,
  squawkId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/aircraft/squawks/${squawkId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export interface RegisterAircraftImagePayload {
  storage_path: string;
  url: string;
  alt_text?: string;
  es_principal?: boolean;
  size_bytes?: number;
  content_type?: string;
}

export async function registerAircraftImageAction(
  aircraftId: string,
  payload: RegisterAircraftImagePayload,
): Promise<ActionResult<AeronaveImagen>> {
  try {
    const imagen = await apiServer<AeronaveImagen>(
      `/v1/aircraft/${aircraftId}/images`,
      { method: "POST", body: payload },
    );
    revalidateAircraft(aircraftId);
    return { ok: true, data: imagen };
  } catch (err) {
    return fail(err);
  }
}

export interface UpdateAircraftImagePayload {
  alt_text?: string;
  es_principal?: boolean;
  orden?: number;
  /** Uso en el PDF de cotización (una por aeronave); null = quitar. */
  etiqueta?: "EXTERIOR" | "INTERIOR" | null;
}

export async function updateAircraftImageAction(
  aircraftId: string,
  imageId: string,
  payload: UpdateAircraftImagePayload,
): Promise<ActionResult<AeronaveImagen>> {
  try {
    const imagen = await apiServer<AeronaveImagen>(
      `/v1/aircraft/images/${imageId}`,
      { method: "PATCH", body: payload },
    );
    revalidateAircraft(aircraftId);
    return { ok: true, data: imagen };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAircraftImageAction(
  aircraftId: string,
  imageId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/aircraft/images/${imageId}`, { method: "DELETE" });
    revalidateAircraft(aircraftId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
