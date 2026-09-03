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
  /**
   * Solo tipo_evento "evento" (3-sep-2026): dispositivos push registrados
   * del responsable. 0 = no tiene la app con avisos (oficina debe avisarle
   * por otro medio); null = sin responsable; ausente = API viejo.
   */
  responsable_push_dispositivos?: number | null;
}

export interface CalendarResponse {
  from: string;
  to: string;
  count: number;
  events: CalendarEvent[];
}

/**
 * Resultado de entrega del aviso al responsable de un evento NO-vuelo
 * (POST/PATCH /v1/calendar/eventos, 3-sep-2026). null = sin responsable o el
 * creador es el propio responsable (no se auto-avisa). Ausente = API viejo.
 */
export interface EventoAviso {
  responsable_id: string;
  nombre: string;
  /** La notificación quedó persistida (la app la ve al abrir). */
  notificado: boolean;
  /** Dispositivos con token push del responsable; 0 = el push NO llegará. */
  push_dispositivos: number;
  plataformas: string[];
}

/** Fila de evento_flota tal como la devuelven POST/PATCH /v1/calendar/eventos. */
export interface EventoFlotaResponse {
  id: string;
  titulo?: string;
  fecha?: string;
  fecha_fin?: string | null;
  aeronave_id?: string | null;
  responsable_id?: string | null;
  notas?: string | null;
  aviso?: EventoAviso | null;
}

/** Payload de alta (POST). En PATCH todos los campos son opcionales y
 *  `null` limpia el valor (fin, avión, responsable, notas). */
export interface EventoFlotaInput {
  titulo: string;
  /** ISO (instante). */
  fecha: string;
  fecha_fin?: string | null;
  aeronave_id?: string | null;
  responsable_id?: string | null;
  notas?: string | null;
}

export type EventoFlotaPatch = Partial<EventoFlotaInput>;

/**
 * Evento NO-vuelo visto desde su responsable (GET /v1/me/eventos y
 * `eventos_proximos` del expediente del piloto): UNA fila por evento, sin
 * expandir por día.
 */
export interface EventoMe {
  id: string;
  titulo: string;
  /** ISO (instante). */
  fecha: string;
  fecha_fin: string | null;
  aeronave_id: string | null;
  aeronave_matricula: string | null;
  aeronave_color: string | null;
  notas: string | null;
  responsable_id: string;
  creado_por_nombre: string | null;
  created_at: string;
  updated_at: string;
}
