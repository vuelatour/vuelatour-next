"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";

export interface DistanciaTramo {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: string | number;
  fuente: string;
  notas: string | null;
  updated_at?: string;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/** Catálogo completo (lo usa también el autollenado del cotizador). */
export async function getDistanciasAction(): Promise<ActionResult<DistanciaTramo[]>> {
  try {
    const data = await apiServer<DistanciaTramo[]>("/v1/airports/distancias", {
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertDistanciaAction(payload: {
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
  fuente?: string;
  notas?: string;
}): Promise<ActionResult<DistanciaTramo>> {
  try {
    const data = await apiServer<DistanciaTramo>("/v1/airports/distancias", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/distancias");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function importDistanciasAction(
  tramos: { origen_iata: string; destino_iata: string; millas_nauticas: number }[],
): Promise<ActionResult<{ imported: number }>> {
  try {
    const data = await apiServer<{ imported: number }>(
      "/v1/airports/distancias/import",
      { method: "POST", body: { tramos } },
    );
    revalidatePath("/admin/distancias");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDistanciaAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/airports/distancias/${id}`, { method: "DELETE" });
    revalidatePath("/admin/distancias");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
