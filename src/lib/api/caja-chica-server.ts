import { apiServer } from "./server";
import type { CajaFondoDetail, CajaFondoListResponse } from "@/types/caja-chica";

export interface ListFondosQuery {
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listFondos(query: ListFondosQuery = {}) {
  return apiServer<CajaFondoListResponse>("/v1/caja-chica/fondos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * Personas a las que se les puede abrir fondo. Sale de la tabla real de fondos
 * (no del flag `usuario.tiene_fondo_caja`, que la oficina podía marcar a mano
 * y dejaba gente fuera del selector sin tener fondo).
 */
export function listElegiblesFondo() {
  return apiServer<{ data: { id: string; nombre: string; rol: string }[] }>(
    "/v1/caja-chica/elegibles",
    { cache: "no-store" },
  );
}

export function getFondo(id: string) {
  return apiServer<CajaFondoDetail>(`/v1/caja-chica/fondos/${id}`, { cache: "no-store" });
}
