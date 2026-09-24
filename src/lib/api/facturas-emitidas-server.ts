import { apiServer } from "./server";
import { queryDeFiltros, type FiltrosFacturas } from "@/lib/admin/facturas-emitidas";
import type {
  FacturaEmitida,
  ListaFacturasEmitidas,
  ListaPorFacturar,
  ResponsablesFacturacion,
} from "@/types/facturas-emitidas";

/**
 * FACTURAS EMITIDAS (registro manual, 24-sep-2026) — lecturas del server.
 * Las escrituras con archivo van del NAVEGADOR directo al API
 * (`facturas-emitidas-browser.ts`, tope de 4.5 MB de Vercel); las demás son
 * server actions (`app/admin/facturas-emitidas/actions.ts`).
 *
 * Sin la migración `20260924000003` el API responde 503
 * `FACTURAS_EMITIDAS_NO_DISPONIBLE`: quien llama decide (la página pinta una
 * tarjeta ámbar, nunca la pantalla rota).
 */

export type QueryFacturasEmitidas = Record<string, string | number | undefined>;

export function listFacturasEmitidas(query: QueryFacturasEmitidas = {}) {
  return apiServer<ListaFacturasEmitidas>("/v1/facturas-emitidas", {
    searchParams: query,
    cache: "no-store",
  });
}

/** Tope de páginas del anti-cap: 20 × 500 = 10,000 facturas (años de registro). */
const MAX_PAGINAS = 20;
const LIMITE_PAGINA = 500;

/**
 * TODAS las facturas del filtro (patrón anti-cap: pagina con `limit=500`
 * hasta cubrir `count`). `huboCorte` = el conteo cambió a media carga o se
 * llegó al tope: la tabla lo avisa en vez de «perder» una factura en silencio.
 */
export async function listFacturasEmitidasAll(
  filtros: FiltrosFacturas,
): Promise<ListaFacturasEmitidas & { huboCorte: boolean }> {
  const base = queryDeFiltros(filtros);
  const first = await listFacturasEmitidas({ ...base, limit: LIMITE_PAGINA, offset: 0 });
  const data = [...first.data];
  let paginas = 1;
  while (data.length < first.count && paginas < MAX_PAGINAS) {
    const page = await listFacturasEmitidas({
      ...base,
      limit: LIMITE_PAGINA,
      offset: data.length,
    });
    paginas += 1;
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { ...first, data, huboCorte: data.length < first.count };
}

export function getFacturaEmitida(id: string) {
  return apiServer<FacturaEmitida>(`/v1/facturas-emitidas/${id}`, { cache: "no-store" });
}

/** «Por facturar»: vuelos con solicitud y sin factura vigente registrada. */
export function getPorFacturar() {
  return apiServer<ListaPorFacturar>("/v1/facturas-emitidas/por-facturar", {
    cache: "no-store",
  });
}

/** Responsables de facturación (config del sistema). 503 sin la migración. */
export function getResponsablesFacturacion() {
  return apiServer<ResponsablesFacturacion>("/v1/config/responsables-facturacion", {
    cache: "no-store",
  });
}
