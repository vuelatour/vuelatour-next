"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  CancelarFacturaSchema,
  EmitirFacturaSchema,
  NotaCreditoSchema,
} from "./schema";
import type { Factura } from "@/types/invoices";

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
    if (v === "" || v === undefined || v === null) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

const PATH = "/admin/facturas";

/** Timbra el CFDI de un vuelo (con receptor alterno "SE FACTURÓ A" opcional). */
export async function emitirFacturaAction(raw: unknown): Promise<ActionResult<Factura>> {
  const parsed = EmitirFacturaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<Factura>("/v1/invoices/emitir", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath(PATH);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/** Cancela un CFDI timbrado ante el SAT. */
export async function cancelarFacturaAction(
  facturaId: string,
  raw: unknown,
): Promise<ActionResult<Factura>> {
  const parsed = CancelarFacturaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<Factura>(`/v1/invoices/${facturaId}/cancelar`, {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath(PATH);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Emite una nota de crédito (CFDI Egreso) relacionada a una factura. */
export async function emitirNotaCreditoAction(raw: unknown): Promise<ActionResult<Factura>> {
  const parsed = NotaCreditoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<Factura>("/v1/invoices/nota-credito", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath(PATH);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}
