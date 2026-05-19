"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { BankMovementFormSchema } from "./schema";
import type { BankMovement } from "@/types/treasury";

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

export async function createBankMovementAction(
  raw: unknown,
): Promise<ActionResult<BankMovement>> {
  const parsed = BankMovementFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<BankMovement>("/v1/bank-movements", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/treasury");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBankMovementAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<BankMovement>> {
  const parsed = BankMovementFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<BankMovement>(`/v1/bank-movements/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/treasury");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBankMovementAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/bank-movements/${id}`, { method: "DELETE" });
    revalidatePath("/admin/treasury");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function reconcileBankMovementAction(
  id: string,
  gastoId: string,
): Promise<ActionResult<BankMovement>> {
  try {
    const updated = await apiServer<BankMovement>(
      `/v1/bank-movements/${id}/reconcile`,
      { method: "PATCH", body: { gasto_id: gastoId } },
    );
    revalidatePath("/admin/treasury");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function unreconcileBankMovementAction(
  id: string,
): Promise<ActionResult<BankMovement>> {
  try {
    const updated = await apiServer<BankMovement>(
      `/v1/bank-movements/${id}/unreconcile`,
      { method: "PATCH" },
    );
    revalidatePath("/admin/treasury");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}
