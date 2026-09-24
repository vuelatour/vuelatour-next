import { apiServer } from "./server";
import type { CotizacionInterna } from "@/types/quotes-interno";
import type { FiltrosListaCotizaciones } from "@/lib/admin/quote-navegacion";
import type { QuoteVecinos } from "@/types/quote-vecinos";
import type {
  CotizacionVersion,
  PersistedQuote,
  PersistedQuoteListResponse,
} from "@/types/quotes-persisted";

export interface ListQuotesQuery {
  cliente_id?: string;
  aeronave_id?: string;
  estado?: string;
  es_externo?: boolean;
  /** Solo los hijos de una cotización de GRUPO (vuelo.grupo_id). */
  grupo_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listQuotes(query: ListQuotesQuery = {}) {
  return apiServer<PersistedQuoteListResponse>("/v1/quotes", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * TODAS las cotizaciones del filtro, SIN cap: pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200, igual que `listFuelLoads`). Con el corte en
 * 200, una cotización recién creada podía "desaparecer" de la lista
 * (auditoría 29-ago: 'ya lo había guardado y no está').
 */
export async function listQuotesAll(
  query: Omit<ListQuotesQuery, "limit" | "offset"> = {},
) {
  const limit = 200;
  const first = await listQuotes({ ...query, limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listQuotes({ ...query, limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

export function getQuote(id: string) {
  return apiServer<PersistedQuote>(`/v1/quotes/${id}`, { cache: "no-store" });
}

export function getQuoteVersions(id: string) {
  return apiServer<CotizacionVersion[]>(`/v1/quotes/${id}/versions`, {
    cache: "no-store",
  });
}

/**
 * HOJA INTERNA en JSON (`GET /v1/quotes/:id/interno`, API 0.0.27): el MISMO
 * payload que imprime el PDF «Cotización interna», para que la pantalla diga
 * exactamente lo mismo que el papel. Roles ADMIN/COORDINADOR/FACTURACION/
 * ANALISTA (los de `ROLES_PDF_INTERNO`); SOCIO responde 403.
 *
 * TOLERANTE A PROPÓSITO — devuelve `null` en vez de lanzar:
 *  - **404**: API anterior al 22-sep-2026 (la ruta no existe) ⇒ la pantalla
 *    cae a la hoja del CLIENTE, que es el comportamiento de siempre.
 *  - **403**: el rol no puede ver el dato interno ⇒ lo mismo, y en silencio
 *    (no es una falla pasajera: recargar no la arregla).
 * Cualquier otro fallo (502 del deploy, red) también degrada a `null`: es una
 * llamada ACCESORIA — la cotización se sigue editando sin ella. Quien la
 * llama la envuelve en `degradado.opcional` para AVISARLO en pantalla.
 */
export async function getQuoteInterno(id: string): Promise<CotizacionInterna | null> {
  try {
    return await apiServer<CotizacionInterna>(`/v1/quotes/${id}/interno`, {
      cache: "no-store",
    });
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 404 || status === 403) return null;
    throw err;
  }
}

/**
 * FLECHAS entre cotizaciones (`GET /v1/quotes/:id/vecinos`, 24-sep-2026): la
 * anterior y la siguiente EN EL TIEMPO con los MISMOS filtros de la lista
 * (`estado`, `cliente_id`, `q`, `grupo_id`, ya validados con
 * `filtrosListaDeParams`).
 *
 * `null` en SILENCIO ante 404 (API anterior: la ruta no existe) y 403 (rol
 * sin acceso): recargar no lo arregla y las flechas simplemente no se pintan.
 * Cualquier otro fallo LANZA: quien la llama la envuelve en
 * `degradado.opcional` para AVISAR — jamás se pinta «no hay siguiente» por una
 * lectura que falló.
 */
export async function getQuoteVecinos(
  id: string,
  filtros: FiltrosListaCotizaciones,
): Promise<QuoteVecinos | null> {
  try {
    return await apiServer<QuoteVecinos>(`/v1/quotes/${id}/vecinos`, {
      searchParams: { ...filtros },
      cache: "no-store",
    });
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 404 || status === 403) return null;
    throw err;
  }
}
