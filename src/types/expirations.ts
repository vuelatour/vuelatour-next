import type { ListResponse } from "./aircraft";

export type AmbitoDocumento = "AERONAVE" | "PILOTO" | "MOTOR";
export type FormaVencimiento = "FECHA" | "HORAS" | "PERMANENTE";
export type EstadoVencimiento =
  | "VIGENTE"
  | "PROXIMO"
  | "VENCIDO"
  | "PERMANENTE"
  | "INDETERMINADO";

export interface DocumentType {
  id: string;
  nombre: string;
  ambito: AmbitoDocumento;
  forma_default: FormaVencimiento;
  umbral_alerta_dias: number;
  es_critico: boolean;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type DocumentTypeListResponse = ListResponse<DocumentType>;

export interface Expiration {
  id: string;
  tipo_documento_id: string;
  aeronave_id: string | null;
  piloto_id: string | null;
  motor_id: string | null;
  vence_por: FormaVencimiento;
  fecha_vencimiento: string | null;
  horas_limite: string | null;
  umbral_alerta_dias: number | null;
  referencia: string | null;
  archivo_url: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  tipo: { nombre: string; ambito: AmbitoDocumento; es_critico: boolean } | null;
  estado: EstadoVencimiento;
  dias_restantes: number | null;
  horas_restantes: number | null;
}

export type ExpirationListResponse = ListResponse<Expiration>;
