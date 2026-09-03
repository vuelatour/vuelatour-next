"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type {
  EventoFlotaInput,
  EventoFlotaPatch,
  EventoFlotaResponse,
} from "@/types/calendar";

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

/**
 * Agenda un evento NO-vuelo (lavado, trámite, cita) desde el panel. El API
 * avisa por push al responsable y devuelve `aviso` con el resultado de la
 * entrega (3-sep-2026): la UI lo usa para decirle a oficina si el aviso
 * realmente puede llegar o hay que hablarle por otro medio.
 */
export async function createEventoFlotaAction(
  payload: EventoFlotaInput,
): Promise<ActionResult<EventoFlotaResponse>> {
  try {
    const data = await apiServer<EventoFlotaResponse>("/v1/calendar/eventos", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/pilots");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Edita un evento NO-vuelo. Solo viajan los campos que cambiaron (PATCH
 * parcial): lo que no se manda se conserva en el API. `null` limpia fin,
 * avión, responsable o notas.
 */
export async function updateEventoFlotaAction(
  eventoId: string,
  payload: EventoFlotaPatch,
): Promise<ActionResult<EventoFlotaResponse>> {
  try {
    const data = await apiServer<EventoFlotaResponse>(
      `/v1/calendar/eventos/${eventoId}`,
      { method: "PATCH", body: payload },
    );
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/pilots");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Elimina un evento NO-vuelo (lavado, trámite) del calendario. */
export async function deleteEventoFlotaAction(eventoId: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/calendar/eventos/${eventoId}`, { method: "DELETE" });
    revalidatePath("/admin/calendar");
    revalidatePath("/admin/pilots");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
