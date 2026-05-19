"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { CashFundFormSchema, FundMovementFormSchema } from "./schema";
import type { CashFund, FundMovement } from "@/types/cash-funds";

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

export async function createFundAction(raw: unknown): Promise<ActionResult<CashFund>> {
  const parsed = CashFundFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<CashFund>("/v1/cash-funds", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/cash-funds");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateFundAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<CashFund>> {
  const parsed = CashFundFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<CashFund>(`/v1/cash-funds/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/cash-funds");
    revalidatePath(`/admin/cash-funds/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFundAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/cash-funds/${id}`, { method: "DELETE" });
    revalidatePath("/admin/cash-funds");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createMovementAction(
  raw: unknown,
): Promise<ActionResult<FundMovement>> {
  const parsed = FundMovementFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<FundMovement>("/v1/fund-movements", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/cash-funds");
    revalidatePath(`/admin/cash-funds/${parsed.data.fondo_id}`);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveMovementAction(
  id: string,
  fondoId: string,
  estado: "AUTORIZADO" | "RECHAZADO",
): Promise<ActionResult<FundMovement>> {
  try {
    const updated = await apiServer<FundMovement>(
      `/v1/fund-movements/${id}/resolve`,
      { method: "PATCH", body: { estado } },
    );
    revalidatePath("/admin/cash-funds");
    revalidatePath(`/admin/cash-funds/${fondoId}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}
