import type { ListResponse } from "./aircraft";

export type CanalCliente = "WHATSAPP" | "EMAIL" | "LANDING" | "LLAMADA" | "REFERIDO";

export interface Client {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  razon_social_default: string | null;
  rfc: string | null;
  canal_origen: CanalCliente | null;
  es_broker: boolean;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type ClientListResponse = ListResponse<Client>;
