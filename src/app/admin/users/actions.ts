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
