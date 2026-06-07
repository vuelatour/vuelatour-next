"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  AircraftFormSchema,
  EngineFormSchema,
  InsuranceFormSchema,
  OwnerFormSchema,
  PropellerFormSchema,
} from "./schema";
import type {
  Aircraft,
  AeronaveImagen,
  AeronaveSeguro,
  AircraftOwner,
  Motor,
  Propeller,
} from "@/types/aircraft";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
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
