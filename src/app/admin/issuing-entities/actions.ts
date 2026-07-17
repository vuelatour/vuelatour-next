"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { IssuingEntityFormSchema } from "./schema";
import type { IssuingEntity } from "@/types/issuing-entities";

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

export async function createIssuingEntityAction(raw: unknown): Promise<ActionResult<IssuingEntity>> {
  const parsed = IssuingEntityFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<IssuingEntity>("/v1/issuing-entities", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/issuing-entities");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateIssuingEntityAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<IssuingEntity>> {
  const parsed = IssuingEntityFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<IssuingEntity>(`/v1/issuing-entities/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/issuing-entities");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteIssuingEntityAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/issuing-entities/${id}`, { method: "DELETE" });
    revalidatePath("/admin/issuing-entities");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Sube el CSD del SAT (.cer/.key en base64) de la emisora. */
export async function uploadCsdAction(
  id: string,
  payload: { cer_b64: string; key_b64: string },
): Promise<ActionResult<IssuingEntity>> {
  try {
    const updated = await apiServer<IssuingEntity>(`/v1/issuing-entities/${id}/csd`, {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/issuing-entities");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}
