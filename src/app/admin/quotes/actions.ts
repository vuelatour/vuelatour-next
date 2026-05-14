"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { PersistedQuote } from "@/types/quotes-persisted";
import type { CalculateQuoteRequest } from "@/types/quote";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

export interface CreateQuotePayload extends CalculateQuoteRequest {
  cliente_id: string;
  tipo?: "SENCILLO" | "REDONDO" | "MULTIESCALA";
  fecha_vuelo?: string;
  notas?: string;
  notas_internas?: string;
}

export async function createQuoteAction(payload: CreateQuotePayload): Promise<ActionResult<PersistedQuote>> {
  if (!payload.cliente_id) return { ok: false, error: "cliente_id es requerido" };
  try {
    const created = await apiServer<PersistedQuote>("/v1/quotes", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/quotes");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export interface ReviseQuotePayload extends CalculateQuoteRequest {
  motivo: string;
  notas?: string;
}

export async function reviseQuoteAction(
  id: string,
  payload: ReviseQuotePayload,
): Promise<ActionResult<PersistedQuote>> {
  if (!payload.motivo) return { ok: false, error: "motivo es requerido" };
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/revise`, {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmQuoteAction(id: string): Promise<ActionResult<PersistedQuote>> {
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/confirm`, {
      method: "POST",
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelQuoteAction(
  id: string,
  motivo?: string,
): Promise<ActionResult<PersistedQuote>> {
  try {
    const updated = await apiServer<PersistedQuote>(`/v1/quotes/${id}/cancel`, {
      method: "POST",
      body: { motivo },
    });
    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}
