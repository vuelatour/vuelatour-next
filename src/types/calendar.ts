export interface CalendarEvent {
  id: string;
  /** "descanso" = descanso de piloto; "evento" = no-vuelo (lavado, trámite);
   *  "mantenimiento" = servicio con fecha (PROGRAMADO ámbar / EN_TALLER rojo). */
  tipo_evento?: "vuelo" | "descanso" | "evento" | "mantenimiento";
  /** Id del registro piloto_descanso (para quitarlo desde el calendario). */
  descanso_id?: string;
  /** Id del evento_flota (para quitarlo desde el calendario). */
  evento_id?: string;
  /** Id del mantenimiento (tipo_evento "mantenimiento"). */
  mantenimiento_id?: string;
  /** Título del evento NO-vuelo. */
  titulo?: string | null;
  notas?: string | null;
  /** Vuelo al que pertenece el evento (ida y regreso comparten vuelo_id). */
  vuelo_id?: string;
  /** Escala/tramo concreto del evento (para navegar al tramo). */
  escala_id?: string | null;
  folio: number | null;
  fecha_vuelo: string | null;
  hora: string | null;
  estado: string;
  /** Cancelado a nivel vuelo O el tramo del evento (historial en rojo). */
  cancelado?: boolean;
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
  /** "ida" o "regreso" (los redondos pintan dos eventos). */
  tramo?: "ida" | "regreso";
  /** Vuelo confirmado al que aún le falta avión o piloto. */
  sin_asignar?: boolean;
}

export interface CalendarResponse {
  from: string;
  to: string;
  count: number;
  events: CalendarEvent[];
}
