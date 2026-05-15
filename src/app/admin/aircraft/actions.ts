"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { AeronaveImagen } from "@/types/aircraft";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Error desconocido",
  };
}

function revalidateAircraft(id: string) {
  revalidatePath("/admin/aircraft");
  revalidatePath(`/admin/aircraft/${id}`);
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
