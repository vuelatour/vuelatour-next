"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { esUuid } from "@/lib/admin/url-params";
import {
  RUTA_PAGOS_SOCIOS,
  errorPideRefrescar,
  esMesValido,
  mensajeErrorCuentaSocio,
  normalizarPago,
  normalizarResumen,
  validarMotivoBaja,
} from "@/lib/admin/reparto-pagos";
import type {
  ConfigurarCuentaPayload,
  CrearPagoSocioPayload,
  PatchPagoSocioPayload,
  ResultadoBajaPagoSocio,
  ResultadoPagoSocio,
  ResumenCuentaSocio,
} from "@/types/reparto-pagos";

/**
 * CUENTA CORRIENTE DE LOS SOCIOS (v2, 1-oct-2026, API 0.0.50): entregas
 * (alta, edición, baja) y «Configurar cuenta». La subida del comprobante NO
 * pasa por aquí: va del navegador directo al API
 * (`lib/api/reparto-pagos-browser.ts`, tope de 4.5 MB de Vercel).
 *
 * Reglas: nunca lanzan; validan ids antes de hablar con el API; el error
 * conserva `code`/`details` (el diálogo convierte el 409 PAGO_EXCEDE_SALDO
 * en la confirmación del ADELANTO) y su texto sale de
 * `mensajeErrorCuentaSocio` (fuente única); revalidan el reparto, la lista
 * de socios y el estado de cuenta.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
  status?: number;
}

/** Las tres pantallas que pintan la cuenta de un socio. */
function revalidarCuentas() {
  revalidatePath("/admin/profit-sharing");
  revalidatePath(RUTA_PAGOS_SOCIOS);
  revalidatePath(`${RUTA_PAGOS_SOCIOS}/[id]`, "page");
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeErrorCuentaSocio(err.code, err.message, err.status),
      code: err.code,
      details: err.details,
      status: err.status,
    };
  }
  return {
    ok: false,
    error: mensajeErrorCuentaSocio("SIN_CONEXION", null),
    code: "SIN_CONEXION",
  };
}

/** Respuesta `{ pago, cuenta }` con tipos sanos; sin pago ⇒ no se celebra. */
function resultadoPago(raw: unknown): ResultadoPagoSocio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pago = normalizarPago(r.pago);
  if (!pago) return null;
  return {
    pago,
    cuenta: normalizarResumen(r.cuenta),
    ...(r.idempotente === true ? { idempotente: true } : {}),
  };
}

const SIN_CONFIRMACION =
  "El servidor no confirmó la entrega. Recarga la página para ver si quedó registrada.";

export async function crearPagoSocioAction(
  payload: CrearPagoSocioPayload,
): Promise<ActionResult<ResultadoPagoSocio>> {
  if (!esUuid(payload.socio_id)) {
    return { ok: false, error: "No se reconoce al socio. Recarga la página." };
  }
  if (payload.aeronave_id !== undefined && !esUuid(payload.aeronave_id)) {
    return { ok: false, error: "No se reconoce el avión de «Corresponde a». Elige otro o «Sin avión»." };
  }
  if (payload.mes !== undefined && !esMesValido(payload.mes)) {
    return { ok: false, error: "El mes de «Corresponde a» no es válido. Elige otro o «Sin mes»." };
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
    revalidarCuentas();
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
  if (!esUuid(id)) return { ok: false, error: "No se reconoce la entrega. Recarga la página." };
  if (Object.keys(patch).length === 0) return { ok: false, error: "No hay cambios que guardar." };
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/pagos/${id}`, {
      method: "PATCH",
      body: patch,
    });
    const data = resultadoPago(raw);
    revalidarCuentas();
    if (!data) return { ok: false, error: SIN_CONFIRMACION, code: "SIN_CONFIRMACION" };
    return { ok: true, data };
  } catch (err) {
    // Lo que hay en pantalla ya está viejo (otro lo borró o lo cambió).
    if (isApiError(err) && errorPideRefrescar(err.code)) revalidarCuentas();
    return fail(err);
  }
}

export async function eliminarPagoSocioAction(
  id: string,
  motivo: string,
): Promise<ActionResult<ResultadoBajaPagoSocio>> {
  if (!esUuid(id)) return { ok: false, error: "No se reconoce la entrega. Recarga la página." };
  const invalido = validarMotivoBaja(motivo);
  if (invalido) return { ok: false, error: invalido };
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/pagos/${id}`, {
      method: "DELETE",
      body: { motivo: motivo.trim() },
    });
    revalidarCuentas();
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return { ok: true, data: { deleted: true, cuenta: normalizarResumen(r.cuenta) } };
  } catch (err) {
    // Ya no existe o cambió (otra persona): la lista está vieja.
    if (isApiError(err) && errorPideRefrescar(err.code)) revalidarCuentas();
    return fail(err);
  }
}

/**
 * «Configurar cuenta» (`PUT /v1/profit-sharing/socios/:socioId/cuenta`):
 * mes de arranque + saldo inicial + notas. Responde el renglón del socio
 * ya recalculado (null si no llegó: la página se refresca igual).
 */
export async function configurarCuentaSocioAction(
  socioId: string,
  payload: ConfigurarCuentaPayload,
): Promise<ActionResult<ResumenCuentaSocio | null>> {
  if (!esUuid(socioId)) return { ok: false, error: "No se reconoce al socio. Recarga la página." };
  if (!esMesValido(payload.cuenta_desde)) {
    return { ok: false, error: "Elige el mes en que arranca la cuenta." };
  }
  if (!Number.isFinite(payload.saldo_inicial_usd)) {
    return { ok: false, error: "Captura el saldo inicial (0 si no había nada pendiente)." };
  }
  try {
    const raw = await apiServer<unknown>(`/v1/profit-sharing/socios/${socioId}/cuenta`, {
      method: "PUT",
      body: payload,
    });
    revalidarCuentas();
    return { ok: true, data: normalizarResumen(raw) };
  } catch (err) {
    return fail(err);
  }
}
