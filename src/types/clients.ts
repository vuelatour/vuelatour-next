import type { ListResponse } from "./aircraft";

export type CanalCliente = "WHATSAPP" | "EMAIL" | "LANDING" | "LLAMADA" | "REFERIDO";

/** RFC genérico del SAT para clientes extranjeros (residentes fuera de México). */
export const RFC_EXTRANJERO = "XEXX010101000";

export interface Client {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  razon_social_default: string | null;
  rfc: string | null;
  /** Código SAT de 3 dígitos (601, 612, 626, …). */
  regimen_fiscal_receptor: string | null;
  /** Uso CFDI (G03, S01, …). */
  uso_cfdi: string | null;
  /** CP del domicilio fiscal (5 dígitos) — el único dato de domicilio que usa el CFDI. */
  codigo_postal: string | null;
  /** Domicilio fiscal completo, solo de referencia. */
  domicilio_fiscal: string | null;
  /** País de residencia cuando es cliente extranjero (RFC genérico XEXX010101000). */
  pais_residencia: string | null;
  canal_origen: CanalCliente | null;
  es_broker: boolean;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * ¿El cliente tiene todo lo necesario para timbrar su CFDI?
 * Extranjero (RFC genérico): el API aplica régimen 616, uso S01 y CP de la
 * emisora en automático, así que solo necesita el RFC genérico.
 */
export function datosFiscalesCompletos(c: Client): boolean {
  if (c.rfc === RFC_EXTRANJERO) return true;
  return !!(c.rfc && c.regimen_fiscal_receptor && c.uso_cfdi && c.codigo_postal);
}

export type ClientListResponse = ListResponse<Client>;
