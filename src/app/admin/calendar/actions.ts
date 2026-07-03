"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/** Marca un rango de descanso para un piloto (se pinta en el calendario). */
export async function createDescansoAction(payload: {
  piloto_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo?: string;
}): Promise<ActionResult> {
  try {
    const data = await apiServer(`/v1/pilots/${payload.piloto_id}/descansos`, {
      method: "POST",
      body: {
        fecha_inicio: payload.fecha_inicio,
        fecha_fin: payload.fecha_fin,
        motivo: payload.motivo,
      },
    });
    revalidatePath("/admin/calendar");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Quita un descanso marcado. */
export async function deleteDescansoAction(descansoId: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/pilots/descansos/${descansoId}`, { method: "DELETE" });
    revalidatePath("/admin/calendar");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
