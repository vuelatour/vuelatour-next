import { apiServer } from "./server";
import type { BankAccount, BankAccountListResponse } from "@/types/bank-accounts";

export interface ListBankAccountsQuery {
  q?: string;
  moneda?: string;
  razon_social?: string;
  activa?: boolean;
  limit?: number;
  offset?: number;
}

export function listBankAccounts(query: ListBankAccountsQuery = {}) {
  return apiServer<BankAccountListResponse>("/v1/bank-accounts", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getBankAccount(id: string) {
  return apiServer<BankAccount>(`/v1/bank-accounts/${id}`, { cache: "no-store" });
}
