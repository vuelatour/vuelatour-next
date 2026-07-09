"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { GastoCreateSchema, GastoVerifySchema } from "./schema";
import type { Gasto, PistaPendiente, TarifaAerodromo } from "@/types/expenses";

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

/** Alta manual de gasto desde el panel (la oficina captura gastos operativos). */
export async function createGastoAction(raw: unknown): Promise<ActionResult<Gasto>> {
  const parsed = GastoCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const created = await apiServer<Gasto>("/v1/expenses", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/expenses");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

// ===== Gastos de pista (cuotas de aeródromo VIP SAESA) =====

/** Aterrizajes del periodo sin gasto de pista, con tarifa sugerida. */
export async function pistasPendientesAction(
  desde: string,
  hasta: string,
): Promise<ActionResult<{ data: PistaPendiente[] }>> {
  try {
    const data = await apiServer<{ data: PistaPendiente[] }>(
      `/v1/expenses/pistas/pendientes?desde=${desde}&hasta=${hasta}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface GenerarPistaItem {
  escala_id: string;
  monto: number;
  moneda?: string;
  categoria?: string;
  notas?: string;
}

/** Crea los gastos de pista confirmados (origen SISTEMA, uno por aterrizaje). */
export async function generarPistasAction(
  items: GenerarPistaItem[],
): Promise<ActionResult<{ creados: number; resultados: Array<{ escala_id: string; ok: boolean; error?: string }> }>> {
  try {
    const data = await apiServer<{
      creados: number;
      resultados: Array<{ escala_id: string; ok: boolean; error?: string }>;
    }>("/v1/expenses/pistas/generar", { method: "POST", body: { items } });
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Tarifario de aeródromos =====

export async function listTarifasAction(): Promise<ActionResult<TarifaAerodromo[]>> {
  try {
    const data = await apiServer<TarifaAerodromo[]>("/v1/expenses/tarifas-aerodromo", {
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function saveTarifaAction(
  id: string | null,
  body: {
    codigo_iata?: string;
    modelo?: string;
    monto: number;
    moneda?: string;
    variable?: boolean;
    activo?: boolean;
  },
): Promise<ActionResult<TarifaAerodromo>> {
  try {
    const data = id
      ? await apiServer<TarifaAerodromo>(`/v1/expenses/tarifas-aerodromo/${id}`, {
          method: "PATCH",
          body,
        })
      : await apiServer<TarifaAerodromo>("/v1/expenses/tarifas-aerodromo", {
          method: "POST",
          body,
        });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTarifaAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/tarifas-aerodromo/${id}`, { method: "DELETE" });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
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
    revalidatePath("/admin/flights", "layout");
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

export interface SugerenciaBandeja {
  gasto: {
    id: string;
    fecha_gasto: string | null;
    monto: number | null;
    moneda: string | null;
    categoria: string | null;
    capturo_nombre: string | null;
  };
  sugerido: AsignacionCandidato | null;
  confianza: number;
  razon: string;
  fuente: "regla" | "ia";
  candidatos: AsignacionCandidato[];
}

export interface SugerenciasBandejaResult {
  total_pendientes: number;
  resultados: SugerenciaBandeja[];
}

/** Barrido de TODA la bandeja de pendientes: sugerencia por cada gasto sin avión. */
export async function sugerirAsignacionesBandejaAction(): Promise<
  ActionResult<SugerenciasBandejaResult>
> {
  try {
    const data = await apiServer<SugerenciasBandejaResult>(
      "/v1/expenses/sugerir-asignaciones",
      { method: "POST", body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Aplica en lote las sugerencias palomeadas: avión + vuelo por gasto. */
export async function aplicarAsignacionesAction(
  items: Array<{ gasto_id: string; aeronave_id: string | null; vuelo_id: string }>,
): Promise<ActionResult<{ aplicados: number; fallidos: number }>> {
  let aplicados = 0;
  let fallidos = 0;
  for (const it of items) {
    try {
      await apiServer(`/v1/expenses/${it.gasto_id}`, {
        method: "PATCH",
        body: {
          vuelo_id: it.vuelo_id,
          ...(it.aeronave_id ? { aeronave_id: it.aeronave_id } : {}),
        },
      });
      aplicados += 1;
    } catch {
      fallidos += 1;
    }
  }
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/combustibles");
  return { ok: true, data: { aplicados, fallidos } };
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
    revalidatePath("/admin/flights", "layout");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteGastoAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/expenses/${id}`, { method: "DELETE" });
    revalidatePath("/admin/expenses");
    revalidatePath("/admin/flights", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export interface VueloCercano {
  id: string;
  folio: number | null;
  matricula: string | null;
  aeronave_id: string | null;
  ruta: string | null;
  fecha: string | null;
  estado: string | null;
}

/**
 * Vuelos alrededor de la fecha del gasto (±15 días) para asignar A MANO
 * cuando la sugerencia automática no encuentra match.
 */
export async function buscarVuelosCercanosAction(
  fechaGasto: string | null,
): Promise<ActionResult<VueloCercano[]>> {
  try {
    const base = fechaGasto
      ? new Date(`${fechaGasto.slice(0, 10)}T12:00:00-05:00`)
      : new Date();
    const dia = (offset: number) =>
      new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const res = await apiServer<{
      data: Array<{
        id: string;
        folio: number | null;
        estado: string;
        aeronave_id: string | null;
        aeronave_matricula?: string | null;
        origen_iata: string;
        destino_iata: string;
        ruta_iatas?: string[];
        fecha_vuelo: string | null;
      }>;
    }>("/v1/flights", {
      searchParams: { desde: dia(-15), hasta: dia(15), limit: 100 },
      cache: "no-store",
    });
    const data = res.data
      .filter((v) => v.estado !== "CANCELADO")
      .map((v) => ({
        id: v.id,
        folio: v.folio,
        matricula: v.aeronave_matricula ?? null,
        aeronave_id: v.aeronave_id,
        ruta:
          v.ruta_iatas && v.ruta_iatas.length > 0
            ? v.ruta_iatas.join("→")
            : `${v.origen_iata}→${v.destino_iata}`,
        fecha: v.fecha_vuelo,
        estado: v.estado,
      }));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
