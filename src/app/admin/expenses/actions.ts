"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { GastoVerifySchema } from "./schema";
import type { Gasto } from "@/types/expenses";

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

export async function verifyGastoAction(id: string, raw: unknown): Promise<ActionResult<Gasto>> {
  const parsed = GastoVerifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** Descarta la bandera de duplicado con un clic. */
export async function dismissDuplicadoAction(id: string): Promise<ActionResult<Gasto>> {
  try {
    const updated = await apiServer<Gasto>(`/v1/expenses/${id}`, {
      method: "PATCH",
      body: { duplicado_sospechado: false },
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export interface VueloSugerido {
  vuelo_id: string;
  folio: number | null;
  origen_iata: string | null;
  destino_iata: string | null;
  estado: string | null;
  fecha_vuelo: string | null;
  razon?: string | null;
}

export interface SugerirVueloResult {
  sugerido: VueloSugerido | null;
  candidatos: VueloSugerido[];
}

/** Sugiere el vuelo de una carga de combustible (aeronave + momento). */
export async function sugerirVueloAction(
  aeronaveId: string,
  fechaHora: string,
): Promise<ActionResult<SugerirVueloResult>> {
  try {
    const data = await apiServer<SugerirVueloResult>(
      `/v1/expenses/sugerir-vuelo?aeronave_id=${aeronaveId}&fecha_hora=${encodeURIComponent(fechaHora)}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface AsignacionCandidato {
  vuelo_id: string;
  folio: number | null;
  fecha_vuelo: string | null;
  aeronave_id: string | null;
  matricula: string | null;
  ruta: string | null;
}

export interface SugerenciaAsignacion {
  sugerido: AsignacionCandidato | null;
  confianza: number;
  razon: string;
  fuente: "regla" | "ia";
  candidatos: AsignacionCandidato[];
}

/** Sugiere a qué vuelo/avión pertenece un gasto de la bandeja (piloto+fecha; IA si es ambiguo). */
export async function sugerirAsignacionGastoAction(
  gastoId: string,
): Promise<ActionResult<SugerenciaAsignacion>> {
  try {
    const data = await apiServer<SugerenciaAsignacion>(
      `/v1/expenses/${gastoId}/sugerir-asignacion`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Liga (o desliga) una carga de combustible a un vuelo/cotización. */
export async function assignVueloGastoAction(
  gastoId: string,
  vueloId: string | null,
): Promise<ActionResult<Gasto>> {
  try {
    const data = await apiServer<Gasto>(`/v1/expenses/${gastoId}`, {
      method: "PATCH",
      body: { vuelo_id: vueloId },
    });
    revalidatePath("/admin/combustibles");
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGastoAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/${id}`, { method: "DELETE" });
    revalidatePath("/admin/expenses");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
