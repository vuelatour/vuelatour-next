import type { ListResponse } from "./aircraft";
import type { MetodoPago } from "./quote";
import type {
  EstadoVuelo,
  ParticipacionAvion,
  ParticipacionFuente,
} from "./quotes-persisted";

/** Tripulante resuelto por el API (apoyos, copiloto por tramo). `rol` es el
    del catálogo de usuarios (ADMIN, PILOTO, MECANICO…): el apoyo puede ser
    cualquier usuario activo, no solo pilotos. */
export interface TripulanteRef {
  id: string;
  nombre: string;
  rol?: string | null;
}

/** Apoyo EFECTIVO de un tramo: los del vuelo ∪ los del tramo (29-ago-2026). */
export interface ApoyoEfectivo extends TripulanteRef {
  origen: "vuelo" | "tramo";
}

/** Resumen para listas: el backend devuelve solo estos cols en GET /v1/flights. */
export interface FlightListItem {
  id: string;
  folio: number;
  cliente_id: string;
  aeronave_id: string | null;
  piloto_id: string | null;
  /** Copiloto del viaje (segundo piloto): ve todo el vuelo igual que el piloto. */
  copiloto_id: string | null;
  /** Apoyo en tierra: va al aeropuerto a apoyar (maletas, pagos, cobros,
      gastos). Ve el vuelo como el piloto en su app pero NO captura
      tacómetros. Opcional-defensivo: filas/respuestas viejas no lo traen.
      Desde 29-ago-2026 es solo el ESPEJO del primer apoyo de `apoyos`. */
  apoyo_id?: string | null;
  /** Apoyos de NIVEL VUELO (0..N; fuente única `vuelo_apoyo`, 29-ago-2026).
      Opcional-defensivo: el API previo no lo manda → leer SIEMPRE con
      `apoyosDeVuelo()` (cae al espejo apoyo_id/apoyo_nombre). */
  apoyos?: TripulanteRef[];
  ruta_id: string | null;
  tipo: "REDONDO" | "MULTIESCALA";
  estado: EstadoVuelo;
  es_externo: boolean;
  operador_externo: string | null;
  /** Costo del externo en USD (canon DERIVADO por el API; con moneda MXN es
      monto ÷ tc). Fuente única para sumar/comparar. */
  costo_externo_usd: string | null;
  /** Costo NATIVO capturado (29-ago: puede ser MXN). Opcional-defensivo:
      respuestas del API previo no lo traen — caer a costo_externo_usd. */
  costo_externo_monto?: string | null;
  costo_externo_moneda?: "USD" | "MXN" | null;
  /** TC MXN/USD con el que se derivó el USD cuando la moneda es MXN. */
  costo_externo_tc?: string | null;
  /** Ficha del avión AJENO (externo). Opcional-defensivo para respuestas de
      APIs previas al despliegue (el detalle cae a la cotización si falta). */
  avion_externo_modelo?: string | null;
  avion_externo_matricula?: string | null;
  /** Vuelo COMBINADO (estrategia de pernocta): id del vuelo ligado — se
      cancelaron los dos ferries y comparten avión; los precios de ambos
      clientes NO cambian. Opcional-defensivo (respuestas previas al deploy). */
  combinado_con_id?: string | null;
  /** Join del vuelo ligado (PostgREST puede mandarlo como arreglo). */
  combinado?: { folio: number } | { folio: number }[] | null;
  /** Método de cobro pactado (define si entra a Facturas antes de cobrar). */
  metodo_cobro?: MetodoPago | null;
  cotizacion_version: number;
  origen_iata: string;
  destino_iata: string;
  /** Ruta COMPLETA (origen → escalas → destino), p. ej. ["CUN","CTM","CUN"]. */
  ruta_iatas?: string[];
  pasajeros: number;
  monto_total_usd: string;
  /** TC USD→MXN con el que se cotizó (numeric como string; null si la
      cotización no lo fijó). Sirve para prellenar el TC al cobrar en MXN.
      Opcional-defensivo: listados/respuestas previas al deploy no lo traen. */
  tc_usd_mxn?: string | null;
  /** Nombres de los pasajeros (manifiesto, para tramitar permisos). */
  pasajeros_nombres?: string[];
  /** Vuelo abierto: el itinerario/precio se cierra al final. */
  cotizacion_abierta?: boolean;
  fecha_vuelo: string | null;
  /** Fecha de la SOLICITUD (cuándo se capturó). Opcional-defensivo: el
      listado del API puede no mandarla — caer a `created_at` (≈ lo mismo).
      Ordena las filas SIN fecha de vuelo (recién creadas primero). */
  fecha_solicitud?: string | null;
  fecha_traslado_final: string | null;
  /** Fin real del viaje (derivada por trigger: GREATEST de tramos/traslado final). */
  fecha_fin: string | null;
  fecha_confirmacion: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  /** PATH en el bucket privado planes-vuelo (filas viejas: URL completa).
      NO sirve como href — firmar vía getFlightPlanUrl(). */
  foto_plan_vuelo_url: string | null;
  facturado: boolean;
  cobrado: boolean;
  notas: string | null;
  notas_internas: string | null;
  google_calendar_id: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Avisos NO bloqueantes que devuelven assign / createReserva (4-sep-2026):
   * capacidad del avión vs pasajeros, doble reserva del avión ese día. Solo
   * viajan en la respuesta de esas escrituras (no en listas/snapshot); el
   * panel los muestra como toast ámbar con `toastAvisos`.
   */
  avisos?: string[];
}

