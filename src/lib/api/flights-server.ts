import { apiServer } from "./server";
import type {
  FlightListItem,
  FlightListResponse,
  FlightSnapshot,
  TacoPhoto,
} from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";

export interface ListFlightsQuery {
  cliente_id?: string;
  aeronave_id?: string;
  piloto_id?: string;
  estado?: EstadoVuelo;
  es_externo?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listFlights(query: ListFlightsQuery = {}) {
  return apiServer<FlightListResponse>("/v1/flights", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
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

/** Firma URLs de vouchers de cobro (bucket privado) para el detalle del vuelo. */
export function getCobroVoucherUrls(paths: string[]) {
  if (paths.length === 0) return Promise.resolve<Record<string, string>>({});
  return apiServer<Record<string, string>>("/v1/flights/cobro-voucher-urls", {
    method: "POST",
    body: { paths },
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
