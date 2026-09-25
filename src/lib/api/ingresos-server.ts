import { apiServer } from "./server";
import type {
  AbonosPendientesRespuesta,
  EntradaDinero,
  Ingreso,
  IngresoDetalle,
  ListaEntradas,
  ListaIngresos,
  ResumenIngresos,
} from "@/types/ingresos";
import type { VueloCandidatoIngreso } from "@/lib/admin/ingresos-ui";

/**
 * INGRESOS (24-sep-2026) — lecturas del SERVER (con el JWT de la sesión).
 * Las escrituras con archivo van del NAVEGADOR directo al API
 * (`ingresos-browser.ts`, tope de 4.5 MB de Vercel); las demás son server
 * actions (`app/admin/ingresos/actions.ts`).
 *
 * Sin la migración `20260924000004` el API responde 503
 * `INGRESOS_NO_DISPONIBLE`: quien llama decide (la página pinta una tarjeta
 * ámbar, nunca la pantalla rota).
 */

type Query = Record<string, string | number | undefined>;

export function getResumenIngresos(q: { desde?: string; hasta?: string }) {
  return apiServer<ResumenIngresos>("/v1/ingresos/resumen", {
    searchParams: q,
    cache: "no-store",
  });
}

export function listEntradas(q: Query) {
  return apiServer<ListaEntradas>("/v1/ingresos/entradas", { searchParams: q, cache: "no-store" });
}

export function listIngresos(q: Query) {
  return apiServer<ListaIngresos>("/v1/ingresos", { searchParams: q, cache: "no-store" });
}

export function getIngreso(id: string) {
  return apiServer<IngresoDetalle>(`/v1/ingresos/${id}`, { cache: "no-store" });
}

export function listAbonosPendientes(q: Query) {
  return apiServer<AbonosPendientesRespuesta>("/v1/conciliacion/abonos-pendientes", {
    searchParams: q,
    cache: "no-store",
  });
}

export function vuelosCandidatos(q: { cliente_id?: string; q?: string; alcance?: "cliente" | "todos" }) {
  return apiServer<{ data: VueloCandidatoIngreso[] }>("/v1/ingresos/vuelos-candidatos", {
    searchParams: q,
    cache: "no-store",
  });
}

/** Tope del API: `limit` 1..200 por página. */
const LIMITE_PAGINA = 200;
/** 25 × 200 = 5,000: el universo máximo del periodo (más ⇒ 400 PERIODO_MUY_GRANDE). */
const MAX_PAGINAS = 25;

export interface ListaCompleta<T> {
  data: T[];
  total: number;
  /** El total cambió a media carga o se llegó al tope: la tabla lo avisa. */
  huboCorte: boolean;
}

/**
 * TODAS las filas del filtro (patrón anti-cap): pagina con `limit=200` hasta
 * cubrir `total`. Una lista de dinero cortada en silencio parece «no está».
 */
async function todas<T>(
  leer: (q: Query) => Promise<{ data: T[]; total: number }>,
  q: Query,
): Promise<ListaCompleta<T>> {
  const data: T[] = [];
  let total = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await leer({ ...q, limit: LIMITE_PAGINA, offset: pagina * LIMITE_PAGINA });
    total = r.total;
    data.push(...r.data);
    if (r.data.length < LIMITE_PAGINA || data.length >= total) break;
  }
  return { data, total, huboCorte: data.length < total };
}

export function listEntradasAll(q: Query): Promise<ListaCompleta<EntradaDinero>> {
  return todas(listEntradas, q);
}

export function listIngresosAll(q: Query): Promise<ListaCompleta<Ingreso>> {
  return todas(listIngresos, q);
}
