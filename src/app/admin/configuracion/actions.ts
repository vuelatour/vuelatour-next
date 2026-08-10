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
  activa: boolean,
): Promise<ActionResult<ConfiguracionFlag>> {
  try {
    const data = await apiServer<ConfiguracionFlag>(`/v1/config/${clave}`, {
      method: "PATCH",
      body: { activa },
    });
    revalidatePath("/admin/configuracion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
