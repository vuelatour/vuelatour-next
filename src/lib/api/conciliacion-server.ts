import { apiServer } from "./server";
import type {
  CandidatosCobroResponse,
  CobrosSinBancoResponse,
  ConciliacionResumenCuenta,
  EstadoCuentaArchivo,
  GastosCandidatosResponse,
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
  /** PAGOS PARCIALES (14-sep-2026, ADITIVOS): un gasto con cargos ligados que
      todavía NO lo cubren sigue apareciendo aquí, con la suma ligada y el
      faltante (columna «Parcial»). API sin desplegar: no vienen. */
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
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

// ===== 1 cargo ↔ N gastos (2-oct-2026, API 0.0.52) =====

export interface GastosCandidatosQuery {
  /** Ya normalizado (`busquedaParaApi`): un monto limpio o un texto ≤ 80. */
  q?: string;
  /** Ventana ± días de la fecha del cargo (1..180; default del API 30). */
  dias?: number;
  /** Tope de candidatos (1..300; default del API 100). */
  limite?: number;
  /** 6-oct-2026 (API 0.0.63): también gastos NO bancarios (efectivo,
      personal; nunca bodega). Viaja SOLO en true, como «true» (el
      `@ToBooleanQuery` del API acepta «true» o «1»); un API previo la
      rechaza. */
  incluir_no_bancarios?: boolean;
}

/**
 * Gastos candidatos para vincular un CARGO (uno o varios): bancarios, SIN
 * conciliar, en la moneda de la cuenta, con fecha ±`dias` del cargo; sin `q`
 * primero los que cuadran con el cargo. 400 `SOLO_CARGOS` con un abono; 503
 * `CONCILIACION_PARTES_NO_DISPONIBLE` sin la migración; 404 «Cannot GET» con
 * un API previo. Solo viajan los parámetros presentes (el DTO rechaza los
 * desconocidos): `incluir_no_bancarios` solo cuando es true.
 */
export function gastosCandidatosMovimiento(movId: string, q: GastosCandidatosQuery = {}) {
  return apiServer<GastosCandidatosResponse>(
    `/v1/conciliacion/movimientos/${movId}/gastos-candidatos`,
    {
      searchParams: {
        ...(q.q ? { q: q.q } : {}),
        ...(q.dias != null ? { dias: q.dias } : {}),
        ...(q.limite != null ? { limite: q.limite } : {}),
        ...(q.incluir_no_bancarios === true ? { incluir_no_bancarios: true } : {}),
      },
      cache: "no-store",
    },
  );
}
