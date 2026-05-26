"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { ItemFormSchema, MovimientoFormSchema } from "./schema";
import type { InventarioItem, InventarioMovimiento } from "@/types/inventory";

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

export async function createItemAction(raw: unknown): Promise<ActionResult<InventarioItem>> {
  const parsed = ItemFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<InventarioItem>("/v1/inventory/items", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/inventory");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateItemAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<InventarioItem>> {
  const parsed = ItemFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<InventarioItem>(`/v1/inventory/items/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/inventory/items/${id}`, { method: "DELETE" });
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createMovimientoAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult<InventarioMovimiento>> {
  const parsed = MovimientoFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<InventarioMovimiento>(
      `/v1/inventory/items/${itemId}/movimientos`,
      { method: "POST", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}
