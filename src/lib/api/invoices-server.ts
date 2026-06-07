import { apiServer } from "./server";
import type {
  FacturaListResponse,
  PendingResponse,
  RecibidasResponse,
} from "@/types/invoices";

export function listPendingInvoices(query: {
  desde?: string;
  hasta?: string;
  cliente_id?: string;
} = {}) {
  return apiServer<PendingResponse>("/v1/invoices/pending", {
    searchParams: { ...query, limit: 200 },
    cache: "no-store",
  });
}

export function listFacturas(query: { estado?: string; emisora_id?: string } = {}) {
  return apiServer<FacturaListResponse>("/v1/invoices", {
    searchParams: { ...query, limit: 200 },
    cache: "no-store",
  });
}

export function signFacturaFiles(paths: string[]) {
  if (paths.length === 0) return Promise.resolve<Record<string, string>>({});
  return apiServer<Record<string, string>>("/v1/invoices/file-urls", {
    method: "POST",
    body: { paths },
    cache: "no-store",
  });
}

export function listRecibidas(query: { estado?: string } = {}) {
  return apiServer<RecibidasResponse>("/v1/invoices/recibidas", {
    searchParams: { ...query, limit: 300 },
    cache: "no-store",
  });
}
