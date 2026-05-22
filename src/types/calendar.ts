export interface CalendarEvent {
  id: string;
  folio: number;
  fecha_vuelo: string | null;
  hora: string | null;
  estado: string;
  estado_permiso: "no_aplica" | "pendiente" | "emitido" | null;
  es_externo: boolean;
  title: string;
  color: string;
  cliente_id: string;
  cliente_nombre: string | null;
  aeronave_id: string | null;
  aeronave_matricula: string | null;
  operador_externo: string | null;
  piloto_id: string | null;
  piloto_nombre: string | null;
  origen_iata: string;
  destino_iata: string;
  pasajeros: number;
  monto_total_usd: number;
  google_calendar_id: string | null;
}

export interface CalendarResponse {
  from: string;
  to: string;
  count: number;
  events: CalendarEvent[];
}
