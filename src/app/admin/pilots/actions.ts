"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { EstadoUsuario } from "@/types/me";
import type { User } from "@/types/users";
import { InvitePilotSchema } from "./schema";

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

/**
 * Crea un usuario con rol=PILOTO y estado=INVITADO. Cuando entre por primera
 * vez con Google se le enlazará el supabase_auth_id automáticamente y queda
 * como ACTIVO cuando un admin lo apruebe.
 */
export async function invitePilotAction(raw: unknown): Promise<ActionResult<User>> {
  const parsed = InvitePilotSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const body = stripEmpty({ ...parsed.data, rol: "PILOTO", estado: "INVITADO" });
    const created = await apiServer<User>("/v1/users", {
      method: "POST",
      body,
    });
    revalidatePath("/admin/pilots");
    revalidatePath("/admin/users");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Cambia el estado de acceso del piloto (ACTIVO / INVITADO / INACTIVO).
 * Esto controla si puede usar la app móvil.
 */
export async function setPilotAccessAction(
  id: string,
  estado: EstadoUsuario,
): Promise<ActionResult<User>> {
  try {
    const updated = await apiServer<User>(`/v1/users/${id}`, {
      method: "PATCH",
      body: { estado },
    });
    revalidatePath("/admin/pilots");
    revalidatePath(`/admin/pilots/${id}`);
    revalidatePath("/admin/users");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deactivatePilotAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/users/${id}`, { method: "DELETE" });
    revalidatePath("/admin/pilots");
    revalidatePath(`/admin/pilots/${id}`);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
