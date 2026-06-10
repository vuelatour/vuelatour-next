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
  /** Detalle de cargas de combustible (categoria GAS). */
  litros: string | null;
  tipo_combustible: "TURBOSINA" | "AVGAS" | null;
  lugar: string | null;
  fecha_hora_carga: string | null;
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
