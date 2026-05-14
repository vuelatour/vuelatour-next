import type { ListResponse } from "./aircraft";

export interface IssuingEntity {
  id: string;
  codigo: string;
  razon_social: string;
  rfc: string | null;
  regimen_fiscal_sat: string | null;
  codigo_postal: string | null;
  direccion: string | null;
  email_facturacion: string | null;
  telefono: string | null;
  pac_proveedor: string | null;
  notas: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export type IssuingEntityListResponse = ListResponse<IssuingEntity>;
