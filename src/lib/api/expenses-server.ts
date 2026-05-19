import { apiServer } from "./server";
import type { Expense, ExpenseListResponse } from "@/types/expenses";

export interface ListExpensesQuery {
  q?: string;
  aeronave_id?: string;
  vuelo_id?: string;
  proveedor_id?: string;
  categoria?: string;
  medio_pago?: string;
  estatus_comprobante?: string;
  sin_aeronave?: boolean;
  conciliado?: boolean;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export function listExpenses(query: ListExpensesQuery = {}) {
  return apiServer<ExpenseListResponse>("/v1/expenses", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getExpense(id: string) {
  return apiServer<Expense>(`/v1/expenses/${id}`, { cache: "no-store" });
}
