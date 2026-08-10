"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { ExpirationFormSchema } from "./schema";
import type { Expiration } from "@/types/expirations";

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

export async function createExpirationAction(
  raw: unknown,
): Promise<ActionResult<Expiration>> {
  const parsed = ExpirationFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Expiration>("/v1/expirations", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expirations");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateExpirationAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<Expiration>> {
  const parsed = ExpirationFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Expiration>(`/v1/expirations/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expirations");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface ExtraccionVencimiento {
  disponible: boolean;
  matricula?: string | null;
  tipo_documento?: string | null;
  fecha_vigencia?: string | null;
  fecha_vencimiento?: string | null;
  emisor?: string | null;
  confianza?: number;
}

/**
 * Lee por IA el documento adjuntado (PDF/imagen en base64) para pre-llenar el
 * alta del vencimiento. Best-effort: `disponible=false` si la IA no está
 * configurada — el formulario sigue en captura manual.
 */
export async function extraerVencimientoAction(input: {
  pdfBase64?: string;
  imageBase64?: string;
  mediaType?: string;
}): Promise<ActionResult<ExtraccionVencimiento>> {
  try {
    const data = await apiServer<ExtraccionVencimiento>(
      "/v1/expirations/extraer",
      { method: "POST", body: input },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** URL firmada (1 h) de la copia del documento adjunto (bucket privado). */
export async function getExpirationArchivoAction(
  id: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const data = await apiServer<{ url: string }>(
      `/v1/expirations/${id}/archivo`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExpirationAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expirations/${id}`, { method: "DELETE" });
    revalidatePath("/admin/expirations");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
