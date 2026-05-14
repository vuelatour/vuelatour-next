"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { AirportFormSchema } from "./schema";
import type { Airport } from "@/types/airports";

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

export async function createAirportAction(raw: unknown): Promise<ActionResult<Airport>> {
  const parsed = AirportFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Airport>("/v1/airports", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/airports");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateAirportAction(id: string, raw: unknown): Promise<ActionResult<Airport>> {
  const parsed = AirportFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Airport>(`/v1/airports/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/airports");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteAirportAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/airports/${id}`, { method: "DELETE" });
    revalidatePath("/admin/airports");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
