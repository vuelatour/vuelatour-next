"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { FacturaRecibida } from "@/types/invoices";

const PATH = "/admin/facturas-recibidas";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

export async function createRecibidaAction(xmlB64: string): Promise<ActionResult<FacturaRecibida>> {
  try {
    const data = await apiServer<FacturaRecibida>("/v1/invoices/recibidas", {
      method: "POST",
      body: { xml_b64: xmlB64 },
    });
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface UpdateRecibidaInput {
  gasto_id?: string;
  aeronave_id?: string;
  categoria_sugerida?: string;
  estado?: "SIN_CLASIFICAR" | "CLASIFICADA" | "DESCARTADA";
  notas?: string;
}

export async function updateRecibidaAction(
  id: string,
  body: UpdateRecibidaInput,
): Promise<ActionResult<FacturaRecibida>> {
  try {
    const data = await apiServer<FacturaRecibida>(`/v1/invoices/recibidas/${id}`, {
      method: "PATCH",
      body,
    });
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRecibidaAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/invoices/recibidas/${id}`, { method: "DELETE" });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function signRecibidaAction(path: string): Promise<ActionResult<string>> {
  try {
    const map = await apiServer<Record<string, string>>("/v1/invoices/recibidas/file-urls", {
      method: "POST",
      body: { paths: [path] },
    });
    const url = map[path];
    if (!url) return { ok: false, error: "No se pudo firmar el XML" };
    return { ok: true, data: url };
  } catch (err) {
    return fail(err);
  }
}
