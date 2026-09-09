import { apiServer } from "./server";
import type {
  CandidatosCobroResponse,
  CobrosSinBancoResponse,
  ConciliacionResumenCuenta,
  EstadoCuentaArchivo,
  MovimientoListResponse,
  PaywiseAuditoria,
} from "@/types/conciliacion";

export interface ListConciliacionQuery {
  cuenta_bancaria_id?: string;
  conciliado?: boolean;
  limit?: number;
  offset?: number;
}

export function listMovimientosBancarios(query: ListConciliacionQuery = {}) {
  return apiServer<MovimientoListResponse>("/v1/conciliacion/movimientos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function conciliacionResumen(desde?: string, hasta?: string) {
  return apiServer<ConciliacionResumenCuenta[]>("/v1/conciliacion/resumen", {
    searchParams: { desde, hasta },
    cache: "no-store",
  });
}

/** Gasto bancario que NO aparece en ningún estado de cuenta (sin conciliar). */
export interface GastoSinBanco {
  id: string;
  fecha_gasto: string;
  categoria: string;
  monto: string;
  moneda: string | null;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  lugar: string | null;
  proveedor: { nombre: string } | { nombre: string }[] | null;
  captura: { nombre: string } | { nombre: string }[] | null;
  vuelo: { folio: number } | { folio: number }[] | null;
}

export function conciliacionGastosSinBanco() {
  return apiServer<{
    data: GastoSinBanco[];
    total: number;
    desde: string;
    por_moneda: { moneda: string; monto: number }[];
  }>("/v1/conciliacion/gastos-sin-banco", { cache: "no-store" });
}

/** Estados de cuenta importados (archivo original archivado en el bucket). */
export function listEstadosCuenta() {
  return apiServer<{ data: EstadoCuentaArchivo[] }>("/v1/conciliacion/estados-cuenta", {
    cache: "no-store",
  });
}

/**
 * Candidatos para conciliar un ABONO a mano (cobros de vuelo + sobres de
 * grupo): los arma el API en una sola consulta — misma moneda que la cuenta,
 * métodos bancarios, sin conciliar con otro movimiento, ordenados por
 * cercanía del NETO al monto del abono. `dias` = ventana ± (1..180).
 */
export function candidatosCobroMovimiento(movId: string, dias = 60) {
  return apiServer<CandidatosCobroResponse>(
    `/v1/conciliacion/movimientos/${movId}/candidatos-cobro`,
    { searchParams: { dias }, cache: "no-store" },
  );
}

// ===== Paywise (9-sep-2026) =====

export interface PaywiseAuditoriaQuery {
  /** YYYY-MM-DD (abonos de Paywise en el periodo). */
  desde: string;
  hasta: string;
  /** Cuenta PASARELA concreta; sin ella, todas las PASARELA. */
  cuenta_bancaria_id?: string;
  /** Ventana ±días abono↔cobro (default 5: liquidación diferida). */
  dias?: number;
}

/**
 * Auditoría Paywise (solo lectura): cruza los ABONOS importados de las
 * cuentas PASARELA en el periodo contra los cobros con método PAYWISE
 * (fecha ±días, NETO exacto → BRUTO exacto → referencia). El API responde
 * 400 si no hay ninguna cuenta PASARELA: el llamador lo muestra como guía.
 */
export function auditoriaPaywise(q: PaywiseAuditoriaQuery) {
  return apiServer<PaywiseAuditoria>("/v1/conciliacion/paywise/auditoria", {
    searchParams: { ...q } as Record<string, string | number | undefined>,
    cache: "no-store",
  });
}

/**
 * Cobros BANCARIOS (transferencia / HSBC link / cheque / Paywise; cobros de
 * vuelo y sobres) sin liga con ningún abono importado — el espejo de
 * gastos-sin-banco. Default del API: últimos 90 días por fecha_cobro.
 */
export function conciliacionCobrosSinBanco(desde?: string, hasta?: string) {
  return apiServer<CobrosSinBancoResponse>("/v1/conciliacion/cobros-sin-banco", {
    searchParams: { desde, hasta },
    cache: "no-store",
  });
}
