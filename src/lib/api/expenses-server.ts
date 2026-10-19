import { apiServer } from "./server";
import { esCampoDesconocidoParaApi, sinCampos } from "./campo-opcional";
import type { GastoListResponse, OtrosGastosResponse } from "@/types/expenses";

export interface ListFuelLoadsQuery {
  /** Rango sobre fecha_gasto (DATE), normalmente el mes elegido. */
  desde?: string;
  hasta?: string;
  aeronave_id?: string;
}

/**
 * Cargas de combustible (gastos categoría GAS) del periodo, SIN cap:
 * pagina con offset hasta cubrir `count` (patrón anti-cap-200) para que el
 * resumen mensual por avión nunca sume un mes incompleto.
 */
export async function listFuelLoads(query: ListFuelLoadsQuery = {}) {
  const limit = 200;
  const base = { categoria: "GAS", limit, ...query };
  const first = await apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: { ...base, offset: 0 },
    cache: "no-store",
  });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await apiServer<GastoListResponse>("/v1/expenses", {
      searchParams: { ...base, offset: data.length },
      cache: "no-store",
    });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

export interface ListGastosQuery {
  /** Categoría que NO se lista (API 0.0.90): Gastos manda «NOMINA» porque la
   *  nómina vive en su módulo. Un API previo responde 400 «property
   *  excluir_categoria should not exist» y `listGastos` relee SIN el campo. */
  excluir_categoria?: string;
  vuelo_id?: string;
  aeronave_id?: string;
  usuario_captura_id?: string;
  categoria?: string;
  estatus_comprobante?: string;
  /** PENDIENTE | SOLICITADA | FACTURADA | NO_FACTURABLE, o el agregado
   *  NO_FACTURADA (pend. o sol. — NO_FACTURABLE queda fuera: no está por
   *  facturar). */
  estatus_facturacion?: string;
  medio_pago?: string;
  /** Pagos de una compra de refacciones concreta. */
  compra_id?: string;
  pendientes?: boolean;
  duplicados?: boolean;
  /** Conciliación con el banco: true = cubiertos por cargos, false = sin
   *  cubrir (incluye parciales). Sin el campo, todos. */
  conciliado?: boolean;
  /** Fecha de CAPTURA (día Cancún): lo subido desde esa fecha, sin importar la fecha del ticket. */
  capturado_desde?: string;
  capturado_hasta?: string;
  /** fecha (default: fecha_gasto desc, luego llegada) | captura (capturado_en
   *  desc: "lo último que capturaron"). El Excel del API respeta el mismo orden. */
  orden?: "fecha" | "captura";
  desde?: string;
  hasta?: string;
  /** «Por pagar» (19-oct-2026, API 0.0.95): true = estado ≠ PAGADO. Solo
   *  con la capacidad (`config.gastos_por_pagar`): un API previo daría 400. */
  por_pagar?: boolean;
  limit?: number;
  offset?: number;
}

function pedirGastos(query: ListGastosQuery) {
  return apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

const CAMPO_EXCLUIR = "excluir_categoria" satisfies keyof ListGastosQuery;

/**
 * Pide una página tolerando un API ≤ 0.0.89 (skew de deploy, 16-oct-2026): si
 * la consulta trae `excluir_categoria` y el API responde el 400 «property
 * excluir_categoria should not exist», RELEE sin el campo (patrón
 * `esApiSinRangoFechas`). Es un GET deliberado con OTROS parámetros, no el
 * reintento automático de `apiFetch` (prohibido en 4xx). Un 400 de otro campo
 * o un 5xx suben como siempre. Devuelve también la consulta que funcionó, para
 * que las páginas siguientes no repitan el 400.
 */
async function pedirGastosTolerante(
  query: ListGastosQuery,
): Promise<{ res: GastoListResponse; query: ListGastosQuery }> {
  try {
    return { res: await pedirGastos(query), query };
  } catch (err) {
    if (query.excluir_categoria == null) throw err;
    const { status, message } = (err ?? {}) as { status?: unknown; message?: unknown };
    if (!esCampoDesconocidoParaApi(status, message, CAMPO_EXCLUIR)) throw err;
    const sin = sinCampos(query as Record<string, unknown>, [CAMPO_EXCLUIR]) as ListGastosQuery;
    return { res: await pedirGastos(sin), query: sin };
  }
}

/** Bandeja de gastos para verificación en oficina. */
export async function listGastos(query: ListGastosQuery = {}) {
  return (await pedirGastosTolerante(query)).res;
}

/**
 * TODOS los gastos del filtro, SIN cap: pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200, igual que `listFuelLoads`). Prod ya rebasó
 * los 500 gastos y el corte silencioso hacía parecer "no guardado" un gasto
 * que sí existía (auditoría 29-ago).
 */
export async function listGastosAll(
  query: Omit<ListGastosQuery, "limit" | "offset"> = {},
) {
  const limit = 200;
  const { res: first, query: efectiva } = await pedirGastosTolerante({ ...query, limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await pedirGastos({ ...efectiva, limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

/**
 * Otros gastos del periodo (generales OTRO/FIJO/INDIRECTO sin vuelo) con su
 * reparto entre aviones y el resumen por moneda. Default del API: mes
 * corriente en hora Cancún.
 */
export function listOtrosGastos(query: { desde?: string; hasta?: string } = {}) {
  return apiServer<OtrosGastosResponse>("/v1/expenses/otros-gastos", {
    searchParams: query,
    cache: "no-store",
  });
}

/** Firma las fotos de recibos (bucket privado). */
export function signFuelPhotos(paths: string[]) {
  if (paths.length === 0) return Promise.resolve<Record<string, string>>({});
  return apiServer<Record<string, string>>("/v1/expenses/photo-urls", {
    method: "POST",
    body: { paths },
    cache: "no-store",
  });
}

/**
 * Gastos personales del dueño (categoría PERSONAL_DUENO) del periodo, SIN
 * cap: pagina con offset hasta cubrir `count` (mismo patrón anti-cap que
 * `listFuelLoads`) para que el seguimiento mensual nunca quede incompleto.
 */
export async function listGastosPersonales(
  query: { desde?: string; hasta?: string } = {},
) {
  const limit = 200;
  const base = { categoria: "PERSONAL_DUENO", limit, ...query };
  const first = await apiServer<GastoListResponse>("/v1/expenses", {
    searchParams: { ...base, offset: 0 },
    cache: "no-store",
  });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await apiServer<GastoListResponse>("/v1/expenses", {
      searchParams: { ...base, offset: data.length },
      cache: "no-store",
    });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}
