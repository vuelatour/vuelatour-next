"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { UserFormSchema, UserInviteSchema } from "./schema";
import type { User } from "@/types/users";

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

export async function createUserAction(raw: unknown): Promise<ActionResult<User>> {
  const parsed = UserInviteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<User>("/v1/users", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/users");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateUserAction(id: string, raw: unknown): Promise<ActionResult<User>> {
  const parsed = UserFormSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<User>(`/v1/users/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/users");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deactivateUserAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/users/${id}`, { method: "DELETE" });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export interface ResendInvitationResult {
  sent: boolean;
  email: string;
}

export async function resendInvitationAction(
  id: string,
): Promise<ActionResult<ResendInvitationResult>> {
  try {
    const data = await apiServer<ResendInvitationResult>(
      `/v1/users/${id}/resend-invitation`,
      { method: "POST" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface ResetPasswordResult {
  created_auth_user: boolean;
  supabase_auth_id: string;
}

export async function resetUserPasswordAction(
  id: string,
  password: string,
): Promise<ActionResult<ResetPasswordResult>> {
  if (!password || password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };
  }
  try {
    const data = await apiServer<{ ok: true } & ResetPasswordResult>(
      `/v1/users/${id}/reset-password`,
      {
        method: "POST",
        body: { password },
      },
    );
    revalidatePath("/admin/users");
    revalidatePath("/admin/pilots");
    return {
      ok: true,
      data: {
        created_auth_user: data.created_auth_user,
        supabase_auth_id: data.supabase_auth_id,
      },
    };
  } catch (err) {
    return fail(err);
  }
}

// ===== Caja chica vinculada (20-ago-2026): configurar desde Usuarios =====

export interface CajaVinculoInfo {
  fondo: {
    id: string;
    moneda: string;
    fondo_origen_id: string | null;
  } | null;
  /** Cajas activas que pueden ser madre (con su dueño y moneda). */
  opciones: { fondoId: string; nombre: string; moneda: string }[];
}

/** Fondo del usuario + cajas candidatas a madre, para el diálogo de vínculo. */
export async function getCajaVinculoAction(
  usuarioId: string,
): Promise<ActionResult<CajaVinculoInfo>> {
  try {
    const res = await apiServer<{
      data: Array<{
        id: string;
        usuario_id: string;
        moneda: string;
        fondo_origen_id?: string | null;
        usuario?: { nombre?: string } | null;
      }>;
    }>("/v1/caja-chica/fondos?activo=true&limit=200");
    const fondos = res.data ?? [];
    const propio = fondos.find((f) => f.usuario_id === usuarioId) ?? null;
    return {
      ok: true,
      data: {
        fondo: propio
          ? {
              id: propio.id,
              moneda: propio.moneda,
              fondo_origen_id: propio.fondo_origen_id ?? null,
            }
          : null,
        opciones: fondos
          .filter((f) => f.usuario_id !== usuarioId)
          .map((f) => ({
            fondoId: f.id,
            nombre: f.usuario?.nombre ?? "—",
            moneda: f.moneda,
          })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Vincula (o desvincula) la caja del usuario con su caja madre. Con
 * `retroactivo`, las reposiciones YA registradas también generan su espejo
 * (descuenta el fondeo histórico de la madre).
 */
export async function setCajaOrigenAction(
  fondoId: string,
  origenFondoId: string | null,
  retroactivo: boolean,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/caja-chica/fondos/${fondoId}`, {
      method: "PATCH",
      body: {
        fondo_origen_id: origenFondoId,
        ...(origenFondoId && retroactivo ? { retroactivo: true } : {}),
      },
    });
    revalidatePath("/admin/caja-chica");
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
