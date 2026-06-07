export type MultaEstado = "PENDIENTE" | "PAGADA" | "CANCELADA";

export interface Multa {
  id: string;
  aeronave_id: string | null;
  piloto_id: string | null;
  fecha: string;
  monto: string | null;
  moneda: string;
  autoridad: string | null;
  descripcion: string;
  estado: MultaEstado;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  aeronave?: { matricula: string } | null;
  piloto?: { nombre: string } | null;
}

export interface MultasResponse {
  data: Multa[];
  count: number;
  limit: number;
  offset: number;
}
