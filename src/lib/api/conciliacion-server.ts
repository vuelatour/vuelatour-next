import { apiServer } from "./server";
import {
  fusionarPaginaMovimientos,
  PAGINA_MOVIMIENTOS_API,
  TOPE_MOVIMIENTOS_VISTA,
} from "@/lib/admin/conciliacion-vista";
import type {
  CandidatosCobroResponse,
  CobrosSinBancoResponse,
  ConciliacionDeGasto,
  ConciliacionResumenCuenta,
  EstadoCuentaArchivo,
  GastosCandidatosResponse,
  MovimientoBancario,
  MovimientoListResponse,
  PaywiseAuditoria,
  TipoMovimientoBancario,
} from "@/types/conciliacion";

export interface ListConciliacionQuery {
  cuenta_bancaria_id?: string;
  conciliado?: boolean;
  /** ADITIVOS del API (24-sep-2026): tipo y ventana `YYYY-MM-DD` sobre
      `fecha` (día Cancún). El DTO rechaza un ISO con hora: validar antes con
      `rangoVistaConciliacion` (`lib/admin/conciliacion-vista.ts`). */
  tipo?: TipoMovimientoBancario;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
  /** ADITIVO (14-oct-2026, API 0.0.77, invariante 75): pestaña «Omitidos»
      (el API filtra por la clasificación canónica). Viaja SOLO en true: un
      API previo responde 400 «property solo_omitidos should not exist»
      (`fallaListaOmitidos`); sin poder leer la canónica, 503
      OMITIDOS_NO_DISPONIBLE (jamás un vacío falso). */
  solo_omitidos?: boolean;
}

export function listMovimientosBancarios(query: ListConciliacionQuery = {}) {
  return apiServer<MovimientoListResponse>("/v1/conciliacion/movimientos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/** Freno de bucle: con el tope de 2,000 y páginas de 500 bastan 5–6. */
const MAX_PAGINAS_MOVIMIENTOS = 20;

/**
 * TODA la lista de movimientos de la vista (13-oct-2026): pagina por VENTANA
 * DE FECHA (`hasta` = la fecha más vieja de la página anterior, inclusiva, y
 * dedupe por `id`) hasta traer los `count` que dice el API o llegar al tope
 * `TOPE_MOVIMIENTOS_VISTA`. La regla y el porqué de NO usar `offset` viven en
 * `fusionarPaginaMovimientos` (`lib/admin/conciliacion-vista.ts`). Una página
 * fallida LANZA: la lista es el dato del dinero y una lista a medias que
 * parezca completa es peor que el error (sube al boundary, que reintenta).
 */
export async function listMovimientosBancariosTodos(
  query: Omit<ListConciliacionQuery, "limit" | "offset"> = {},
  opts: { tope?: number } = {},
): Promise<{ data: MovimientoBancario[]; count: number; truncado: boolean }> {
  const tope = opts.tope ?? TOPE_MOVIMIENTOS_VISTA;
  const limite = PAGINA_MOVIMIENTOS_API;
  let filas: MovimientoBancario[] = [];
  let hasta: string | null = query.hasta ?? null;
  let total = 0;
  for (let n = 0; n < MAX_PAGINAS_MOVIMIENTOS; n++) {
    const q: ListConciliacionQuery = { ...query, limit: limite, offset: 0 };
    if (hasta) q.hasta = hasta;
    else delete q.hasta;
    const res = await listMovimientosBancarios(q);
    const datos = Array.isArray(res?.data) ? res.data : [];
    if (n === 0) total = Math.max(Number(res?.count) || 0, datos.length);
    const paso = fusionarPaginaMovimientos(filas, datos, {
      limite,
      tope,
      total,
      hastaPedido: hasta,
    });
    filas = paso.filas;
    if (paso.siguienteHasta === null) {
      return { data: filas, count: Math.max(total, filas.length), truncado: paso.truncado };
    }
    hasta = paso.siguienteHasta;
  }
  return { data: filas, count: Math.max(total, filas.length), truncado: true };
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

/** Default del API: últimos 90 días por `fecha_gasto` (cortes Cancún). */
export function conciliacionGastosSinBanco(desde?: string, hasta?: string) {
  return apiServer<{
    data: GastoSinBanco[];
    total: number;
    desde: string;
    por_moneda: { moneda: string; monto: number }[];
  }>("/v1/conciliacion/gastos-sin-banco", {
    searchParams: { desde, hasta },
    cache: "no-store",
  });
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

// ===== Conciliación AL REVÉS de un gasto (13-oct-2026, API 0.0.75) =====

/**
 * `GET /v1/conciliacion/gastos/:id`: los cargos del banco de UN gasto (cuenta
 * sin número ni CLABE, leyenda, lo que aporta cada cargo, su estado de cuenta
 * o por qué no hay archivo, el lote, la justificación de un no bancario,
 * quién registró la liga) y, si sigue pendiente, el último día importado por
 * cuenta. Solo lectura. Roles ADMIN y FACTURACION (403 para los demás); 404
 * `GASTO_NO_EXISTE`; un 404 «Cannot GET» es un API previo. Es GET: hereda el
 * reintento del fetcher ante 502/503/504.
 */
export function conciliacionDeGasto(gastoId: string) {
  return apiServer<ConciliacionDeGasto>(`/v1/conciliacion/gastos/${gastoId}`, { cache: "no-store" });
}
