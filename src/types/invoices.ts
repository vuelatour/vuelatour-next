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
  created_at: string;
  vuelo: { folio: number; origen_iata: string; destino_iata: string } | null;
  emisora: { codigo: string; razon_social: string } | null;
}

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
