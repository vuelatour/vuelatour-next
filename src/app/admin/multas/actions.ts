"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { Multa } from "@/types/multas";

const PATH = "/admin/multas";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

export interface MultaInput {
  aeronave_id?: string;
  piloto_id?: string;
  fecha: string;
  monto?: number;
  moneda?: string;
  autoridad?: string;
  descripcion: string;
  estado?: "PENDIENTE" | "PAGADA" | "CANCELADA";
  referencia?: string;
  notas?: string;
}

export async function createMultaAction(body: MultaInput): Promise<ActionResult<Multa>> {
  try {
    const data = await apiServer<Multa>("/v1/multas", { method: "POST", body });
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateMultaAction(
  id: string,
  body: Partial<MultaInput>,
): Promise<ActionResult<Multa>> {
  try {
    const data = await apiServer<Multa>(`/v1/multas/${id}`, { method: "PATCH", body });
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMultaAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/multas/${id}`, { method: "DELETE" });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
