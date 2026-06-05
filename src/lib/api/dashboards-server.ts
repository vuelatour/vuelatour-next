import { apiServer } from "./server";
import type {
  DashboardGastos,
  DashboardHorasPiloto,
  DashboardOperativo,
  DashboardOverview,
  DashboardTarjetas,
} from "@/types/dashboards";

export interface PeriodoQuery {
  desde?: string;
  hasta?: string;
}

type SP = Record<string, string | number | boolean | undefined>;

export function getDashboardOverview(query: PeriodoQuery) {
  return apiServer<DashboardOverview>("/v1/dashboards/overview", {
    searchParams: query as SP,
    cache: "no-store",
  });
}

export function getDashboardOperativo(query: PeriodoQuery) {
  return apiServer<DashboardOperativo>("/v1/dashboards/operativo", {
    searchParams: query as SP,
    cache: "no-store",
  });
}

export function getDashboardGastos(query: PeriodoQuery) {
  return apiServer<DashboardGastos>("/v1/dashboards/gastos", {
    searchParams: query as SP,
    cache: "no-store",
  });
}

export function getDashboardTarjetas(query: PeriodoQuery) {
  return apiServer<DashboardTarjetas>("/v1/dashboards/tarjetas", {
    searchParams: query as SP,
    cache: "no-store",
  });
}

export function getDashboardHorasPiloto(query: PeriodoQuery) {
  return apiServer<DashboardHorasPiloto>("/v1/dashboards/horas-piloto", {
    searchParams: query as SP,
    cache: "no-store",
  });
}
