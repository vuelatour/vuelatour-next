"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { candidatosCobroMovimiento } from "@/lib/api/conciliacion-server";
import type {
  CandidatosCobroResponse,
  MovimientoBancario,
  ParsedStatement,
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
): Promise<ActionResult<ParsedStatement>> {
  try {
    const data = await apiServer<ParsedStatement>("/v1/conciliacion/parse", {
      method: "POST",
      body: { filename, file_base64: fileBase64 },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface MovimientoImport {
  fecha: string;
  descripcion?: string;
  monto: number;
  tipo: "CARGO" | "ABONO";
  referencia?: string;
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
    if (data.estado === "LISTO") revalidatePath("/admin/conciliacion");
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
