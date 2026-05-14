"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { ProviderFormSchema } from "./schema";
import type { Provider } from "@/types/providers";

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

export async function createProviderAction(raw: unknown): Promise<ActionResult<Provider>> {
  const parsed = ProviderFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Provider>("/v1/providers", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/providers");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateProviderAction(id: string, raw: unknown): Promise<ActionResult<Provider>> {
  const parsed = ProviderFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Provider>(`/v1/providers/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/providers");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteProviderAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/providers/${id}`, { method: "DELETE" });
    revalidatePath("/admin/providers");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
