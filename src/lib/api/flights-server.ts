import { apiServer } from "./server";
import { TOPE_IDS_BATCH, lotesDeIds } from "@/lib/admin/lotes";
import type {
  FlightListItem,
  FlightListResponse,
  FlightSnapshot,
  TacoPhoto,
} from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import type { MovimientoGastoHistorial } from "@/lib/admin/gasto-historial";

export type { MovimientoGastoHistorial };

export interface ListFlightsQuery {
  cliente_id?: string;
  aeronave_id?: string;
  piloto_id?: string;
  estado?: EstadoVuelo;
  es_externo?: boolean;
  /** Estado de cobro: COBRADO · POR_COBRAR · PARCIAL · SIN_COBROS. */
  cobro?: string;
  desde?: string;
  hasta?: string;
  /** Solo los hijos de una cotización de GRUPO (vuelo.grupo_id). */
  grupo_id?: string;
  limit?: number;
  offset?: number;
}

export function listFlights(query: ListFlightsQuery = {}) {
  return apiServer<FlightListResponse>("/v1/flights", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * TODOS los vuelos del filtro, SIN cap: pagina con offset hasta cubrir
 * `count` (patrón anti-cap-200, igual que `listFuelLoads`). Prod ya rebasó
 * los 200 vuelos y el corte silencioso hacía parecer "no guardado" un vuelo
 * que sí existía (auditoría 29-ago).
 */
export async function listFlightsAll(
  query: Omit<ListFlightsQuery, "limit" | "offset"> = {},
) {
  const limit = 200;
  const first = await listFlights({ ...query, limit, offset: 0 });
  const data = [...first.data];
  while (data.length < first.count) {
    const page = await listFlights({ ...query, limit, offset: data.length });
    if (page.data.length === 0) break; // defensa anti-bucle si count cambió
    data.push(...page.data);
  }
  return { data, count: first.count };
}

export function getFlight(id: string) {
  return apiServer<FlightListItem>(`/v1/flights/${id}`, { cache: "no-store" });
}

export function getFlightSnapshot(id: string) {
  return apiServer<FlightSnapshot>(`/v1/flights/${id}/snapshot`, {
    cache: "no-store",
  });
}

export function getFlightTacoPhotos(id: string) {
  return apiServer<TacoPhoto[]>(`/v1/flights/${id}/taco-photos`, {
    cache: "no-store",
  });
}

export interface VueloAnterior {
  id: string;
  folio: number;
  ruta: string;
  fecha_vuelo: string | null;
  estado: string;
}

/** Vuelo anterior del mismo avión (auditar la cadena de tacómetros). */
export function getVueloAnterior(id: string) {
  return apiServer<{ anterior: VueloAnterior | null }>(
    `/v1/flights/${id}/anterior`,
    { cache: "no-store" },
  );
}

export interface BitacoraEvento {
  id: string;
  tipo: "recordatorio_taco" | "taco_capturado";
  titulo: string;
  cuerpo: string | null;
  umbral: number | null;
  destinatario: string | null;
  destinatario_rol: string | null;
  created_at: string;
}

/** Bitácora: recordatorios de tacómetro enviados + capturas registradas. */
export function getFlightBitacora(id: string) {
  return apiServer<BitacoraEvento[]>(`/v1/flights/${id}/bitacora`, {
    cache: "no-store",
  }).catch(() => [] as BitacoraEvento[]);
}

export interface GastoHistorialEvento {
  gasto_id: string;
  accion: "INSERT" | "UPDATE" | "DELETE";
  actor_nombre: string | null;
  created_at: string;
  /** true = evento reconstruido de un gasto capturado ANTES de existir la bitácora. */
  sintetizado?: boolean;
  /** Columnas de negocio que cambiaron: { col: { antes, despues } }. */
  diff: Record<string, { antes: unknown; despues: unknown }>;
  descripcion_gasto: string | null;
  /**
   * ADITIVO (14-sep-2026): el UPDATE cambió el `vuelo_id` del gasto —
   * `salio` en el vuelo de ORIGEN (folio del destino) y `llego` en el vuelo
   * DESTINO (folio del origen). null/ausente en todo lo demás y con un API
   * sin desplegar (la card se comporta como hoy).
   */
  movimiento?: MovimientoGastoHistorial | null;
}

/**
 * Historial de gastos del vuelo (gasto_bitacora, escrita por trigger de BD).
 * Best-effort OBLIGATORIO: con skew de deploy (panel nuevo + API viejo) el
 * endpoint no existe aún y el detalle del vuelo NO debe caerse — la card
 * simplemente no se pinta.
 */
export function getFlightGastosHistorial(id: string) {
  return apiServer<GastoHistorialEvento[]>(`/v1/flights/${id}/gastos-historial`, {
    cache: "no-store",
  }).catch(() => [] as GastoHistorialEvento[]);
}

/**
 * URL firmada (1 h) de la foto del plan de vuelo (bucket privado
 * planes-vuelo). El backend resuelve tanto paths como URLs viejas completas.
 */
export function getFlightPlanUrl(id: string) {
  return apiServer<{ url: string | null }>(`/v1/flights/${id}/plan-vuelo-url`, {
    cache: "no-store",
  });
}

/** Firma URLs de vouchers de cobro (bucket privado) para el detalle del vuelo. */
export function getCobroVoucherUrls(paths: string[]) {
  if (paths.length === 0) return Promise.resolve<Record<string, string>>({});
  return apiServer<Record<string, string>>("/v1/flights/cobro-voucher-urls", {
    method: "POST",
    body: { paths },
    cache: "no-store",
  });
}

/** Total cobrado USD por vuelo, en lote (semáforo de cobro de las listas). */
export function getCobroStatus(ids: string[]) {
  if (ids.length === 0)
    return Promise.resolve<
      Record<string, { total_cobrado: number; sin_tc_count: number }>
    >({});
  return apiServer<
    Record<string, { total_cobrado: number; sin_tc_count: number }>
  >("/v1/flights/cobro-status", {
    method: "POST",
    body: { ids },
    cache: "no-store",
  });
}

/** Marca, por vuelo, si el tacómetro está incompleto (badge en la lista admin). */
export function getTacoStatus(ids: string[]) {
  if (ids.length === 0) return Promise.resolve<Record<string, { falta: boolean }>>({});
  return apiServer<Record<string, { falta: boolean }>>("/v1/flights/taco-status", {
    method: "POST",
    body: { ids },
    cache: "no-store",
  });
}

/**
 * Resultado de un batch partido en lotes: lo que SÍ se pudo consultar y los
 * ids que quedaron sin verificar (su lote falló). Nunca se mezclan: un id sin
 * verificar NO es un id con valor 0 — decir «sin cobros» de un vuelo que no se
 * consultó sería mentir sobre dinero.
 */
export interface StatusPorLotes<T> {
  status: Record<string, T>;
  idsSinVerificar: string[];
}

async function statusPorLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => Promise<Record<string, T>>,
): Promise<StatusPorLotes<T>> {
  const status: Record<string, T> = {};
  const idsSinVerificar: string[] = [];
  const lotes = lotesDeIds(ids, TOPE_IDS_BATCH);
  const resultados = await Promise.all(
    lotes.map((lote) =>
      consulta(lote).then(
        (r) => ({ lote, r }),
        (e: unknown) => {
          console.error("[admin] lote de status falló", e);
          return { lote, r: null };
        },
      ),
    ),
  );
  for (const { lote, r } of resultados) {
    if (r === null) idsSinVerificar.push(...lote);
    else Object.assign(status, r);
  }
  return { status, idsSinVerificar };
}

/**
 * `cobro-status` PARTIDO en lotes de ≤200 (tope del DTO del API, ver
 * `lib/admin/lotes.ts`). Antes se mandaban todos los ids de golpe: con 218
 * vuelos el API respondía 400 y el `.catch` de la página lo tragaba en
 * silencio (21-sep-2026).
 */
export function getCobroStatusPorLotes(ids: string[]) {
  return statusPorLotes(ids, getCobroStatus);
}

/** `taco-status` partido en lotes de ≤200 (mismo tope y mismo motivo). */
export function getTacoStatusPorLotes(ids: string[]) {
  return statusPorLotes(ids, getTacoStatus);
}
