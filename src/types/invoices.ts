export interface PendingFlight {
  id: string;
  folio: number;
  cliente_id: string;
  origen_iata: string;
  destino_iata: string;
  monto_total_usd: string;
  monto_total_mxn: string | null;
  fecha_vuelo: string | null;
  cliente: { nombre: string; rfc: string | null } | { nombre: string; rfc: string | null }[] | null;
}

export interface Factura {
  id: string;
  vuelo_id: string;
  estado: string;
  uuid_fiscal: string | null;
  total: string;
  moneda: string;
  fel_referencia: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  fecha_timbrado: string | null;
  error_mensaje: string | null;
  tipo_comprobante: string | null;
  factura_relacionada_id: string | null;
  facturado_a_rfc: string | null;
  facturado_a_nombre: string | null;
  motivo_cancelacion: string | null;
  cancelada_at: string | null;
  created_at: string;
  vuelo: { folio: number; origen_iata: string; destino_iata: string } | null;
  emisora: { codigo: string; razon_social: string } | null;
}

/** Receptor alterno opcional (caso 9.7 "SE FACTURÓ A"). */
export interface FacturadoA {
  facturado_a_rfc?: string;
  facturado_a_nombre?: string;
  facturado_a_regimen?: string;
  facturado_a_cp?: string;
  facturado_a_uso_cfdi?: string;
}

/** Motivos de cancelación SAT 4.0. */
export const MOTIVOS_CANCELACION = [
  { value: "01", label: "01 — Comprobante con errores con relación" },
  { value: "02", label: "02 — Comprobante con errores sin relación" },
  { value: "03", label: "03 — No se llevó a cabo la operación" },
  { value: "04", label: "04 — Operación nominativa relacionada en factura global" },
] as const;

export interface PendingResponse {
  data: PendingFlight[];
  count: number;
  limit: number;
  offset: number;
}

export interface FacturaListResponse {
  data: Factura[];
  count: number;
  limit: number;
  offset: number;
}
