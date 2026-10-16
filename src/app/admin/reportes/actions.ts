"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { getPreviaCierre, type CargaCierres } from "@/lib/api/cierres-server";
import { esMesValido } from "@/lib/admin/reparto-pagos";
import { textoCargaCierres, validarMotivoReabrir } from "@/lib/admin/cierre-mes";
import type { PreviaCierre, ResultadoCerrarMes, ResultadoReabrirMes } from "@/types/cierres";

/**
 * CIERRE DE MES (16-oct-2026, API 0.0.88): `cerrarMesAction` y
 * `reabrirMesAction`. Reglas: nunca lanzan; validan el periodo antes de
 * hablar con el API; el error conserva `code`/`details` (el diálogo repinta
 * la previa nueva ante `PREVIA_CAMBIO` y muestra el `message` del API tal
 * cual en los demás 409). Solo el ÉXITO revalida Reportes, el balance en
 * pantalla y el reparto (todos cambian de eje con un cierre); el diálogo
 * cierra y hace `router.refresh()`.
 *
 * `previaCierreAction` lee la previa al ABRIR el diálogo (es la lectura
 * pesada: dos repartos + el pre-cierre), no en cada render de la página.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
  status?: number;
}

const SIN_CONEXION = "No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.";
const PERIODO_INVALIDO = "No se reconoce el mes. Recarga la página.";

function revalidarCierre() {
  revalidatePath("/admin/reportes");
  revalidatePath("/admin/reportes/balance");
  revalidatePath("/admin/profit-sharing");
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return { ok: false, error: err.message, code: err.code, details: err.details, status: err.status };
  }
  return { ok: false, error: SIN_CONEXION, code: "SIN_CONEXION" };
}

/** La previa (`GET /v1/cierres/:periodo/previa`) para el diálogo «Cerrar <mes>». */
export async function previaCierreAction(periodo: string): Promise<ActionResult<PreviaCierre>> {
  if (!esMesValido(periodo)) return { ok: false, error: PERIODO_INVALIDO };
  const carga: CargaCierres<PreviaCierre> = await getPreviaCierre(periodo);
  if (carga.estado === "ok") return { ok: true, data: carga.datos };
  if (carga.estado === "sin-permiso") {
    return { ok: false, error: "Tu usuario no puede revisar el cierre del mes.", code: "SIN_PERMISO", status: 403 };
  }
  return { ok: false, error: textoCargaCierres(carga.estado) ?? SIN_CONEXION, code: carga.estado.toUpperCase() };
}

/** `POST /v1/cierres/:periodo` con los ids que el diálogo mostró (`vuelos_esperados`). */
export async function cerrarMesAction(
  periodo: string,
  vuelosEsperados: string[],
): Promise<ActionResult<ResultadoCerrarMes>> {
  if (!esMesValido(periodo)) return { ok: false, error: PERIODO_INVALIDO };
  try {
    const data = await apiServer<ResultadoCerrarMes>(`/v1/cierres/${periodo}`, {
      method: "POST",
      body: { confirmar: true, vuelos_esperados: vuelosEsperados },
    });
    revalidarCierre();
    return { ok: true, data };
  } catch (err) {
    // Sin revalidar: el diálogo sigue montado (con `PREVIA_CAMBIO` repinta la
    // previa nueva) y hace `router.refresh()` al cerrarse (regla de Next 16
    // de este panel, AGENTS.md «Red / API»).
    return fail(err);
  }
}

/** `POST /v1/cierres/:periodo/reabrir` (solo ADMIN; el API es el candado). */
export async function reabrirMesAction(periodo: string, motivo: string): Promise<ActionResult<ResultadoReabrirMes>> {
  if (!esMesValido(periodo)) return { ok: false, error: PERIODO_INVALIDO };
  const invalido = validarMotivoReabrir(motivo);
  if (invalido) return { ok: false, error: invalido };
  try {
    const data = await apiServer<ResultadoReabrirMes>(`/v1/cierres/${periodo}/reabrir`, {
      method: "POST",
      body: { confirmar: true, motivo: motivo.trim() },
    });
    revalidarCierre();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
