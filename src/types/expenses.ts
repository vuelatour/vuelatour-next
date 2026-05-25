export interface Gasto {
  id: string;
  vuelo_id: string | null;
  aeronave_id: string | null;
  usuario_captura_id: string | null;
  categoria: string;
  monto: string;
  moneda: "MXN" | "USD";
  fecha_gasto: string | null;
  medio_pago: string;
  foto_url: string | null;
  notas: string | null;
  created_at: string;
}

export interface GastoListResponse {
  data: Gasto[];
  count: number;
  limit: number;
  offset: number;
}
