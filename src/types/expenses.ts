export interface Gasto {
  id: string;
  vuelo_id: string | null;
  aeronave_id: string | null;
  usuario_captura_id: string | null;
  categoria: string;
  monto: string;
  moneda: "MXN" | "USD";
  tc_gasto: string | null;
  fecha_gasto: string | null;
  proveedor_id: string | null;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  estatus_comprobante: string;
  foto_url: string | null;
  conciliado: boolean;
  duplicado_sospechado: boolean;
  notas: string | null;
  created_at: string;
  proveedor?: { nombre: string } | null;
  aeronave?: { matricula: string } | null;
  captura?: { nombre: string } | null;
}

export interface GastoListResponse {
  data: Gasto[];
  count: number;
  limit: number;
  offset: number;
}
