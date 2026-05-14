"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { BankAccountFormSchema } from "./schema";
import type { BankAccount } from "@/types/bank-accounts";

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

export async function createBankAccountAction(raw: unknown): Promise<ActionResult<BankAccount>> {
  const parsed = BankAccountFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<BankAccount>("/v1/bank-accounts", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/bank-accounts");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateBankAccountAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<BankAccount>> {
  const parsed = BankAccountFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<BankAccount>(`/v1/bank-accounts/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/bank-accounts");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBankAccountAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/bank-accounts/${id}`, { method: "DELETE" });
    revalidatePath("/admin/bank-accounts");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
