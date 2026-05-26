import { apiServer } from "./server";
import type { DocumentType, DocumentTypeListResponse } from "@/types/expirations";

export interface ListDocumentTypesQuery {
  q?: string;
  ambito?: string;
  activo?: boolean;
  limit?: number;
  offset?: number;
}

export function listDocumentTypes(query: ListDocumentTypesQuery = {}) {
  return apiServer<DocumentTypeListResponse>("/v1/document-types", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

export function getDocumentType(id: string) {
  return apiServer<DocumentType>(`/v1/document-types/${id}`, { cache: "no-store" });
}
