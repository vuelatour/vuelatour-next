/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» entre cotizaciones (24-sep-2026).
 * Espejo 1:1 de `GET /v1/quotes/:id/vecinos` (API: `QuoteVecinosRespuesta`
 * en `modules/quotes/dto/list-quotes.query.ts`).
 */
import type { EstadoVuelo } from "@/types/quotes-persisted";

/** Una cotización vecina: la anterior o la siguiente EN EL TIEMPO. */
export interface QuoteVecino {
  id: string;
  folio: number;
  /** timestamptz del vuelo (sin fecha no hay vecino, así que nunca es null). */
  fecha_vuelo: string;
  estado: EstadoVuelo;
  /** null = el API no lo resolvió (nunca se inventa un nombre). */
  cliente_nombre: string | null;
}

export interface QuoteVecinos {
  anterior: QuoteVecino | null;
  siguiente: QuoteVecino | null;
  /** La cotización actual no tiene fecha de vuelo: no hay orden cronológico. */
  sin_fecha: boolean;
}
