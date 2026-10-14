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
  /**
   * Pseudo-cliente de operación propia (reposicionamiento, demostración,
   * servicio): sus cotizaciones pueden ir en $0 — sin hora mínima ni cobro
   * esperado. Opcional defensivo: el API puede no traerlo aún.
   */
  es_interno?: boolean;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Alias para el ID de sus vuelos («diego» ⇒ diego01-131026; 13-oct-2026,
   * API 0.0.75): a-z de 1 a 24, NO único, editable en Clientes. Ausente =
   * API previo o migración sin aplicar (el panel no ofrece el campo); cuando
   * viene, nunca es null (la BD pone el sugerido).
   */
  alias?: string;
  /**
   * Nombres de OTROS clientes con el mismo alias (activos o no, orden es-MX,
   * máximo 5; lo decide el API sobre TODO el catálogo). [] = nadie más;
   * null = no se pudo saber (sin badge); ausente = API previo.
   */
  alias_compartido_con?: string[] | null;
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

/**
 * GET /v1/clients. `alias_disponible` (13-oct-2026, API 0.0.75): true solo
 * con la migración del ID por cliente aplicada — el alta ofrece el campo
 * «Alias» solo entonces; ausente = API previo (no se ofrece y así no hay 400
 * por `forbidNonWhitelisted`).
 */
export type ClientListResponse = ListResponse<Client> & { alias_disponible?: boolean };
