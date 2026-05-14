import type { ListResponse } from "./aircraft";

export type TipoProveedor = "NACIONAL" | "EXTRANJERO" | "GENERICO_LOCAL";

export interface Provider {
  id: string;
  nombre: string;
  rfc: string | null;
  tipo: TipoProveedor;
  pais: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  contacto: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type ProviderListResponse = ListResponse<Provider>;
