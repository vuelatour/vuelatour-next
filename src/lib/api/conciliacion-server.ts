import { apiServer } from "./server";
import type {
  ConciliacionResumenCuenta,
  EstadoCuentaArchivo,
  MovimientoListResponse,
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
