"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { esUuid } from "@/lib/admin/url-params";
import { mensajeErrorFactura, motivoValido } from "@/lib/admin/facturas-emitidas";
import type {
  AvisoFactura,
  FacturaEmitida,
  ResultadoGuardarFactura,
} from "@/types/facturas-emitidas";

/**
 * FACTURAS EMITIDAS (registro manual, 24-sep-2026) — server actions SIN
 * archivo. Registrar, editar y reemplazar el PDF/XML NO pasan por aquí: van
 * del navegador directo al API (`lib/api/facturas-emitidas-browser.ts`, tope
 * de 4.5 MB de Vercel). Todas devuelven `ActionResult` y nunca lanzan.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeErrorFactura(err.code, err.message, err.status),
      code: err.code,
      details: err.details,
    };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

function revalidar(vueloIds: string[] = []) {
  revalidatePath("/admin/facturas-emitidas");
  for (const id of vueloIds) {
    revalidatePath(`/admin/flights/${id}`);
    revalidatePath(`/admin/quotes/${id}`);
  }
}

const ID_INVALIDO: ActionResult<never> = { ok: false, error: "Factura inválida." };
const MOTIVO_CORTO: ActionResult<never> = {
  ok: false,
  error: "Escribe el motivo (mínimo 3 letras).",
  code: "MOTIVO_REQUERIDO",
};

/** Cancelar (queda en el registro con su número; se cancela también ante el SAT). */
export async function cancelarFacturaAction(
  id: string,
  motivo: string,
): Promise<ActionResult<ResultadoGuardarFactura>> {
  if (!esUuid(id)) return ID_INVALIDO;
  if (!motivoValido(motivo)) return MOTIVO_CORTO;
  try {
    const data = await apiServer<ResultadoGuardarFactura>(
      `/v1/facturas-emitidas/${id}/cancelar`,
      { method: "POST", body: { motivo: motivo.trim() } },
    );
    revalidar(data?.factura?.vuelos?.map((v) => v.id));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Reactivar una factura cancelada por error. */
export async function reactivarFacturaAction(
  id: string,
): Promise<ActionResult<ResultadoGuardarFactura>> {
  if (!esUuid(id)) return ID_INVALIDO;
  try {
    const data = await apiServer<ResultadoGuardarFactura>(
      `/v1/facturas-emitidas/${id}/reactivar`,
      { method: "POST" },
    );
    revalidar(data?.factura?.vuelos?.map((v) => v.id));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Eliminar el REGISTRO (soft delete: libera el número; los archivos se conservan). */
export async function eliminarFacturaAction(
  id: string,
  motivo: string,
  vueloIds: string[] = [],
): Promise<ActionResult<{ ok: true; id: string; avisos: AvisoFactura[] }>> {
  if (!esUuid(id)) return ID_INVALIDO;
  if (!motivoValido(motivo)) return MOTIVO_CORTO;
  try {
    const data = await apiServer<{ ok: true; id: string; avisos: AvisoFactura[] }>(
      `/v1/facturas-emitidas/${id}`,
      { method: "DELETE", body: { motivo: motivo.trim() } },
    );
    revalidar(vueloIds.filter(esUuid));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Quitar el PDF/XML del registro (el objeto se conserva en el bucket). */
export async function quitarArchivoFacturaAction(
  id: string,
  tipo: "pdf" | "xml",
): Promise<ActionResult<FacturaEmitida>> {
  if (!esUuid(id)) return ID_INVALIDO;
  try {
    const data = await apiServer<FacturaEmitida>(`/v1/facturas-emitidas/${id}/archivo`, {
      method: "DELETE",
      searchParams: { tipo },
    });
    revalidar(data?.vuelos?.map((v) => v.id));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** URL FIRMADA (10 min) del PDF o XML. La ventana la abre el panel en el clic. */
export async function urlArchivoFacturaAction(
  id: string,
  tipo: "pdf" | "xml" = "pdf",
): Promise<ActionResult<string>> {
  if (!esUuid(id)) return ID_INVALIDO;
  try {
    const { url } = await apiServer<{ url: string; nombre: string | null }>(
      `/v1/facturas-emitidas/${id}/archivo-url`,
      { searchParams: { tipo }, cache: "no-store" },
    );
    if (!url) {
      return {
        ok: false,
        error: tipo === "pdf" ? "Esta factura no tiene PDF adjunto." : "Esta factura no tiene XML adjunto.",
      };
    }
    return { ok: true, data: url };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Revalida tras una escritura que hizo el NAVEGADOR directo al API (alta,
 * edición, reemplazo de archivo): cuerpo diminuto, sin archivo.
 */
export async function refrescarFacturasEmitidasAction(
  vueloIds: string[] = [],
): Promise<ActionResult> {
  revalidar(vueloIds.filter(esUuid));
  return { ok: true };
}
