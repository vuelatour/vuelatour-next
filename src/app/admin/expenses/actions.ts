"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { GastoFormSchema } from "./schema";
import type { Expense } from "@/types/expenses";

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

export async function createExpenseAction(raw: unknown): Promise<ActionResult<Expense>> {
  const parsed = GastoFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Expense>("/v1/expenses", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateExpenseAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<Expense>> {
  const parsed = GastoFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Expense>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function setExpenseReconciledAction(
  id: string,
  conciliado: boolean,
): Promise<ActionResult<Expense>> {
  try {
    const updated = await apiServer<Expense>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: { conciliado },
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/${id}`, { method: "DELETE" });
    revalidatePath("/admin/expenses");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
