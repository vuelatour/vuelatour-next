"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { esUuid } from "@/lib/admin/url-params";
import {
  errorPideRefrescar,
  esMesValido,
  mensajeErrorPagoSocio,
  normalizarFila,
  normalizarPago,
  validarMotivoBaja,
} from "@/lib/admin/reparto-pagos";
import type {
  CrearPagoSocioPayload,
  PatchPagoSocioPayload,
  ResultadoBajaPagoSocio,
  ResultadoPagoSocio,
} from "@/types/reparto-pagos";

/**
 * PAGOS A SOCIOS (1-oct-2026, API 0.0.49): alta, edición y baja. La subida
 * del comprobante NO pasa por aquí: va del navegador directo al API
 * (`lib/api/reparto-pagos-browser.ts`, tope de 4.5 MB de Vercel).
 *
 * Reglas: nunca lanzan; validan ids antes de hablar con el API; el error
 * conserva `code`/`details` (el diálogo convierte el 409
 * PAGO_EXCEDE_UTILIDAD en «¿Registrar de todas formas?») y su texto sale de
 * `mensajeErrorPagoSocio` (fuente única); revalidan la página del reparto.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
  status?: number;
}

const RUTA_REPARTO = "/admin/profit-sharing";

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeErrorPagoSocio(err.code, err.message, err.status),
      code: err.code,
      details: err.details,
      status: err.status,
    };
  }
  return {
    ok: false,
    error: mensajeErrorPagoSocio("SIN_CONEXION", null),
    code: "SIN_CONEXION",
  };
}

/** Respuesta `{ pago, fila }` con tipos sanos; sin pago ⇒ no se celebra. */
function resultadoPago(raw: unknown): ResultadoPagoSocio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pago = normalizarPago(r.pago);
  if (!pago) return null;
  return {
    pago,
    fila: normalizarFila(r.fila),
    ...(r.idempotente === true ? { idempotente: true } : {}),
  };
}

/** Respuesta `{ deleted, fila }` de la baja con tipos sanos (fila puede ser null). */
function resultadoBaja(raw: unknown): ResultadoBajaPagoSocio {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { deleted: true, fila: normalizarFila(r.fila) };
}

const SIN_CONFIRMACION = "El servidor no confirmó el pago. Recarga la página para ver si quedó registrado.";

export async function crearPagoSocioAction(
  payload: CrearPagoSocioPayload,
): Promise<ActionResult<ResultadoPagoSocio>> {
  if (!esUuid(payload.aeronave_id) || !esUuid(payload.socio_id)) {
    return { ok: false, error: "No se reconoce el avión o el socio. Recarga la página." };
  }
  if (!esMesValido(payload.mes)) {
    return { ok: false, error: "El mes del pago no es válido. Elige un mes en el selector." };
  }
  if (payload.client_request_id && !esUuid(payload.client_request_id)) {
    return { ok: false, error: "No se pudo preparar el registro. Cierra y vuelve a abrir el diálogo." };
  }
  try {
    const raw = await apiServer<unknown>("/v1/profit-sharing/pagos", {
      method: "POST",
      body: payload,
    });
    const data = resultadoPago(raw);
    revalidatePath(RUTA_REPARTO);
    if (!data) return { ok: false, error: SIN_CONFIRMACION, code: "SIN_CONFIRMACION" };
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function editarPagoSocioAction(
  id: string,
  patch: PatchPagoSocioPayload,
): Promise<ActionResult<ResultadoPagoSocio>> {
  if (!esUuid(id)) return { ok: false, error: "No se reconoce el pago. Recarga la página." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "No hay cambios que guardar." };
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/pagos/${id}`, {
      method: "PATCH",
      body: patch,
    });
    const data = resultadoPago(raw);
    revalidatePath(RUTA_REPARTO);
    if (!data) return { ok: false, error: SIN_CONFIRMACION, code: "SIN_CONFIRMACION" };
    return { ok: true, data };
  } catch (err) {
    // Lo que hay en pantalla ya está viejo (otro lo borró o lo cambió).
    if (isApiError(err) && errorPideRefrescar(err.code)) revalidatePath(RUTA_REPARTO);
    return fail(err);
  }
}

export async function eliminarPagoSocioAction(
  id: string,
  motivo: string,
): Promise<ActionResult<ResultadoBajaPagoSocio>> {
  if (!esUuid(id)) return { ok: false, error: "No se reconoce el pago. Recarga la página." };
  const invalido = validarMotivoBaja(motivo);
  if (invalido) return { ok: false, error: invalido };
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/pagos/${id}`, {
      method: "DELETE",
      body: { motivo: motivo.trim() },
    });
    revalidatePath(RUTA_REPARTO);
    return { ok: true, data: resultadoBaja(raw) };
  } catch (err) {
    // Ya no existe o cambió (otra persona): la lista está vieja.
    if (isApiError(err) && errorPideRefrescar(err.code)) revalidatePath(RUTA_REPARTO);
    return fail(err);
  }
}
