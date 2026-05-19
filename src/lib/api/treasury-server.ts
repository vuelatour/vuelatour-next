import { apiServer } from "./server";
import type {
  BankMovement,
  BankMovementListResponse,
  TreasuryDashboard,
} from "@/types/treasury";

export function getTreasuryDashboard() {
  return apiServer<TreasuryDashboard>("/v1/treasury/dashboard", {
    cache: "no-store",
  });
}

export interface ListBankMovementsQuery {
  cuenta_bancaria_id?: string;
  tipo?: string;
  conciliado?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listBankMovements(query: ListBankMovementsQuery = {}) {
  return apiServer<BankMovementListResponse>("/v1/bank-movements", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getBankMovement(id: string) {
  return apiServer<BankMovement>(`/v1/bank-movements/${id}`, { cache: "no-store" });
}
