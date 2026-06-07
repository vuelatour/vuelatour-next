"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { AircraftFormSchema } from "./schema";
import type { Aircraft, AeronaveImagen } from "@/types/aircraft";

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
