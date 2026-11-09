import { apiServer } from "./server";
import { esErrorDeNext } from "./degradar";
import type {
  CargaCorreos,
  CargaCorreosDeVuelo,
  CargaCorreosEnviados,
  CorreoCliente,
  CorreosDeVueloResponse,
  CorreosEnviadosResponse,
  VistaPreviaCorreoConfirmacion,
} from "@/types/correos-cliente";
import type { CotizacionInterna } from "@/types/quotes-interno";
import {
  esApiSinRangoFechas,
  hayRangoLista,
  sinRango,
  type FiltrosListaCotizaciones,
} from "@/lib/admin/quote-navegacion";
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
  /**
   * Día Cancún `YYYY-MM-DD` sobre `fecha_vuelo` (API ≥ el que agrega
   * `desde`/`hasta`, 13-oct-2026); con rango, las cotizaciones SIN fecha de
   * vuelo quedan fuera. Solo viajan cuando existen (`buildUrl` omite
   * `undefined`): un API previo nunca los ve si no hay rango.
   */
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listQuotes(query: ListQuotesQuery = {}) {
  return apiServer<PersistedQuoteListResponse>("/v1/quotes", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

type ConsultaListaCompleta = Omit<ListQuotesQuery, "limit" | "offset">;

/**
 * TODAS las cotizaciones del filtro, SIN cap: pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200, igual que `listFuelLoads`). Con el corte en
 * 200, una cotización recién creada podía "desaparecer" de la lista
 * (auditoría 29-ago: 'ya lo había guardado y no está').
 */
async function listarTodas(query: ConsultaListaCompleta) {
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

/**
 * La lista completa (ver `listarTodas`) y, desde el 13-oct-2026, el rango de
 * fechas: si el API todavía no conoce `desde`/`hasta` (400 «property desde
 * should not exist», `esApiSinRangoFechas`) y la consulta traía rango, se
 * vuelve a leer SIN el rango y se devuelve `rangoIgnorado: true` para que la
 * página lo DIGA (banner ámbar) en vez de la pantalla rota o un «Sin
 * cotizaciones» falso. Es un GET deliberado con OTROS parámetros, no el
 * reintento automático de `apiFetch` (prohibido en 4xx). Un 400 de otro
 * campo o un 502 siguen subiendo al boundary, como siempre.
 */
export async function listQuotesAll(
  query: ConsultaListaCompleta = {},
): Promise<{ data: PersistedQuote[]; count: number; rangoIgnorado: boolean }> {
  try {
    const r = await listarTodas(query);
    return { ...r, rangoIgnorado: false };
  } catch (err) {
    if (hayRangoLista(query) && esApiSinRangoFechas(err)) {
      const r = await listarTodas(sinRango(query));
      return { ...r, rangoIgnorado: true };
    }
    throw err;
  }
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
 * (`estado`, `cliente_id`, `q`, `grupo_id` y, desde el 13-oct-2026,
 * `desde`/`hasta`, ya validados con `filtrosListaDeParams`).
 *
 * `null` en SILENCIO ante 404 (API anterior: la ruta no existe) y 403 (rol
 * sin acceso): recargar no lo arregla y las flechas simplemente no se pintan.
 * Si el API previo rechaza el RANGO (400 «property desde should not exist»)
 * se vuelve a pedir SIN él: así las flechas recorren la MISMA lista degradada
 * que la página enseña. Cualquier otro fallo LANZA: quien la llama la
 * envuelve en `degradado.opcional` para AVISAR — jamás se pinta «no hay
 * siguiente» por una lectura que falló.
 */
export async function getQuoteVecinos(
  id: string,
  filtros: FiltrosListaCotizaciones,
): Promise<QuoteVecinos | null> {
  const pedir = (f: Omit<FiltrosListaCotizaciones, "desde" | "hasta">) =>
    apiServer<QuoteVecinos>(`/v1/quotes/${id}/vecinos`, {
      searchParams: { ...f },
      cache: "no-store",
    });
  try {
    return await pedir(filtros);
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 404 || status === 403) return null;
    if (hayRangoLista(filtros) && esApiSinRangoFechas(err)) return pedir(sinRango(filtros));
    throw err;
  }
}

// =============================================================================
// Correos al cliente (9-nov-2026, API 0.0.133)
// =============================================================================

/** Solo filas con forma de correo: una respuesta rara no rompe la pantalla. */
function soloCorreos(valor: unknown): CorreoCliente[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (c): c is CorreoCliente =>
      !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string",
  );
}

/**
 * Lectura de correos SIN mentir (ver `CargaCorreos`): jamás se devuelve una
 * lista vacía cuando la lectura falló, porque la pantalla diría «no se le ha
 * enviado ningún correo al cliente» de un vuelo al que sí se le envió.
 * `estadosSinRuta` = los HTTP que significan «el API aún no tiene la ruta».
 */
async function leerCorreos<T>(
  etiqueta: string,
  lectura: () => Promise<T>,
  estadosSinRuta: readonly number[],
): Promise<CargaCorreos<T>> {
  try {
    return { estado: "ok", datos: await lectura() };
  } catch (err) {
    if (esErrorDeNext(err)) throw err;
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 401 || status === 403) return { estado: "sin-acceso" };
    if (typeof status === "number" && estadosSinRuta.includes(status)) {
      return { estado: "no-disponible" };
    }
    console.error(`[admin] no se pudieron cargar ${etiqueta}`, err);
    return { estado: "error" };
  }
}

/**
 * Historial de correos de UN vuelo/cotización (`GET /v1/quotes/:id/correos`,
 * más reciente primero). Roles: ADMIN, COORDINADOR, FACTURACION, ANALISTA.
 * Nunca lanza: 404 = API sin desplegar (`no-disponible`).
 */
export function getQuoteCorreos(id: string): Promise<CargaCorreosDeVuelo> {
  return leerCorreos(
    "los correos enviados al cliente",
    async () => {
      const r = await apiServer<CorreosDeVueloResponse>(`/v1/quotes/${id}/correos`, {
        cache: "no-store",
      });
      return soloCorreos(r?.correos);
    },
    [404],
  );
}

/**
 * Vista previa de la confirmación (`GET /v1/quotes/:id/correo-confirmacion`):
 * lo que se MANDARÍA; no envía nada. LANZA si falla: la consume una server
 * action que devuelve el error clasificado.
 */
export function getCorreoConfirmacionPreview(id: string) {
  return apiServer<VistaPreviaCorreoConfirmacion>(`/v1/quotes/${id}/correo-confirmacion`, {
    cache: "no-store",
  });
}

/**
 * TODOS los correos enviados a clientes (`GET /v1/quotes/correos`). El API
 * rechaza parámetros desconocidos (400, `forbidNonWhitelisted`): viajan SOLO
 * `desde`, `hasta` (días `AAAA-MM-DD` ya validados) y `limite`.
 *
 * `no-disponible` cubre 404 **y 400**: un API anterior al 0.0.133 no tiene
 * esta ruta y lee «correos» como el id de `GET /v1/quotes/:id` ⇒ responde
 * 400 «uuid inválido», no 404. Como aquí solo viajan valores validados, un
 * 400 no puede ser culpa de un filtro del operador.
 */
export function listCorreosClientes(query: {
  desde?: string;
  hasta?: string;
  limite: number;
}): Promise<CargaCorreosEnviados> {
  return leerCorreos(
    "los correos enviados a clientes",
    async () => {
      const r = await apiServer<CorreosEnviadosResponse>("/v1/quotes/correos", {
        searchParams: { desde: query.desde, hasta: query.hasta, limite: query.limite },
        cache: "no-store",
      });
      return {
        correos: soloCorreos(r?.correos),
        truncado: r?.truncado === true,
        desde: typeof r?.desde === "string" ? r.desde : "",
        hasta: typeof r?.hasta === "string" ? r.hasta : "",
      };
    },
    [404, 400],
  );
}
