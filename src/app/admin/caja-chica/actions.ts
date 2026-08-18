"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { FondoFormSchema, FondoUpdateSchema, MovimientoFormSchema } from "./schema";
import type { CajaFondo, CajaMovimiento } from "@/types/caja-chica";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

export async function createFondoAction(raw: unknown): Promise<ActionResult<CajaFondo>> {
  const parsed = FondoFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<CajaFondo>("/v1/caja-chica/fondos", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/caja-chica");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateFondoAction(id: string, raw: unknown): Promise<ActionResult<CajaFondo>> {
  const parsed = FondoUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<CajaFondo>(`/v1/caja-chica/fondos/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/caja-chica");
    revalidatePath(`/admin/caja-chica/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function createCajaMovimientoAction(
  fondoId: string,
  raw: unknown,
): Promise<ActionResult<CajaMovimiento>> {
  const parsed = MovimientoFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<CajaMovimiento>(
      `/v1/caja-chica/fondos/${fondoId}/movimientos`,
      { method: "POST", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/caja-chica");
    revalidatePath(`/admin/caja-chica/${fondoId}`);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Corrige un movimiento ya registrado (caso Mari, 18-ago: el ingreso quedó
 * sin la fecha real y no había forma de arreglarlo). El saldo es derivado:
 * recalcula solo.
 */
export async function updateCajaMovimientoAction(
  id: string,
  fondoId: string,
  raw: unknown,
): Promise<ActionResult<CajaMovimiento>> {
  const parsed = MovimientoFormSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<CajaMovimiento>(
      `/v1/caja-chica/movimientos/${id}`,
      { method: "PATCH", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/caja-chica");
    revalidatePath(`/admin/caja-chica/${fondoId}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Elimina un movimiento de caja (la UI confirma antes — regla permanente). */
export async function deleteCajaMovimientoAction(
  id: string,
  fondoId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/caja-chica/movimientos/${id}`, { method: "DELETE" });
    revalidatePath("/admin/caja-chica");
    revalidatePath(`/admin/caja-chica/${fondoId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
