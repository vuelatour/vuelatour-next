"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { listFlights } from "@/lib/api/flights-server";
import { getBankAccount } from "@/lib/api/bank-accounts-server";
import { listMovimientosBancarios } from "@/lib/api/conciliacion-server";
import type { FlightCobro, FlightListItem } from "@/types/flights";
import type {
  CobroCandidato,
  MovimientoBancario,
  ParsedStatement,
} from "@/types/conciliacion";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
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

/** Vincula (cobroId) o desvincula (null) un ABONO con un cobro de vuelo. */
export async function linkMovimientoCobroAction(
  movId: string,
  cobroId: string | null,
): Promise<ActionResult<MovimientoBancario>> {
  try {
    const data = await apiServer<MovimientoBancario>(
      `/v1/conciliacion/movimientos/${movId}/cobro`,
      { method: "PATCH", body: { cobro_id: cobroId } },
    );
    revalidatePath("/admin/conciliacion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Ventana de búsqueda alrededor de la fecha del abono (días). */
const VENTANA_DIAS = 60;
/** Tope de vuelos a los que se les consultan cobros (el API no expone un
 *  listado global de cobros; se juntan vuelo por vuelo). */
const MAX_VUELOS = 80;
const MAX_CANDIDATOS = 40;
/** Métodos de cobro que llegan al banco (mismo criterio que el auto-cruce del
 *  API + BillPocket, cuyo depósito también aparece en el estado de cuenta).
 *  EFECTIVO y DOLARES viven en caja, nunca como abono directo. */
const METODOS_COBRO_BANCARIOS = new Set([
  "TRANSFERENCIA",
  "HSBC_LINK",
  "CHEQUE",
  "BILLPOCKET",
]);

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Cobros de vuelo candidatos para conciliar un ABONO a mano: vuelos con fecha
 * cercana al abono (±VENTANA_DIAS), solo métodos que tocan el banco, misma
 * moneda que la cuenta y sin estar ya conciliados con otro movimiento.
 * Ordenados por cercanía de monto (contra el NETO depositado, igual que el
 * auto-cruce) y luego de fecha.
 */
export async function buscarCobrosCandidatosAction(params: {
  /** Fecha del abono (YYYY-MM-DD). */
  fecha: string;
  monto: string;
  cuenta_bancaria_id: string;
}): Promise<ActionResult<CobroCandidato[]>> {
  try {
    // La moneda de la cuenta define contra qué se cruza: un abono de la
    // cuenta USD jamás debe ofrecer cobros MXN (misma regla que el API).
    const moneda = await getBankAccount(params.cuenta_bancaria_id)
      .then((c) => c.moneda ?? null)
      .catch(() => null);

    const [vuelosRes, conciliadosRes] = await Promise.all([
      listFlights({
        desde: sumarDias(params.fecha, -VENTANA_DIAS),
        hasta: sumarDias(params.fecha, VENTANA_DIAS),
        limit: 200,
      }),
      // Cobros ya conciliados con otro movimiento: no se vuelven a ofrecer
      // (el API además lo rechaza con 409; aquí se filtran para no confundir).
      listMovimientosBancarios({ conciliado: true, limit: 500 }),
    ]);
    const ocupados = new Set(
      conciliadosRes.data.map((m) => m.cobro_id).filter(Boolean),
    );

    // Vuelos más cercanos a la fecha del abono primero; tope de consultas.
    const refMs = Date.parse(`${params.fecha}T00:00:00Z`);
    const distancia = (v: FlightListItem) =>
      v.fecha_vuelo ? Math.abs(Date.parse(v.fecha_vuelo) - refMs) : Number.MAX_SAFE_INTEGER;
    const vuelos = (
      vuelosRes.data as Array<FlightListItem & { cliente_nombre?: string | null }>
    )
      .sort((a, b) => distancia(a) - distancia(b))
      .slice(0, MAX_VUELOS);

    // Cobros por vuelo, en lotes (no hay endpoint global de cobros).
    const cobros: Array<{ cobro: FlightCobro; vuelo: (typeof vuelos)[number] }> = [];
    const LOTE = 8;
    for (let i = 0; i < vuelos.length; i += LOTE) {
      const lote = vuelos.slice(i, i + LOTE);
      const listas = await Promise.all(
        lote.map((v) =>
          apiServer<FlightCobro[]>(`/v1/flights/${v.id}/payments`, {
            cache: "no-store",
          }).catch(() => [] as FlightCobro[]),
        ),
      );
      listas.forEach((lista, idx) => {
        for (const cobro of lista) cobros.push({ cobro, vuelo: lote[idx] });
      });
    }

    const montoMov = Number(params.monto);
    const data = cobros
      .filter(({ cobro }) => METODOS_COBRO_BANCARIOS.has(cobro.metodo_cobro))
      .filter(({ cobro }) => !moneda || cobro.moneda === moneda)
      .filter(({ cobro }) => !ocupados.has(cobro.id))
      .map(({ cobro, vuelo }) => {
        // El banco deposita monto − comisión: el abono real es el NETO
        // (misma regla que el auto-cruce del API).
        const bruto = Number(cobro.monto);
        const comision = Number(cobro.comision_banco_monto ?? 0) || 0;
        const neto = Math.round((bruto - comision) * 100) / 100;
        const difMonto = Math.abs(neto - montoMov);
        const difFecha = Math.abs(Date.parse(cobro.fecha_cobro) - refMs);
        return { cobro, vuelo, neto, difMonto, difFecha };
      })
      .sort((a, b) => a.difMonto - b.difMonto || a.difFecha - b.difFecha)
      .slice(0, MAX_CANDIDATOS)
      .map(
        ({ cobro, vuelo, neto }): CobroCandidato => ({
          id: cobro.id,
          vuelo_id: cobro.vuelo_id,
          folio: vuelo.folio ?? null,
          cliente: vuelo.cliente_nombre ?? null,
          fecha_cobro: cobro.fecha_cobro,
          monto: cobro.monto,
          moneda: cobro.moneda,
          metodo_cobro: cobro.metodo_cobro,
          neto,
        }),
      );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
