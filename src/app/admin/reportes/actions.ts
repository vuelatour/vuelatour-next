"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { getPreviaCierre, type CargaCierres } from "@/lib/api/cierres-server";
import { esMesValido } from "@/lib/admin/reparto-pagos";
import { textoCargaCierres, validarMotivoReabrir } from "@/lib/admin/cierre-mes";
import { errorMontoParaApi } from "@/lib/admin/libro-afac";
import { esUuid } from "@/lib/admin/url-params";
import type { RespuestaAfacReal } from "@/types/afac";
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

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Solo UUIDs (lo demás se descarta: jamás un 400 por basura en la URL). */
function idsLimpios(ids: string[] | undefined): string[] {
  return (ids ?? []).filter((id) => typeof id === "string" && RE_UUID.test(id));
}

/**
 * La previa (`GET /v1/cierres/:periodo/previa`) para el diálogo «Cerrar <mes>».
 * `incluir` (21-oct-2026): los vuelos que la oficina marcó para quedarse en
 * el mes; la previa vuelve recalculada con ellos adentro.
 */
export async function previaCierreAction(periodo: string, incluir?: string[]): Promise<ActionResult<PreviaCierre>> {
  if (!esMesValido(periodo)) return { ok: false, error: PERIODO_INVALIDO };
  const carga: CargaCierres<PreviaCierre> = await getPreviaCierre(periodo, idsLimpios(incluir));
  if (carga.estado === "ok") return { ok: true, data: carga.datos };
  if (carga.estado === "sin-permiso") {
    return { ok: false, error: "Tu usuario no puede revisar el cierre del mes.", code: "SIN_PERMISO", status: 403 };
  }
  return { ok: false, error: textoCargaCierres(carga.estado) ?? SIN_CONEXION, code: carga.estado.toUpperCase() };
}

/**
 * `POST /v1/cierres/:periodo` con los ids que el diálogo mostró
 * (`vuelos_esperados` = los que pasan + los que se quedan) y, desde el
 * 21-oct-2026, `incluir_vuelos`: los cobrados después del corte que la
 * oficina deja en el mes (solo viaja si hay alguno).
 */
export async function cerrarMesAction(
  periodo: string,
  vuelosEsperados: string[],
  incluirVuelos?: string[],
): Promise<ActionResult<ResultadoCerrarMes>> {
  if (!esMesValido(periodo)) return { ok: false, error: PERIODO_INVALIDO };
  const incluir = idsLimpios(incluirVuelos);
  try {
    const data = await apiServer<ResultadoCerrarMes>(`/v1/cierres/${periodo}`, {
      method: "POST",
      body: {
        confirmar: true,
        vuelos_esperados: vuelosEsperados,
        ...(incluir.length > 0 ? { incluir_vuelos: incluir } : {}),
      },
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

// =============================================================================
// AFAC POR VUELO (16-oct-2026, API 0.0.89, invariante 90 del API)
// =============================================================================

const VUELO_INVALIDO = "No se reconoce el vuelo de esta celda. Pulsa «Actualizar datos».";

/**
 * Captura el COSTO REAL AFAC de un vuelo desde la celda EGRESO del Balance
 * general en pantalla: `PUT /v1/flights/:id/afac-real {costo_real_mxn}`. Las
 * `notas` NO viajan (omitidas ⇒ el API conserva las que haya). Nunca lanza.
 *
 * SIN `revalidatePath` A PROPÓSITO (decisión D10 del contrato): revalidar
 * repintaría la página abierta y el Balance general tarda decenas de
 * segundos en regenerarse; el libro enseña lo tecleado y pide UN refresco 15 s
 * después del último guardado (`RETRASO_REFRESCO_AFAC_MS`). El rechazo
 * conserva `code`/`details`/`status` (409 `MES_CERRADO` con su texto y el
 * enlace a Reportes).
 */
export async function guardarCostoRealAfacAction(input: {
  vueloId: string;
  monto: number;
}): Promise<ActionResult<RespuestaAfacReal>> {
  if (!esUuid(input?.vueloId)) return { ok: false, error: VUELO_INVALIDO };
  const invalido = errorMontoParaApi(input.monto);
  if (invalido) return { ok: false, error: invalido };
  try {
    const data = await apiServer<RespuestaAfacReal>(`/v1/flights/${input.vueloId}/afac-real`, {
      method: "PUT",
      body: { costo_real_mxn: Math.round(input.monto * 100) / 100 },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * «Quitar» el costo real AFAC (el vuelo vuelve a «sin capturar»):
 * `DELETE /v1/flights/:id/afac-real`. El panel lo pide SOLO tras la
 * confirmación (acción destructiva: regla del cliente). El API nunca borra la
 * fila: la deja en null y su bitácora registra QUITADO. Sin revalidar (ver
 * arriba). Nunca lanza.
 */
export async function quitarCostoRealAfacAction(input: {
  vueloId: string;
}): Promise<ActionResult<RespuestaAfacReal>> {
  if (!esUuid(input?.vueloId)) return { ok: false, error: VUELO_INVALIDO };
  try {
    const data = await apiServer<RespuestaAfacReal>(`/v1/flights/${input.vueloId}/afac-real`, {
      method: "DELETE",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
