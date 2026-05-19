import { apiServer } from "./server";
import type {
  CashFund,
  CashFundListResponse,
  FundMovementListResponse,
} from "@/types/cash-funds";

export interface ListCashFundsQuery {
  usuario_id?: string;
  tipo?: string;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listCashFunds(query: ListCashFundsQuery = {}) {
  return apiServer<CashFundListResponse>("/v1/cash-funds", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getCashFund(id: string) {
  return apiServer<CashFund>(`/v1/cash-funds/${id}`, { cache: "no-store" });
}

export interface ListFundMovementsQuery {
  fondo_id?: string;
  tipo?: string;
  estado?: string;
  limit?: number;
  offset?: number;
}

export function listFundMovements(query: ListFundMovementsQuery = {}) {
  return apiServer<FundMovementListResponse>("/v1/fund-movements", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}