export interface FlightEscala {
  id: string;
  vuelo_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  // Asignación por tramo (ida/regreso independientes).
  aeronave_id: string | null;
  piloto_id: string | null;
  estado_permiso: "no_aplica" | "pendiente" | "emitido";
  fecha_salida_plan: string | null;
  foto_plan_vuelo_url: string | null;
  google_calendar_id: string | null;
  // Resueltos por el backend en snapshot() para mostrar la asignación del tramo.
  aeronave_matricula?: string | null;
  piloto_nombre?: string | null;
  // Tripulación por tramo (29-ago-2026). Todo opcional-defensivo: el API
  // previo no lo manda.
  /** Copiloto de ESTE tramo (rotación). null = hereda `vuelo.copiloto_id`. */
  copiloto_id?: string | null;
  /** Copiloto que realmente va en el tramo (propio ?? del vuelo). */
  copiloto_efectivo_id?: string | null;
  /** Nombre del copiloto EFECTIVO, resuelto por el API. */
  copiloto_nombre?: string | null;
  /** Apoyos SOLO de este tramo (`vuelo_apoyo` con escala_id). */
  apoyos_tramo?: TripulanteRef[];
  /** Apoyos efectivos del tramo: los del vuelo ∪ los del tramo, con origen.
      Leer con `apoyosEfectivosDeTramo()` para tolerar el API previo. */
  apoyos_efectivos?: ApoyoEfectivo[];
  // Detalle por tramo.
  pasajeros: number | null;
  /** Manifiesto de nombres de ESTE tramo (por escala, puede ir vacío). */
  pasajeros_nombres?: string[];
  es_ferry: boolean;
  /** Tramo de sobrevuelo (recorrido sobre una zona, no un traslado normal). */
  es_sobrevuelo?: boolean;
  requiere_pernocta: boolean;
  pernocta_costo_usd: string | null;
  tipo_parada: "NORMAL" | "SERVICIO";
  servicio_notas: string | null;
  /** true = tramo operativo interno (no cotizado/cobrado, no visible al cliente). */
  solo_operativa: boolean;
  taco_salida: string | null;
  taco_llegada: string | null;
  /** Procedencia de cada lectura: PILOTO | IA | DEDUCIDO | OFICINA. DEDUCIDO
   * es provisional del sistema (no evidencia de que el tramo voló). */
  taco_salida_origen?: "PILOTO" | "IA" | "DEDUCIDO" | "OFICINA" | null;
  taco_llegada_origen?: "PILOTO" | "IA" | "DEDUCIDO" | "OFICINA" | null;
  foto_taco_salida_url: string | null;
  foto_taco_llegada_url: string | null;
  /** Tramo CANCELADO (no voló): fuera de horas, completitud y calendario. */
  cancelada_at?: string | null;
  cancelada_motivo?: string | null;
  cancelada_por?: string | null;
  valor_ia_propuesto: string | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  /** Bitácora "cómo se registró la lectura" (el API la manda aparte del motivo). */
  procedencia?: string | null;
  hora_salida: string | null;
  hora_llegada: string | null;
  capturado_offline: boolean;
  sincronizado_at: string | null;
  capturado_por: string | null;
  corregido_por: string | null;
  /** Nombres resueltos por el API para la procedencia de la lectura. */
  capturado_por_nombre?: string | null;
  corregido_por_nombre?: string | null;
  nota_correccion: string | null;
  corregido_at: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  /** Avisos NO bloqueantes de assignEscala (capacidad/doble reserva). */
  avisos?: string[];
}

