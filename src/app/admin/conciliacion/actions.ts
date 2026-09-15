"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  auditoriaPaywise,
  candidatosCobroMovimiento,
  type PaywiseAuditoriaQuery,
} from "@/lib/api/conciliacion-server";
import { getFlightSnapshot } from "@/lib/api/flights-server";
import type {
  AutoMatchResultado,
  CandidatosCobroResponse,
  MapeoColumnasPaywise,
  MovimientoBancario,
  ParsedStatement,
  PaywiseAuditoria,
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

export async function parseEstadoCuentaAction(
  filename: string,
  fileBase64: string,
  /** Mapeo manual de columnas Paywise (solo cuando la detección automática
      no reconoció el archivo): fuerza el parser Paywise con esas columnas. */
  mapeo?: MapeoColumnasPaywise,
): Promise<ActionResult<ParsedStatement>> {
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
      },
    });
    revalidatePath("/admin/conciliacion");
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
    return { ok: true };
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

export async function linkMovimientoAction(
  movId: string,
  gastoId: string | null,
): Promise<ActionResult<MovimientoBancario>> {
  try {
    const data = await apiServer<MovimientoBancario>(`/v1/conciliacion/movimientos/${movId}`, {
      method: "PATCH",
      body: { gasto_id: gastoId },
    });
    revalidatePath("/admin/conciliacion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
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
      },
    };
  } catch (err) {
    return fail(err);
  }
}
