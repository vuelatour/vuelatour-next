"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  auditoriaPaywise,
  candidatosCobroMovimiento,
  gastosCandidatosMovimiento,
  type PaywiseAuditoriaQuery,
} from "@/lib/api/conciliacion-server";
import { getFlightSnapshot } from "@/lib/api/flights-server";
import { esUuid } from "@/lib/admin/url-params";
import {
  MAX_GASTOS_LOTE,
  MSG_ELIGE_UN_GASTO,
  MSG_GASTO_INVALIDO,
  MSG_LOTE_API_VIEJO,
  MSG_TOPE_GASTOS_LOTE,
  busquedaParaApi,
  esDtoSinLote,
  esRutaInexistente,
} from "@/lib/admin/conciliacion-lote";
import {
  MSG_JUSTIFICACION_API_VIEJO,
  MSG_NO_BANCARIOS_API_VIEJO,
  esDtoSinJustificacion,
  esDtoSinNoBancarios,
  estadoJustificacion,
  limpiarJustificacion,
} from "@/lib/admin/conciliacion-no-bancario";
import {
  VENTANA_REVERSO_DIAS,
  abonosCandidatosParaCargo,
  candidatosDeRespuesta,
  diaMasReverso,
  ordenarCargosParaAbono,
} from "@/lib/admin/conciliacion-reverso";
import type {
  AutoMatchResultado,
  CandidatoReverso,
  CandidatosCobroResponse,
  GastosCandidatosResponse,
  MapeoColumnasPaywise,
  MovimientoBancario,
  MovimientoListResponse,
  ParejaReverso,
  ParsedStatement,
  PaywiseAuditoria,
  ReversosAutoResultado,
  SugerenciaConciliacion,
  SugerirLoteResponse,
} from "@/types/conciliacion";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Código del API (filtro de excepciones), p. ej. COBRO_DE_GRUPO: permite
      detectar candados sin regex sobre el mensaje. */
  code?: string;
  /** Status HTTP del API (409 = conflicto: ya conciliado, parte de sobre…). */
  status?: number;
  /** Detalle estructurado del error del API (si lo mandó). */
  details?: unknown;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      status: err.status,
      details: err.details,
    };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/**
 * Lee el estado de cuenta (sin persistir). El archivo viaja en base64 DENTRO
 * de un objeto, nunca como argumento suelto: React (decodeReply) limita a
 * 1,000,000 caracteres la suma de los textos que van directos en la lista de
 * argumentos de una server action y revienta con «Maximum array nesting
 * exceeded» (29-sep-2026: un PDF de Scotiabank de 1.18 MB = 1.6 M caracteres
 * en base64 tiraba la importación con el error genérico del servidor; los
 * archivos menores a ~750 KB pasaban). Dentro de un objeto el texto no cuenta.
 */