export interface FlightCobro {
  id: string;
  vuelo_id: string;
  monto: string;
  moneda: "USD" | "MXN";
  metodo_cobro: MetodoPago;
  tc_usd_mxn: string | null;
  /** % comisión del banco sobre este cobro (null = sin comisión). */
  comision_banco_pct?: string | null;
  /** Comisión en la moneda del cobro; el banco depositó monto − esto. */
  comision_banco_monto?: string | null;
  referencia: string | null;
  /** A qué cuenta llegó el cobro (solo métodos bancarios). Desde 28-ago-2026
      es uno de `CUENTAS_COBRO` (@/lib/admin/cobros: Paywise, HSBC Dólares,
      HSBC Pesos, Scotiabank Dólares, Scotiabank Pesos); las filas anteriores
      pueden traer el alias libre que se capturó entonces. */
  cuenta_destino?: string | null;
  fecha_cobro: string;
  foto_voucher_url: string | null;
  registrado_por: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  /**
   * SOBRE de cobro de GRUPO (4-sep-2026, ADITIVOS): cuando este cobro es una
   * PARTE de un sobre (`cobro_grupo_id` ≠ null) se edita/elimina desde el
   * grupo — el API responde 409 COBRO_DE_GRUPO en PATCH/DELETE por vuelo.
   * `cobro_grupo` es el resumen del sobre para pintar "Parte del sobre G-12
   * · $2,060.16 de $10,800.76" (montos del API, nunca calculados aquí).
   */
  cobro_grupo_id?: string | null;
  /** Fracción (6 decimales) del sobre que le tocó a este vuelo. */
  grupo_factor?: number | string | null;
  cobro_grupo?: CobroGrupoResumen | null;
  /** Conciliado con el banco (fuente única del API `cobro-conciliado.util`:
      liga directa `cobro_id` o, si es parte, la liga del sobre). Ausente =
      API previo (no se pinta badge; jamás se deduce en el panel). */
  conciliado?: boolean;
  movimiento_bancario_id?: string | null;
}

/** Resumen del sobre de grupo que viaja en cada parte (aditivo del API). */
export interface CobroGrupoResumen {
  id: string;
  grupo_id: string;
  grupo_folio: number | null;
  /** BRUTO del sobre en su moneda nativa. */
  monto_total: number;
  moneda: string;
}

/** Snapshot completo: GET /v1/flights/:id/snapshot. */
export interface FlightSnapshot extends FlightListItem {
  escalas: FlightEscala[];
  cobros: FlightCobro[];
  total_cobrado: number;
  /** Nombre del apoyo en tierra, resuelto por el backend en snapshot(). */
  apoyo_nombre?: string | null;
  /**
   * Vuelo MULTI-AVIÓN (regla 28-ago-2026): reparto de la venta del avión
   * entre los aviones de sus tramos (fuente única del API). Aditivo: el API
   * previo no lo manda; con un solo avión trae un elemento con factor 1.
   */
  participacion_aviones?: ParticipacionAvion[];
  participacion_fuente?: ParticipacionFuente;
  /**
   * Cotización de GRUPO (4-sep-2026): aviones VIVOS del grupo al que
   * pertenece este vuelo, para el badge "avión k de N". null/ausente = no es
   * hijo de grupo o API previo (el badge omite "de N").
   */
  grupo_total_aviones?: number | null;
}

/** Foto de tacómetro con URL firmada: GET /v1/flights/:id/taco-photos. */
export interface TacoPhoto {
  escala_id: string;
  orden: number;
  origen_iata: string;
  destino_iata: string;
  taco_salida: string | null;
  taco_llegada: string | null;
  valor_ia_propuesto: string | null;
  revision_requerida: boolean;
  revision_motivo: string | null;
  foto_salida_url: string | null;
  foto_llegada_url: string | null;
  capturado_at: string | null;
}

export type FlightListResponse = ListResponse<FlightListItem>;

/** Folio del vuelo ligado por combinación (tolera el join objeto o arreglo). */
export function combinadoFolio(v: {
  combinado?: { folio: number } | { folio: number }[] | null;
}): number | null {
  const c = v.combinado;
  const x = Array.isArray(c) ? c[0] : c;
  return x?.folio ?? null;
}

/** Apoyos de nivel vuelo con fallback al espejo `apoyo_id`/`apoyo_nombre`
 *  (respuestas del API previo a la lista, 29-ago-2026). El nombre puede venir
 *  vacío en el fallback: quien pinta lo resuelve contra el catálogo. */
export function apoyosDeVuelo(v: {
  apoyos?: TripulanteRef[] | null;
  apoyo_id?: string | null;
  apoyo_nombre?: string | null;
}): TripulanteRef[] {
  if (Array.isArray(v.apoyos)) return v.apoyos;
  return v.apoyo_id ? [{ id: v.apoyo_id, nombre: v.apoyo_nombre ?? "" }] : [];
}

/** Apoyos efectivos de un tramo (del vuelo ∪ del tramo) con fallback cuando
 *  el API previo no manda `apoyos_efectivos`. */
export function apoyosEfectivosDeTramo(
  escala: Pick<FlightEscala, "apoyos_efectivos" | "apoyos_tramo">,
  apoyosVuelo: TripulanteRef[],
): ApoyoEfectivo[] {
  if (Array.isArray(escala.apoyos_efectivos)) return escala.apoyos_efectivos;
  return [
    ...apoyosVuelo.map((a) => ({ ...a, origen: "vuelo" as const })),
    ...(escala.apoyos_tramo ?? []).map((a) => ({ ...a, origen: "tramo" as const })),
  ];
}
