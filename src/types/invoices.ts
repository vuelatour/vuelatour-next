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

export interface FacturaRecibida {
  id: string;
  uuid_fiscal: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  tipo_comprobante: string | null;
  subtotal: string | null;
  total: string | null;
  moneda: string | null;
  fecha_emision: string | null;
  conceptos_resumen: string | null;
  xml_url: string | null;
  estado: "SIN_CLASIFICAR" | "CLASIFICADA" | "DESCARTADA";
  gasto_id: string | null;
  aeronave_id: string | null;
  categoria_sugerida: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  gasto?: { id: string; categoria: string; monto: string; moneda: string } | null;
  aeronave?: { matricula: string } | null;
  /** Gastos amparados por esta factura (amarre 1 factura → N gastos). */
  gastos?: Array<{
    id: string;
    categoria: string;
    monto: string;
    moneda: string;
    fecha_gasto: string | null;
    vuelo_id: string | null;
    lugar: string | null;
  }>;
}

export interface RecibidasResponse {
  data: FacturaRecibida[];
  count: number;
  limit: number;
  offset: number;
}
