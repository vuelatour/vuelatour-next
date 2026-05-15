"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { RouteFormSchema, type RouteFormOutput } from "./schema";
import type { Route } from "@/types/routes";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

function buildPayload(parsed: RouteFormOutput) {
  if (parsed.tipo === "MULTIESCALA") {
    return {
      tipo: parsed.tipo,
      tramos: parsed.tramos,
      ...(parsed.fuente && { fuente: parsed.fuente }),
      ...(parsed.notas && { notas: parsed.notas }),
    };
  }
  return {
    tipo: parsed.tipo,
    origen_iata: parsed.origen_iata,
    destino_iata: parsed.destino_iata,
    millas_nauticas: parsed.millas_nauticas,
    es_redondo_auto: parsed.es_redondo_auto,
    num_aterrizajes: parsed.num_aterrizajes,
    ...(parsed.fuente && { fuente: parsed.fuente }),
    ...(parsed.notas && { notas: parsed.notas }),
  };
}

export async function createRouteAction(raw: unknown): Promise<ActionResult<Route>> {
  const parsed = RouteFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Route>("/v1/routes", {
      method: "POST",
      body: buildPayload(parsed.data),
    });
    revalidatePath("/admin/routes");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRouteAction(id: string, raw: unknown): Promise<ActionResult<Route>> {
  // Para edicion usamos el mismo schema completo: el form siempre envia un
  // estado coherente (tipo + los campos relevantes para ese tipo).
  const parsed = RouteFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Route>(`/v1/routes/${id}`, {
      method: "PATCH",
      body: buildPayload(parsed.data),
    });
    revalidatePath("/admin/routes");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRouteAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/routes/${id}`, { method: "DELETE" });
    revalidatePath("/admin/routes");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