export async function parseEstadoCuentaAction(input: {
  filename: string;
  fileBase64: string;
  /** Mapeo manual de columnas Paywise (solo cuando la detección automática
      no reconoció el archivo): fuerza el parser Paywise con esas columnas. */
  mapeo?: MapeoColumnasPaywise;
}): Promise<ActionResult<ParsedStatement>> {
  const { filename, fileBase64, mapeo } = input;
  try {
    const data = await apiServer<ParsedStatement>("/v1/conciliacion/parse", {
      method: "POST",
      body: mapeo
        ? { filename, file_base64: fileBase64, mapeo }
        : { filename, file_base64: fileBase64 },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface MovimientoImport {
  fecha: string;
  descripcion?: string;
  /** Positivo; en Paywise es el NETO depositado. */
  monto: number;
  tipo: "CARGO" | "ABONO";
  referencia?: string;
  /** ADITIVOS (Paywise): bruto cobrado y comisión retenida del movimiento. */
  monto_bruto?: number;
  comision_monto?: number;
}

export async function importarMovimientosAction(payload: {
  cuenta_bancaria_id: string;
  movimientos: MovimientoImport[];
  /** Archivo original del estado de cuenta: el API lo archiva en el bucket
   *  para poder consultarlo/descargarlo después (opcional, best-effort). */
  filename?: string;
  file_base64?: string;
}): Promise<ActionResult<{ importados: number; conciliados_auto: number; duplicados_omitidos?: number }>> {
  try {
    const data = await apiServer<{ importados: number; conciliados_auto: number; duplicados_omitidos?: number }>(
      "/v1/conciliacion/importar",
      { method: "POST", body: payload },
    );
    revalidatePath("/admin/conciliacion");
    // Los ABONOS nuevos caen en Ingresos → «Por conciliar» (24-sep-2026).
    revalidatePath("/admin/ingresos");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Importación como JOB del servidor: responde job_id de inmediato; el
 * proceso sigue en el backend aunque se cierre el navegador. El avance se
 * consulta con importJobStatusAction (barra de porcentaje en el diálogo).
 */
export async function importarMovimientosAsyncAction(payload: {
  cuenta_bancaria_id: string;
  movimientos: MovimientoImport[];
  filename?: string;
  file_base64?: string;
}): Promise<ActionResult<{ job_id: string }>> {
  try {
    const data = await apiServer<{ job_id: string }>(
      "/v1/conciliacion/importar-async",
      { method: "POST", body: payload },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface ImportJobStatus {
  id: string;
  estado: "PROCESANDO" | "LISTO" | "ERROR";
  progreso: number;
  paso: string | null;
  total_movimientos: number;
  importados: number | null;
  conciliados_auto: number | null;
  duplicados_omitidos: number | null;
  error: string | null;
  /** CONTEO POR RESULTADO (ADITIVOS 15-sep-2026): un movimiento que falla ya
      NO tumba el job — se cuenta aquí y el resto sigue. Sin estos campos
      (API sin desplegar) el resumen se comporta como antes. */
  ambiguos?: number | null;
  sin_candidato?: number | null;
  traspasos?: number | null;
  /** Devoluciones emparejadas con su cargo (criterio REVERSO, 30-sep-2026). */
  reversos?: number | null;
  rechazados?: number | null;
  errores?: number | null;
  errores_detalle?: Array<{ error?: string | null; movimiento_id?: string }> | null;
  por_criterio?: Record<string, number> | null;
  /** 'IMPORT' | 'RECRUCE' (el re-cruce reusa la tabla de jobs). */
  tipo?: string | null;
}

export async function importJobStatusAction(
  jobId: string,
): Promise<ActionResult<ImportJobStatus>> {
  try {
    const data = await apiServer<ImportJobStatus>(
      `/v1/conciliacion/importar-status/${jobId}`,
      { cache: "no-store" },
    );
    // Al terminar, refresca la página de conciliación (movimientos nuevos).
    // TAMBIÉN en ERROR (15-sep-2026): el job puede morir a medias con los
    // movimientos YA insertados — el 15-sep el operador no los vio y volvió
    // a importar dos veces.
    if (data.estado === "LISTO" || data.estado === "ERROR") {
      revalidatePath("/admin/conciliacion");
      // El estado de cuenta también se sube desde Ingresos (24-sep-2026).
      revalidatePath("/admin/ingresos");
    }
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Volver a cruzar pendientes / sugerencias IA (15-sep-2026) =====

/** Rango y alcance de «Cruzar pendientes» (el de la vista por default). */
export interface AutoMatchQuery {
  cuenta_bancaria_id?: string;
  /** YYYY-MM-DD (fecha del movimiento, día de pared). */
  desde?: string;
  hasta?: string;
  /** Alternativa: solo estos movimientos. */
  movimiento_ids?: string[];
  /**
   * Solo CARGOS o solo ABONOS (24-sep-2026, `AutoMatchDto.tipo` ADITIVO del
   * API): desde Ingresos → «Por conciliar» se cruzan solo los abonos. Sin él
   * se cruza todo, como antes. OJO: con un API previo el campo es un 400
   * (`forbidNonWhitelisted`), por eso solo se manda cuando se pide.
   */
  tipo?: "CARGO" | "ABONO";
}

/**
 * «Cruzar pendientes»: vuelve a correr el cruce automático sobre los
 * movimientos NO conciliados del rango. Existe porque el auto-cruce solo
 * corría dentro de la importación: si el cruce falló (o el gasto se capturó
 * después), esos movimientos quedaban pendientes para siempre.
 *
 * NUNCA liga lo ambiguo: lo cuenta y lo deja para el operador.
 */
export async function autoMatchAction(
  q: AutoMatchQuery,
): Promise<ActionResult<AutoMatchResultado>> {
  try {
    const data = await apiServer<AutoMatchResultado>("/v1/conciliacion/auto-match", {
      method: "POST",
      body: {
        ...(q.cuenta_bancaria_id ? { cuenta_bancaria_id: q.cuenta_bancaria_id } : {}),
        ...(q.desde ? { desde: q.desde } : {}),
        ...(q.hasta ? { hasta: q.hasta } : {}),
        ...(q.movimiento_ids?.length ? { movimiento_ids: q.movimiento_ids } : {}),
        ...(q.tipo ? { tipo: q.tipo } : {}),
      },
    });
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sugerencia IA de UN movimiento: devuelve los candidatos (deterministas,
 * del API) y —si el asistente está configurado— cuál propone y por qué.
 * La IA PROPONE; vincular siempre lo confirma una persona.
 */
export async function sugerirMovimientoAction(
  movId: string,
): Promise<ActionResult<SugerenciaConciliacion>> {
  try {
    const data = await apiServer<SugerenciaConciliacion>(
      `/v1/conciliacion/movimientos/${movId}/sugerir`,
      { method: "POST", body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Sugerencias IA para TODOS los pendientes del rango (una por movimiento). */
export async function sugerirLoteAction(q: {
  cuenta_bancaria_id?: string;
  desde?: string;
  hasta?: string;
  /** Tope de movimientos a consultar (el API lo llama `limite`, 1..40). */
  limite?: number;
}): Promise<ActionResult<SugerirLoteResponse>> {
  try {
    const data = await apiServer<SugerirLoteResponse>("/v1/conciliacion/sugerir-lote", {
      method: "POST",
      body: {
        ...(q.cuenta_bancaria_id ? { cuenta_bancaria_id: q.cuenta_bancaria_id } : {}),
        ...(q.desde ? { desde: q.desde } : {}),
        ...(q.hasta ? { hasta: q.hasta } : {}),
        // OJO: el DTO del API es `limite` y su ValidationPipe rechaza
        // propiedades desconocidas (forbidNonWhitelisted): mandar `limit`
        // devolvía 400 en cuanto alguien pasara el tope.
        ...(q.limite ? { limite: q.limite } : {}),
      },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface Clasificacion {
  id: string;
  nombre: string;
  activo: boolean;
}

/** Catálogo de clasificaciones "sin vuelo" (comisión del banco, etc.). */
export async function listClasificacionesAction(): Promise<
  ActionResult<Clasificacion[]>
> {
  try {
    const data = await apiServer<Clasificacion[]>(
      "/v1/conciliacion/clasificaciones",
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Crea una clasificación (o devuelve la existente con ese nombre). */
export async function crearClasificacionAction(
  nombre: string,
): Promise<ActionResult<Clasificacion>> {
  try {
    const data = await apiServer<Clasificacion>(
      "/v1/conciliacion/clasificaciones",
      { method: "POST", body: { nombre } },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Concilia por clasificación (movimiento que no corresponde a ningún vuelo)
 * con notas; clasificacion_id null la quita y vuelve a Pendiente.
 */
export async function clasificarMovimientoAction(
  movId: string,
  payload: { clasificacion_id: string | null; notas?: string },
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/conciliacion/movimientos/${movId}/clasificar`, {
      method: "PATCH",
      body: payload,
    });
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Cargo devuelto ↔ su devolución (30-sep-2026, API 0.0.44) =====

const MOV_INVALIDO = { ok: false as const, error: "Movimiento inválido." };

/** Lo mínimo del movimiento de partida para buscar su pareja. */
export interface MovimientoParaReverso {
  id: string;
  tipo: "CARGO" | "ABONO";
  cuenta_bancaria_id: string;
  /** DATE `YYYY-MM-DD`. */
  fecha: string;
  monto: string | number;
  descripcion?: string | null;
}

/**
 * Candidatos para emparejar un cargo con su devolución.
 *
 * - Desde un ABONO: `GET movimientos/:id/reverso-candidatos` (cargos
 *   pendientes de la misma cuenta y monto, de abono.fecha − 60 días a
 *   abono.fecha; el API excluye los ligados a un gasto). Primero los del día
 *   que dice la descripción («CARGO INDEBIDO 21 SEP» ⇒ los del 21).
 * - Desde un CARGO: los abonos PENDIENTES de la cuenta del día del cargo a
 *   +60 días (`GET movimientos?tipo=ABONO&conciliado=false&desde&hasta`,
 *   parámetros que el DTO acepta desde el 24-sep) filtrados por monto, con
 *   las devoluciones primero (`abonosCandidatosParaCargo`, PURO + test).
 *
 * Nunca lanza: un fallo de lectura vuelve como error (el diálogo dice que no
 * se pudo buscar; jamás «no hay candidatos»).
 */
export async function candidatosReversoAction(
  mov: MovimientoParaReverso,
): Promise<ActionResult<CandidatoReverso[]>> {
  if (!esUuid(mov?.id) || !esUuid(mov?.cuenta_bancaria_id)) return MOV_INVALIDO;
  const fecha = String(mov.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha del movimiento inválida." };
  try {
    if (mov.tipo === "ABONO") {
      const data = await apiServer<unknown>(
        `/v1/conciliacion/movimientos/${mov.id}/reverso-candidatos`,
        { cache: "no-store" },
      );
      return { ok: true, data: ordenarCargosParaAbono(mov, candidatosDeRespuesta(data)) };
    }
    const lista = await apiServer<MovimientoListResponse>("/v1/conciliacion/movimientos", {
      searchParams: {
        cuenta_bancaria_id: mov.cuenta_bancaria_id,
        conciliado: false,
        tipo: "ABONO",
        desde: fecha,
        hasta: diaMasReverso(fecha, VENTANA_REVERSO_DIAS),
        limit: 500,
      },
      cache: "no-store",
    });
    return {
      ok: true,
      data: abonosCandidatosParaCargo(
        { ...mov, fecha, tipo: "CARGO" },
        (lista?.data ?? []) as MovimientoBancario[],
      ),
    };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Empareja el ABONO (devolución) con el CARGO que devuelve: el API hace los
 * dos updates con verificación previa y deja los dos conciliados como
 * «Reverso de un cargo». 409 `REVERSO_INVALIDO` trae el motivo del trigger.
 */
export async function emparejarReversoAction(
  abonoId: string,
  cargoId: string,
): Promise<ActionResult<ParejaReverso>> {
  if (!esUuid(abonoId) || !esUuid(cargoId) || abonoId === cargoId) return MOV_INVALIDO;
  try {
    const data = await apiServer<ParejaReverso>(
      `/v1/conciliacion/movimientos/${abonoId}/reverso`,
      { method: "POST", body: { cargo_id: cargoId } },
    );
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deshace la pareja desde CUALQUIERA de los dos (abono o cargo): los dos
 * vuelven a pendiente. El panel confirma antes de llamar.
 */
export async function quitarReversoAction(movId: string): Promise<ActionResult> {
  if (!esUuid(movId)) return MOV_INVALIDO;
  try {
    await apiServer(`/v1/conciliacion/movimientos/${movId}/reverso`, { method: "DELETE" });
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * «Emparejar devoluciones»: el API busca los abonos pendientes cuya
 * descripción dice devolución (CARGO INDEBIDO, DEVOLUCION, REVERSO…) y los
 * empareja con su cargo; lo ambiguo lo deja pendiente. Solo viajan los
 * filtros que vienen (el DTO rechaza propiedades desconocidas).
 */
export async function emparejarReversosAutoAction(q: {
  cuenta_bancaria_id?: string;
  desde?: string;
  hasta?: string;
}): Promise<ActionResult<ReversosAutoResultado>> {
  const dia = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const cuenta = q.cuenta_bancaria_id && esUuid(q.cuenta_bancaria_id) ? q.cuenta_bancaria_id : undefined;
  const desde = dia(q.desde);
  const hasta = dia(q.hasta);
  try {
    const data = await apiServer<ReversosAutoResultado>("/v1/conciliacion/reversos/auto", {
      method: "POST",
      body: {
        ...(cuenta ? { cuenta_bancaria_id: cuenta } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
      },
    });
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** URL firmada (1 h, con descarga) del estado de cuenta archivado. */
export async function estadoCuentaUrlAction(
  id: string,
): Promise<ActionResult<{ url: string; filename: string }>> {
  try {
    const data = await apiServer<{ url: string; filename: string }>(
      `/v1/conciliacion/estados-cuenta/${id}/url`,
      { method: "POST", body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Opciones de la liga (6-oct-2026, API 0.0.63): `justificacion` = por qué se
 * vincula un gasto que NO pasó por el banco (efectivo, personal). Solo la
 * manda el diálogo cuando hay uno marcado; sin ella el cuerpo es el de
 * siempre (un API previo rechaza llaves desconocidas).
 */
export interface OpcionesVinculoGasto {
  justificacion?: string | null;
}

/**
 * La justificación que viaja (limpia: espacios colapsados, sin orillas) o el
 * error en es-MX ANTES de la red; ausente o vacía ⇒ no viaja.
 */
function justificacionQueViaja(
  j: unknown,
): { ok: true; valor: string | null } | { ok: false; error: string } {
  if (j == null) return { ok: true, valor: null };
  if (typeof j !== "string") return { ok: false, error: estadoJustificacion("").texto };
  const limpia = limpiarJustificacion(j);
  if (!limpia) return { ok: true, valor: null };
  const e = estadoJustificacion(limpia);
  return e.valida ? { ok: true, valor: limpia } : { ok: false, error: e.texto };
}

/** Con justificación, la nota también se escribe en el GASTO: Gastos se refresca. */
function revalidarVinculo(conJustificacion: boolean) {
  revalidatePath("/admin/conciliacion");
  if (conJustificacion) revalidatePath("/admin/expenses");
}

/**
 * Liga un CARGO con UN gasto (`PATCH movimientos/:id {gasto_id}`) o lo
 * desliga TODO (`gasto_id: null`, también un lote). Con
 * `opciones.justificacion` (gasto en EFECTIVO u otro medio no bancario) viaja
 * `{gasto_id, justificacion}`: el API liga SIN tocar el medio de pago y anota
 * la razón en el cargo y en el gasto. Al desligar nunca viaja. 400 «property
 * justificacion should not exist» (API previo) ⇒ `API_SIN_JUSTIFICACION`.
 */
export async function linkMovimientoAction(
  movId: string,
  gastoId: string | null,
  opciones: OpcionesVinculoGasto = {},
): Promise<ActionResult<MovimientoBancario>> {
  const j = gastoId != null ? justificacionQueViaja(opciones?.justificacion) : ({ ok: true, valor: null } as const);
  if (!j.ok) return { ok: false, code: "JUSTIFICACION_INVALIDA", error: j.error };
  try {
    const data = await apiServer<MovimientoBancario>(`/v1/conciliacion/movimientos/${movId}`, {
      method: "PATCH",
      body: j.valor ? { gasto_id: gastoId, justificacion: j.valor } : { gasto_id: gastoId },
    });
    revalidarVinculo(j.valor != null);
    return { ok: true, data };
  } catch (err) {
    const r = fail<MovimientoBancario>(err);
    if (j.valor && esDtoSinJustificacion(r)) {
      return { ok: false, code: "API_SIN_JUSTIFICACION", status: 400, error: MSG_JUSTIFICACION_API_VIEJO };
    }
    return r;
  }
}

// ===== 1 cargo ↔ N gastos («lote», 2-oct-2026, API 0.0.52) =====

/** Entero dentro de [min, max] o undefined (no viaja: default del API). */
const enteroEn = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/**
 * Gastos candidatos para vincular un CARGO (`GET movimientos/:id/
 * gastos-candidatos`). `q` se normaliza (un monto viaja limpio: «2,801.40» ⇒
 * «2801.40») y se recorta a 80 (`@MaxLength(80)` del DTO). Nunca lanza y
 * JAMÁS devuelve `data: []` ante un fallo: el diálogo dice «no se pudo» (y
 * «Reintentar»), nunca «no hay gastos». 404 «Cannot GET» (API previo) ⇒
 * `code: 'RUTA_NO_DISPONIBLE'`: el diálogo pasa a la lista precargada de
 * siempre (un solo gasto). `incluir_no_bancarios` (6-oct-2026, API 0.0.63)
 * viaja SOLO en true (también efectivo y dinero personal, nunca bodega); un
 * API previo responde 400 «property incluir_no_bancarios should not exist» ⇒
 * `API_SIN_NO_BANCARIOS` con el texto que dice apagar el interruptor.
 */
export async function gastosCandidatosAction(
  movId: string,
  query: {
    q?: string | null;
    dias?: number | null;
    limite?: number | null;
    incluir_no_bancarios?: boolean | null;
  } = {},
): Promise<ActionResult<GastosCandidatosResponse>> {
  if (!esUuid(movId)) return MOV_INVALIDO;
  const q = busquedaParaApi(query.q);
  const dias = enteroEn(query.dias, 1, 180);
  const limite = enteroEn(query.limite, 1, 300);
  const incluir = query.incluir_no_bancarios === true;
  try {
    const data = await gastosCandidatosMovimiento(movId, {
      ...(q ? { q } : {}),
      ...(dias != null ? { dias } : {}),
      ...(limite != null ? { limite } : {}),
      ...(incluir ? { incluir_no_bancarios: true } : {}),
    });
    return { ok: true, data };
  } catch (err) {
    const r = fail<GastosCandidatosResponse>(err);
    if (esRutaInexistente(r)) {
      return { ok: false, code: "RUTA_NO_DISPONIBLE", status: 404, error: MSG_LOTE_API_VIEJO };
    }
    if (incluir && esDtoSinNoBancarios(r)) {
      return { ok: false, code: "API_SIN_NO_BANCARIOS", status: 400, error: MSG_NO_BANCARIOS_API_VIEJO };
    }
    return r;
  }
}

/**
 * Liga un CARGO con VARIOS gastos (`PATCH movimientos/:id {gasto_ids}`): el
 * API valida en UNA transacción (misma moneda, cuadre con la tolerancia del
 * lote, cada gasto por lo que le falta) y responde la fila + `gastos_estado`.
 * El cuerpo lleva SOLO `gasto_ids` (con `gasto_id` el API responde 400
 * `LOTE_INVALIDO`). Un API previo responde 400 «property gasto_ids should not
 * exist» ⇒ `code: 'API_SIN_LOTE'`. Los 409 (`CARGO_NO_CUADRA`,
 * `LOTE_MONEDA_DISTINTA`, `GASTO_YA_CUBIERTO`…) conservan code/status/details.
 * Desligar todo sigue siendo `linkMovimientoAction(id, null)`. Con
 * `opciones.justificacion` (un lote con algún gasto en EFECTIVO u otro medio
 * no bancario, 6-oct-2026) viaja `{gasto_ids, justificacion}`.
 */
export async function linkMovimientoGastosAction(
  movId: string,
  gastoIds: readonly string[],
  opciones: OpcionesVinculoGasto = {},
): Promise<ActionResult<MovimientoBancario>> {
  if (!esUuid(movId)) return MOV_INVALIDO;
  const lista = Array.isArray(gastoIds) ? gastoIds : [];
  if (lista.some((g) => !esUuid(g))) return { ok: false, error: MSG_GASTO_INVALIDO };
  const ids = [...new Set(lista)];
  if (ids.length === 0) return { ok: false, error: MSG_ELIGE_UN_GASTO };
  if (ids.length > MAX_GASTOS_LOTE) return { ok: false, error: MSG_TOPE_GASTOS_LOTE };
  const j = justificacionQueViaja(opciones?.justificacion);
  if (!j.ok) return { ok: false, code: "JUSTIFICACION_INVALIDA", error: j.error };
  try {
    const data = await apiServer<MovimientoBancario>(`/v1/conciliacion/movimientos/${movId}`, {
      method: "PATCH",
      body: j.valor ? { gasto_ids: ids, justificacion: j.valor } : { gasto_ids: ids },
    });
    revalidarVinculo(j.valor != null);
    return { ok: true, data };
  } catch (err) {
    const r = fail<MovimientoBancario>(err);
    if (esDtoSinLote(r)) {
      return { ok: false, code: "API_SIN_LOTE", status: 400, error: MSG_LOTE_API_VIEJO };
    }
    if (j.valor && esDtoSinJustificacion(r)) {
      return { ok: false, code: "API_SIN_JUSTIFICACION", status: 400, error: MSG_JUSTIFICACION_API_VIEJO };
    }
    return r;
  }
}

/**
 * Liga de un ABONO: cobro de VUELO (`cobro_id`) O sobre de cobro de GRUPO
 * (`cobro_grupo_id`), excluyentes — el API responde 400 si vienen los dos.
 */
export interface LigaCobroMovimiento {
  cobro_id?: string | null;
  cobro_grupo_id?: string | null;
}

/**
 * Vincula un ABONO con un cobro de vuelo ({cobro_id}) o con el SOBRE de un
 * grupo ({cobro_grupo_id}); `null` = desvincular (el API limpia las dos
 * ligas). Una PARTE de sobre nunca se acepta: 409 COBRO_DE_GRUPO ("concilia
 * contra el sobre"); ya conciliado con otro movimiento: 409.
 */
export async function linkMovimientoCobroAction(
  movId: string,
  liga: LigaCobroMovimiento | null,
): Promise<ActionResult<MovimientoBancario>> {
  try {
    const data = await apiServer<MovimientoBancario>(
      `/v1/conciliacion/movimientos/${movId}/cobro`,
      {
        method: "PATCH",
        body: {
          cobro_id: liga?.cobro_id ?? null,
          cobro_grupo_id: liga?.cobro_grupo_id ?? null,
        },
      },
    );
    revalidatePath("/admin/conciliacion");
    revalidatePath("/admin/ingresos");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Ventana de búsqueda (±días) alrededor de la fecha del abono. */
const VENTANA_DIAS = 60;

/**
 * Candidatos para conciliar un ABONO a mano: cobros de VUELO y SOBRES de
 * grupo, armados por el API (antes el panel juntaba 80 vuelos × payments):
 * misma moneda que la cuenta, métodos que llegan al banco (transferencia,
 * HSBC link, cheque, BillPocket), sin conciliar con otro movimiento,
 * ordenados por cercanía del NETO depositado al monto y luego de fecha. Las
 * partes de un sobre nunca se ofrecen (se concilia el sobre completo).
 */
export async function candidatosCobroAction(
  movId: string,
  dias: number = VENTANA_DIAS,
): Promise<ActionResult<CandidatosCobroResponse>> {
  try {
    const data = await candidatosCobroMovimiento(movId, dias);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Paywise (9-sep-2026) =====

/** Auditoría Paywise (solo lectura) desde un componente cliente. */
export async function auditoriaPaywiseAction(
  q: PaywiseAuditoriaQuery,
): Promise<ActionResult<PaywiseAuditoria>> {
  try {
    const data = await auditoriaPaywise(q);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * «Conciliar los que cuadran»: liga automáticamente los cruces NETO/BRUTO
 * exactos (escribe la comisión REAL de Paywise en el cobro de vuelo antes de
 * ligar; los sobres solo se ligan) y devuelve la auditoría recalculada con
 * `resumen.conciliados_ahora` y `errores` por liga.
 */
export async function conciliarPaywiseAction(
  q: PaywiseAuditoriaQuery,
): Promise<ActionResult<PaywiseAuditoria>> {
  try {
    const data = await apiServer<PaywiseAuditoria>(
      "/v1/conciliacion/paywise/auditoria/conciliar",
      {
        method: "POST",
        body: {},
        searchParams: { ...q } as Record<string, string | number | undefined>,
      },
    );
    revalidatePath("/admin/conciliacion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Contexto mínimo de un vuelo para abrir el formulario de cobro desde la
 *  auditoría (abono de Paywise sin cobro → «Registrar cobro»). */
export interface VueloParaCobro {
  id: string;
  folio: number;
  estado: string;
  monto_total_usd: number;
  total_cobrado: number;
  tc_usd_mxn: number | null;
  /** Los pesos EXACTOS de la cotización (`vuelo.monto_total_mxn`): el
   *  formulario los muestra tal cual en vez de recalcular `usd × tc`. */
  monto_total_mxn: number | null;
  /** ¿El vuelo ya tiene cobros? (decide el monto sugerido al cobrar en MXN). */
  tiene_cobros: boolean;
}

export async function vueloParaCobroAction(
  vueloId: string,
): Promise<ActionResult<VueloParaCobro>> {
  try {
    const s = await getFlightSnapshot(vueloId);
    return {
      ok: true,
      data: {
        id: s.id,
        folio: s.folio,
        estado: s.estado,
        monto_total_usd: Number(s.monto_total_usd) || 0,
        total_cobrado: Number(s.total_cobrado) || 0,
        tc_usd_mxn: s.tc_usd_mxn != null ? Number(s.tc_usd_mxn) : null,
        monto_total_mxn:
          s.monto_total_mxn != null ? Number(s.monto_total_mxn) : null,
        tiene_cobros: (s.cobros?.length ?? 0) > 0,
      },
    };
  } catch (err) {
    return fail(err);
  }
}
