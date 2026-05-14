"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { CardFormSchema } from "./schema";
import type { Card } from "@/types/cards";

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

export async function createCardAction(raw: unknown): Promise<ActionResult<Card>> {
  const parsed = CardFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Card>("/v1/cards", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/cards");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCardAction(id: string, raw: unknown): Promise<ActionResult<Card>> {
  const parsed = CardFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Card>(`/v1/cards/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/cards");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function linkCardUserAction(id: string, usuarioId: string | null): Promise<ActionResult<Card>> {
  try {
    const updated = await apiServer<Card>(`/v1/cards/${id}/link-user`, {
      method: "PATCH",
      body: { usuario_id: usuarioId },
    });
    revalidatePath("/admin/cards");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCardAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/cards/${id}`, { method: "DELETE" });
    revalidatePath("/admin/cards");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
