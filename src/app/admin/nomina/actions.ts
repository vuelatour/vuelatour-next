"use server";

import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { mensajeErrorAccionGasto } from "@/lib/admin/gasto-acciones";
import { MSG_SERVIDOR_NO_RESPONDIO, esTextoTecnico } from "@/lib/admin/errores-tecnicos";
import {
  CODIGO_RUTA_NO_DISPONIBLE,
  MSG_REPARTO_RUTA_NO_DISPONIBLE,
  RUTA_REPARTO_IGUALES,
  validarCuerpoRepartoIguales,
} from "@/lib/admin/nomina-reparto";
import type { RespuestaRepartoIguales } from "@/types/reparto-iguales";

/** Resultado de la action: nunca lanza; conserva code/status/details del API. */
export type ResultadoRepartoIgualesAction =
  | { ok: true; data: RespuestaRepartoIguales }
  | { ok: false; error: string; code?: string; status?: number; details?: unknown };

/**
 * Reparte (o QUITA, con `aeronave_ids: []`) los pagos de nómina en PARTES
 * IGUALES (`POST /v1/expenses/reparto-iguales`, API 0.0.90). Con
 * `simular: true` es la vista previa (no escribe).
 *
 * - Valida uuids y tamaños ANTES de la red: con datos inválidos no sale nada.
 * - El cuerpo viaja como OBJETO (`apiFetch` serializa; nunca JSON.stringify).
 * - NO revalida: la llama un diálogo que sigue montado y quien la llama hace
 *   `router.refresh()` al cerrar (convención «Red / API» de AGENTS.md).
 * - 404 «Cannot POST …» = API previo ⇒ `RUTA_NO_DISPONIBLE` («Falta
 *   actualizar el servidor»). Nunca lanza.
 */
export async function repartoIgualesAction(input: {
  gasto_ids: string[];
  aeronave_ids: string[];
  simular?: boolean;
}): Promise<ResultadoRepartoIgualesAction> {
  const v = validarCuerpoRepartoIguales(input);
  if (!v.ok) return { ok: false, error: v.error, code: "ENTRADA_INVALIDA", status: 400 };
  try {
    const data = await apiServer<RespuestaRepartoIguales>(RUTA_REPARTO_IGUALES, {
      method: "POST",
      body: v.cuerpo,
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    if (isApiError(err)) {
      const mensaje = String(err.message ?? "");
      if (err.status === 404 && /^Cannot (POST|GET)\b/.test(mensaje.trim())) {
        return { ok: false, error: MSG_REPARTO_RUTA_NO_DISPONIBLE, code: CODIGO_RUTA_NO_DISPONIBLE, status: 404 };
      }
      return {
        ok: false,
        error: esTextoTecnico(mensaje) ? MSG_SERVIDOR_NO_RESPONDIO : mensajeErrorAccionGasto(err.status, mensaje),
        code: err.code,
        status: err.status,
        details: err.details,
      };
    }
    return { ok: false, error: MSG_SERVIDOR_NO_RESPONDIO, code: "SIN_CONEXION" };
  }
}
