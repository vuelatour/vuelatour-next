"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { RouteFormSchema } from "./schema";
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

export async function createRouteAction(raw: unknown): Promise<ActionResult<Route>> {
  const parsed = RouteFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { fuente, notas, ...rest } = parsed.data;
  const payload = {
    ...rest,
    ...(fuente && { fuente }),
    ...(notas && { notas }),
  };

  try {
    const created = await apiServer<Route>("/v1/routes", {
      method: "POST",
      body: payload,
    });
    revalidatePath("/admin/routes");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRouteAction(id: string, raw: unknown): Promise<ActionResult<Route>> {
  const parsed = RouteFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { fuente, notas, ...rest } = parsed.data;
  const payload = {
    ...rest,
    ...(fuente !== undefined && { fuente: fuente || undefined }),
    ...(notas !== undefined && { notas: notas || undefined }),
  };

  try {
    const updated = await apiServer<Route>(`/v1/routes/${id}`, {
      method: "PATCH",
      body: payload,
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
