"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { ClientFormSchema } from "./schema";
import type { Client } from "@/types/clients";

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

export async function createClientAction(raw: unknown): Promise<ActionResult<Client>> {
  const parsed = ClientFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<Client>("/v1/clients", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/clients");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateClientAction(id: string, raw: unknown): Promise<ActionResult<Client>> {
  const parsed = ClientFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<Client>(`/v1/clients/${id}`, {
      method: "PATCH",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/clients");
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteClientAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/clients/${id}`, { method: "DELETE" });
    revalidatePath("/admin/clients");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Constancia de situación fiscal (lectura con IA) =====

/** Respuesta de /v1/vision/constancia-fiscal (pyservices vía API). */
export interface ConstanciaFiscalIA {
  disponible: boolean;
  legible: boolean;
  rfc: string | null;
  razon_social: string | null;
  /** Código SAT de 3 dígitos (601, 612, …). */
  regimen_fiscal: string | null;
  regimen_descripcion: string | null;
  cp: string | null;
  domicilio: string | null;
  confianza: number | null;
  motivo: string | null;
}

/**
 * Lee una constancia de situación fiscal (PDF o foto) con IA para autollenar
 * los datos fiscales del cliente. Best-effort: el operador siempre revisa.
 */
export async function leerConstanciaIAAction(input: {
  pdfBase64?: string;
  imageBase64?: string;
  mediaType?: string;
}): Promise<ActionResult<ConstanciaFiscalIA>> {
  try {
    // El módulo de visión del API usa camelCase (forbidNonWhitelisted rechaza
    // snake_case); pyservices recibe snake pero el API hace el mapeo.
    const data = await apiServer<ConstanciaFiscalIA>("/v1/vision/constancia-fiscal", {
      method: "POST",
      body: {
        pdfBase64: input.pdfBase64,
        imageBase64: input.imageBase64,
        mediaType: input.mediaType,
      },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Tarifas preferenciales por avión =====
// Tarifa por hora pactada con el cliente para una aeronave: al cotizar manda
// sobre la default (público/broker) y puede ser mayor o menor que esta.

export interface TarifaClienteAeronave {
  id: string;
  aeronave_id: string;
  tarifa_hora_usd: number;
  aeronave?: { matricula: string; modelo: string | null } | null;
}

/** Aeronaves activas con sus tarifas default, para el formulario del cliente. */
export interface AeronaveTarifaOption {
  id: string;
  matricula: string;
  modelo: string | null;
  tarifa_hora_pub_usd: number | null;
  tarifa_hora_broker_usd: number | null;
}

export async function listAircraftTarifaOptionsAction(): Promise<
  ActionResult<AeronaveTarifaOption[]>
> {
  try {
    const res = await apiServer<{
      data: Array<{
        id: string;
        matricula: string;
        modelo: string | null;
        tarifa_hora_pub_usd: number | string | null;
        tarifa_hora_broker_usd: number | string | null;
      }>;
    }>("/v1/aircraft", {
      searchParams: { activa: true, limit: 100 },
      cache: "no-store",
    });
    return {
      ok: true,
      data: res.data.map((a) => ({
        id: a.id,
        matricula: a.matricula,
        modelo: a.modelo,
        tarifa_hora_pub_usd:
          a.tarifa_hora_pub_usd != null ? Number(a.tarifa_hora_pub_usd) : null,
        tarifa_hora_broker_usd:
          a.tarifa_hora_broker_usd != null ? Number(a.tarifa_hora_broker_usd) : null,
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function getClientTarifasAction(
  clienteId: string,
): Promise<ActionResult<TarifaClienteAeronave[]>> {
  try {
    const data = await apiServer<TarifaClienteAeronave[]>(
      `/v1/clients/${clienteId}/tarifas`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Reemplaza el set completo de tarifas preferenciales del cliente. */
export async function setClientTarifasAction(
  clienteId: string,
  tarifas: Array<{ aeronave_id: string; tarifa_hora_usd: number }>,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/clients/${clienteId}/tarifas`, {
      method: "PUT",
      body: { tarifas },
    });
    revalidatePath("/admin/clients");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
