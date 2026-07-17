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

/** Estados de cuenta importados (archivo original archivado en el bucket). */
export function listEstadosCuenta() {
  return apiServer<{ data: EstadoCuentaArchivo[] }>("/v1/conciliacion/estados-cuenta", {
    cache: "no-store",
  });
}
