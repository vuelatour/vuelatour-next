"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { listGastos } from "@/lib/api/expenses-server";
import { listIngresos, vuelosCandidatos } from "@/lib/api/ingresos-server";
import { esUuid } from "@/lib/admin/url-params";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import {
  CLASIFICACION_REVERSO,
  CLASIFICACION_TRASPASO,
  mensajeErrorIngreso,
  type ArchivoIngresoUrl,
  type RespuestaAplicarAnticipo,
  type RespuestaCobroDesdeAbono,
  type RespuestaDesaplicar,
  type VueloCandidatoIngreso,
} from "@/lib/admin/ingresos-ui";
import type {
  Ingreso,
  PropuestaAbono,
  SugerirAbonosRespuesta,
} from "@/types/ingresos";
import type { CandidatosCobroResponse, MovimientoBancario } from "@/types/conciliacion";

/**
 * INGRESOS (24-sep-2026) — server actions SIN archivo. El alta y la edición
 * con comprobante NO pasan por aquí: van del navegador directo al API
 * (`lib/api/ingresos-browser.ts`, tope de 4.5 MB de Vercel). Todas devuelven
 * `ActionResult` y nunca lanzan. Revalidan Ingresos y Conciliación (y el vuelo
 * cuando tocan un cobro).
 *
 * «Sugerir con IA» tarda hasta ~130 s: hereda el `maxDuration = 300` de la
 * página `/admin/ingresos` desde donde se invoca.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeErrorIngreso(err.code, err.message, err.status),
      code: err.code,
      status: err.status,
      details: err.details,
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Error desconocido",
  };
}

function revalidar(vueloIds: Array<string | null | undefined> = []) {
  revalidatePath("/admin/ingresos");
  revalidatePath("/admin/conciliacion");
  for (const id of vueloIds) {
    if (!id) continue;
    revalidatePath(`/admin/flights/${id}`);
    revalidatePath(`/admin/quotes/${id}`);
  }
}

const ID_INVALIDO: ActionResult<never> = { ok: false, error: "Registro inválido." };

/** Dar de baja (soft delete con motivo; queda en la bitácora). */
export async function bajaIngresoAction(id: string, motivo: string): Promise<ActionResult> {
  if (!esUuid(id)) return ID_INVALIDO;
  const m = motivo.trim();
  if (m.length < 5 || m.length > 500) {
    return { ok: false, error: "Escribe el motivo (mínimo 5 caracteres).", code: "MOTIVO_REQUERIDO" };
  }
  try {
    await apiServer(`/v1/ingresos/${id}/baja`, { method: "POST", body: { motivo: m } });
    revalidar();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Quitar el comprobante (se desreferencia; el objeto queda en el historial). */
export async function quitarArchivoIngresoAction(id: string): Promise<ActionResult> {
  if (!esUuid(id)) return ID_INVALIDO;
  try {
    await apiServer(`/v1/ingresos/${id}/archivo/quitar`, { method: "POST", body: {} });
    revalidar();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** URL FIRMADA (10 min) del comprobante. `data` = la URL (para `abrirArchivoFirmado`). */
export async function archivoIngresoUrlAction(id: string): Promise<ActionResult<string>> {
  if (!esUuid(id)) return ID_INVALIDO;
  try {
    const r = await apiServer<ArchivoIngresoUrl>(`/v1/ingresos/${id}/archivo-url`, {
      cache: "no-store",
    });
    return { ok: true, data: r.url };
  } catch (err) {
    return fail(err);
  }
}

export interface AplicarAnticipoPayload {
  vuelo_id: string;
  monto: number;
  tc_usd_mxn?: number;
  notas?: string;
  /** OBLIGATORIO: el MISMO en los reintentos de confirmación. */
  client_request_id: string;
  aceptar_otro_cliente?: boolean;
}

/** Aplica un anticipo a un vuelo: el API crea un cobro NORMAL ligado al anticipo. */
export async function aplicarAnticipoAction(
  ingresoId: string,
  payload: AplicarAnticipoPayload,
): Promise<ActionResult<RespuestaAplicarAnticipo>> {
  if (!esUuid(ingresoId) || !esUuid(payload.vuelo_id)) return ID_INVALIDO;
  try {
    const body: AplicarAnticipoPayload = {
      vuelo_id: payload.vuelo_id,
      monto: payload.monto,
      client_request_id: payload.client_request_id,
    };
    if (payload.tc_usd_mxn != null && payload.tc_usd_mxn > 0) body.tc_usd_mxn = payload.tc_usd_mxn;
    const notas = payload.notas?.trim();
    if (notas) body.notas = notas.slice(0, 300);
    if (payload.aceptar_otro_cliente) body.aceptar_otro_cliente = true;
    const data = await apiServer<RespuestaAplicarAnticipo>(
      `/v1/ingresos/${ingresoId}/aplicaciones`,
      { method: "POST", body },
    );
    revalidar([payload.vuelo_id]);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Desaplica (borra el cobro del vuelo; el monto regresa al saldo del anticipo). */
export async function desaplicarAnticipoAction(
  ingresoId: string,
  cobroId: string,
  vueloId?: string | null,
): Promise<ActionResult<RespuestaDesaplicar>> {
  if (!esUuid(ingresoId) || !esUuid(cobroId)) return ID_INVALIDO;
  try {
    const data = await apiServer<RespuestaDesaplicar>(
      `/v1/ingresos/${ingresoId}/aplicaciones/${cobroId}`,
      { method: "DELETE" },
    );
    revalidar([vueloId]);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Liga (o suelta con `null`) un ABONO a un ingreso registrado. */
export async function ligarAbonoIngresoAction(
  movId: string,
  ingresoId: string | null,
): Promise<ActionResult<MovimientoBancario>> {
  if (!esUuid(movId) || (ingresoId !== null && !esUuid(ingresoId))) return ID_INVALIDO;
  try {
    const data = await apiServer<MovimientoBancario>(
      `/v1/conciliacion/movimientos/${movId}/ingreso`,
      { method: "PATCH", body: { ingreso_id: ingresoId } },
    );
    revalidar();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface CobroDesdeAbonoPayload {
  vuelo_id: string;
  monto?: number;
  comision_banco_monto?: number | null;
  tc_usd_mxn?: number;
  notas?: string;
  client_request_id: string;
}

/**
 * «Es el pago de un vuelo»: registra el cobro en el vuelo y lo concilia con el
 * abono en una sola operación (si la liga falla, el API borra el cobro).
 */
export async function cobroDeVueloDesdeAbonoAction(
  movId: string,
  payload: CobroDesdeAbonoPayload,
): Promise<ActionResult<RespuestaCobroDesdeAbono>> {
  if (!esUuid(movId) || !esUuid(payload.vuelo_id)) return ID_INVALIDO;
  try {
    const body: CobroDesdeAbonoPayload = {
      vuelo_id: payload.vuelo_id,
      client_request_id: payload.client_request_id,
    };
    if (payload.monto != null && payload.monto > 0) body.monto = payload.monto;
    if (payload.comision_banco_monto !== undefined) body.comision_banco_monto = payload.comision_banco_monto;
    if (payload.tc_usd_mxn != null && payload.tc_usd_mxn > 0) body.tc_usd_mxn = payload.tc_usd_mxn;
    const notas = payload.notas?.trim();
    if (notas) body.notas = notas.slice(0, 300);
    const data = await apiServer<RespuestaCobroDesdeAbono>(
      `/v1/ingresos/abonos/${movId}/cobro-de-vuelo`,
      { method: "POST", body },
    );
    revalidar([payload.vuelo_id]);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Liga un ABONO a un cobro de vuelo (`{cobro_id}`) o al SOBRE de un grupo (`{cobro_grupo_id}`). */
export async function ligarAbonoCobroAction(
  movId: string,
  liga: { cobro_id?: string | null; cobro_grupo_id?: string | null },
): Promise<ActionResult<MovimientoBancario>> {
  if (!esUuid(movId)) return ID_INVALIDO;
  try {
    const data = await apiServer<MovimientoBancario>(
      `/v1/conciliacion/movimientos/${movId}/cobro`,
      {
        method: "PATCH",
        body: {
          cobro_id: liga.cobro_id ?? null,
          cobro_grupo_id: liga.cobro_grupo_id ?? null,
        },
      },
    );
    revalidar([data?.cobro?.vuelo_id]);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Clasifica un abono como TRASPASO entre cuentas o REVERSO de un cargo (no son
 * ingresos). Crea —o recupera, es idempotente por nombre— la clasificación
 * canónica y concilia el movimiento con ella.
 */
export async function clasificarAbonoAction(
  movId: string,
  tipo: "TRASPASO" | "REVERSO",
): Promise<ActionResult> {
  if (!esUuid(movId)) return ID_INVALIDO;
  const nombre = tipo === "TRASPASO" ? CLASIFICACION_TRASPASO : CLASIFICACION_REVERSO;
  try {
    const c = await apiServer<{ id: string }>("/v1/conciliacion/clasificaciones", {
      method: "POST",
      body: { nombre },
    });
    await apiServer(`/v1/conciliacion/movimientos/${movId}/clasificar`, {
      method: "PATCH",
      body: { clasificacion_id: c.id },
    });
    revalidar();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export interface SugerirAbonosPayload {
  cuenta_bancaria_id?: string;
  desde?: string;
  hasta?: string;
  /** 1..30 (el DTO del API se llama `limite`). */
  limite?: number;
  /** ≤ 30 uuid; manda sobre desde/hasta. */
  movimiento_ids?: string[];
}

/** «Sugerir con IA»: la IA PROPONE, nunca liga (la persona acepta cada una). */
export async function sugerirAbonosAction(
  q: SugerirAbonosPayload,
): Promise<ActionResult<SugerirAbonosRespuesta>> {
  try {
    const ids = (q.movimiento_ids ?? []).filter(esUuid).slice(0, 30);
    const body: SugerirAbonosPayload = {};
    if (ids.length > 0) body.movimiento_ids = ids;
    else {
      if (q.cuenta_bancaria_id && esUuid(q.cuenta_bancaria_id)) {
        body.cuenta_bancaria_id = q.cuenta_bancaria_id;
      }
      if (q.desde) body.desde = q.desde;
      if (q.hasta) body.hasta = q.hasta;
    }
    if (q.limite) body.limite = Math.max(1, Math.min(30, Math.round(q.limite)));
    const data = await apiServer<SugerirAbonosRespuesta>("/v1/conciliacion/sugerir-abonos", {
      method: "POST",
      body,
    });
    return {
      ok: true,
      data: { ...data, propuestas: Array.isArray(data?.propuestas) ? data.propuestas : [] },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Candidatos de un ABONO para «Vincular»: cobros, sobres e INGRESOS registrados. */
export async function candidatosAbonoAction(
  movId: string,
  dias = 30,
): Promise<ActionResult<CandidatosCobroResponse>> {
  if (!esUuid(movId)) return ID_INVALIDO;
  try {
    const data = await apiServer<CandidatosCobroResponse>(
      `/v1/conciliacion/movimientos/${movId}/candidatos-cobro`,
      { searchParams: { dias }, cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Vuelos para aplicar un anticipo o registrar el cobro de un abono. */
export async function vuelosCandidatosAction(q: {
  cliente_id?: string | null;
  q?: string;
  alcance?: "cliente" | "todos";
}): Promise<ActionResult<VueloCandidatoIngreso[]>> {
  const clienteId = q.cliente_id && esUuid(q.cliente_id) ? q.cliente_id : undefined;
  const texto = (q.q ?? "").trim().slice(0, 80);
  const alcance = clienteId ? (q.alcance ?? "cliente") : "todos";
  // Con alcance «todos» (con o sin cliente: el cliente solo sirve para marcar
  // `es_otro_cliente`) el API exige `q` de 2+ caracteres (400 BUSQUEDA_CORTA):
  // no se pregunta en vano.
  if (alcance === "todos" && texto.length < 2) return { ok: true, data: [] };
  try {
    const r = await vuelosCandidatos({
      ...(clienteId ? { cliente_id: clienteId } : {}),
      ...(texto ? { q: texto } : {}),
      alcance,
    });
    return { ok: true, data: Array.isArray(r?.data) ? r.data : [] };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Anticipos CON SALDO de un cliente (banner de la card de cobros del vuelo).
 * Una pista, no un dato: cualquier falla (sin permiso, sin la migración, API
 * previo) responde `ok:false` y el banner simplemente no se pinta.
 */
export async function anticiposDeClienteAction(
  clienteId: string,
): Promise<ActionResult<Ingreso[]>> {
  if (!esUuid(clienteId)) return ID_INVALIDO;
  try {
    const r = await listIngresos({
      vista: "anticipos",
      cliente_id: clienteId,
      saldo: "con_saldo",
      limit: 5,
    });
    return {
      ok: true,
      data: (r?.data ?? []).filter((i) => (i.anticipo?.saldo ?? 0) > 0.005 && !i.baja),
    };
  } catch (err) {
    return fail(err);
  }
}

/** Gastos recientes para «Gasto relacionado» de un reembolso recibido. */
export async function gastosParaReembolsoAction(): Promise<
  ActionResult<Array<{ value: string; label: string; description?: string }>>
> {
  try {
    const r = await listGastos({ limit: 200 });
    return {
      ok: true,
      data: (r?.data ?? []).map((g) => ({
        value: g.id,
        label: `${categoriaGastoLabel(g.categoria)} · ${fmtMonto(g.monto, g.moneda ?? "MXN")} · ${fmtDateOnly(
          g.fecha_gasto,
        )}`,
        description: g.proveedor?.nombre ?? undefined,
      })),
    };
  } catch (err) {
    return fail(err);
  }
}

/** Acepta UNA propuesta de la IA que liga o clasifica (lote o fila). */
export async function aceptarPropuestaAbonoAction(p: PropuestaAbono): Promise<ActionResult> {
  if (p.accion === "CLASIFICAR_TRASPASO") return clasificarAbonoAction(p.movimiento_id, "TRASPASO");
  if (p.accion === "CLASIFICAR_REVERSO") return clasificarAbonoAction(p.movimiento_id, "REVERSO");
  if (p.accion === "LIGAR" && p.candidato) {
    const c = p.candidato;
    if (c.tipo === "INGRESO") return ligarAbonoIngresoAction(p.movimiento_id, c.id);
    return ligarAbonoCobroAction(
      p.movimiento_id,
      c.tipo === "SOBRE_GRUPO" ? { cobro_grupo_id: c.id } : { cobro_id: c.id },
    );
  }
  return { ok: false, error: "Esta propuesta se revisa a mano." };
}
