"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { ConfiguracionFlag } from "@/lib/api/configuracion-server";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Error desconocido",
  };
}

export async function updateConfiguracionAction(
  clave: string,
  // Banderas booleanas mandan { activa }; las numéricas { valor_numerico }.
  // apiServer ya serializa el body: objeto tal cual, sin JSON.stringify.
  cambio: { activa?: boolean; valor_numerico?: number },
): Promise<ActionResult<ConfiguracionFlag>> {
  try {
    const data = await apiServer<ConfiguracionFlag>(`/v1/config/${clave}`, {
      method: "PATCH",
      body: cambio,
    });
    revalidatePath("/admin/configuracion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
