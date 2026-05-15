"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { MeResponse } from "@/types/me";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface UpdateAccountPayload {
  nombre?: string;
  telefono?: string;
}

export async function updateAccountAction(
  payload: UpdateAccountPayload,
): Promise<ActionResult<MeResponse>> {
  try {
    const updated = await apiServer<MeResponse>("/v1/me", {
      method: "PATCH",
      body: payload,
    });
    revalidatePath("/admin/account");
    revalidatePath("/admin", "layout");
    return { ok: true, data: updated };
  } catch (err) {
    if (isApiError(err)) return { ok: false, error: err.message };
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
