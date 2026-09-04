import { apiServer } from "./server";
import { isApiError } from "./errors";
import type { GrupoDetalle, GrupoListResponse, ListGruposQuery } from "@/types/grupos";

/**
 * Lecturas server-side de la cotización de GRUPO (`/v1/grupos`). Mismo
 * helper con JWT (`apiServer`) y mismos errores (`ApiError`) que el resto
 * del panel. Escrituras: `src/app/admin/quotes/grupo/actions.ts`.
 */

/** Una página de grupos (estado derivado, Σ totales de hijos vivos). */
export function listGrupos(query: ListGruposQuery = {}) {
  return apiServer<GrupoListResponse>("/v1/grupos", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * TODOS los grupos del filtro, SIN cap: el API acepta a lo más 200 por
 * consulta y pagina en memoria; se recorre con offset hasta cubrir `count`
 * (patrón anti-cap de `listQuotesAll`, auditoría 29-ago: "ya lo había
 * guardado y no está").
 */
export async function listGruposTodos(
  query: Omit<ListGruposQuery, "limit" | "offset"> = {},
): Promise<Pick<GrupoListResponse, "data" | "count">> {
  const limit = 200;
  const first = await listGrupos({ ...query, limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listGrupos({ ...query, limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

/**
 * Detalle del grupo (cabecera + hijos vivos y cancelados + consolidado +
 * operación + problemas/avisos). `null` si no existe (404) para que la
 * página llame `notFound()`; cualquier otro error se propaga.
 */
export async function getGrupo(id: string): Promise<GrupoDetalle | null> {
  try {
    return await apiServer<GrupoDetalle>(`/v1/grupos/${id}`, { cache: "no-store" });
  } catch (err) {
    if (isApiError(err) && err.status === 404) return null;
    throw err;
  }
}
