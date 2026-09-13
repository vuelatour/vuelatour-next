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

/**
 * Conteos de un backfill a Google Calendar (POST /v1/calendar/resync y
 * `ultimo_resumen` de GET /v1/calendar/sync-estado, 12-sep-2026). Todos los
 * campos son opcionales a propósito: un API viejo solo manda `total` (vuelos
 * redondos) y el panel debe tolerarlo sin inventar conteos por tipo.
 */
export interface CalendarResyncResumen {
  vuelos?: number;
  descansos?: number;
  eventos?: number;
  mantenimientos?: number;
  errores?: number;
  /** API viejo: total de vuelos re-sincronizados (sin desglose por tipo). */
  total?: number;
}

/**
 * Cola PERSISTENTE de cambios pendientes de subir a Google (`cola` de GET
 * /v1/calendar/sync-estado, 12-sep-2026). La alimentan triggers de la BD y la
 * drena un worker del API cada 20 s con reintentos y espera progresiva: es lo
 * que hace que la sincronización sea AUTOMÁTICA y no se pierda un cambio
 * aunque Google falle (incluidos los que la app sube al reconectar).
 *
 * `cola: null` (campo presente, valor nulo) = el API ya sabe de colas pero la
 * migración `20260912000002_calendar_sync_cola.sql` todavía NO está aplicada.
 * Campo AUSENTE (`undefined`) = API viejo que ni siquiera reporta la cola. No
 * son lo mismo y el chip los dice distinto.
 */
export interface CalendarSyncCola {
  /** La tabla y los triggers existen en la BD (sonda del API). */
  activa: boolean;
  /** Cambios encolados que todavía no llegaron a Google. */
  pendientes: number;
  /** De esos, cuántos ya fallaron al menos una vez. */
  con_error: number;
  /** Alta del más antiguo que sigue en espera (ISO). */
  mas_antiguo_at: string | null;
  /** Última vez que el worker vació/drenó la cola (ISO). */
  ultimo_drenado_at: string | null;
  /** Pausa por cuota/límite de Google: hasta cuándo (ISO); null = no hay. */
  pausada_hasta: string | null;
  /** Texto del último error (sin secretos); puede no venir. */
  ultimo_error?: string | null;
}

/**
 * GET /v1/calendar/sync-estado (oficina) — estado VISIBLE de la sync
 * unidireccional sistema → Google Calendar.
 * El API viejo responde 404 ⇒ el panel usa `null` = «estado no disponible».
 */
export interface CalendarSyncEstado {
  /** Las 3 variables de Google están puestas en el ambiente. */
  enabled: boolean;
  calendar_id: string | null;
  /** Última pasada del cron de reconciliación de la ventana. */
  ultimo_reconcile_at: string | null;
  /** Último backfill manual desde el panel. */
  ultimo_resync_at: string | null;
  ultimo_resumen: CalendarResyncResumen | null;
  /** Por qué NO está activa (API 0.0.10+): texto sin secretos para el chip;
   *  null cuando `enabled` o en un API que aún no lo manda. */
  motivo?: string | null;
  /** Cola persistente de cambios pendientes; `null` = migración pendiente,
   *  ausente = API viejo (ver `CalendarSyncCola`). */
  cola?: CalendarSyncCola | null;
  /** `enabled && cola.activa`: cada cambio se publica solo, con reintentos.
   *  Ausente = API viejo (el panel lo deriva de `cola`). */
  automatica?: boolean;
}

/**
 * POST /v1/calendar/resync — backfill completo (vuelos, descansos, eventos y
 * mantenimientos de la ventana). `nota` recuerda que los eventos capturados a
 * mano en Google NO se tocan. Compatible con el API viejo (`{enabled,total}`).
 */
export interface CalendarResyncResultado extends CalendarResyncResumen {
  enabled: boolean;
  calendar_id?: string | null;
  /** Ventana efectiva del backfill en DÍAS Cancún (YYYY-MM-DD). */
  desde?: string | null;
  hasta?: string | null;
  nota?: string | null;
}
