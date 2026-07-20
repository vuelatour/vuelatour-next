/**
 * Shape de las entidades de flota expuestas por el API. Inferido de las
 * tablas del backend. Se reemplaza por tipos generados desde OpenAPI cuando
 * el spec esté completo con @ApiResponse decorators.
 */
export type PaisAeronave = "MX" | "USA";
export type TipoMotor = "PISTON" | "TURBINA";
export type PosicionMotor = "UNICO" | "IZQUIERDO" | "DERECHO";
export type PosicionHelice = "UNICA" | "IZQUIERDA" | "DERECHA";

/** Decimales y bigints de Postgres llegan como string vía supabase-js. */
type Decimal = string;

export interface Aircraft {
  id: string;
  matricula: string;
  modelo: string;
  pais_registro: PaisAeronave;
  num_motores: number;
  velocidad_crucero_kts: Decimal;
  asientos: number;
  tarifa_hora_pub_usd: Decimal | null;
  tarifa_hora_broker_usd: Decimal | null;
  reserva_overhaul_hr_usd: Decimal | null;
  /** Aportación AFAC (USD por hora cobrada): provisión por volar con matrícula extranjera. null = no aplica. */
  permiso_afac_usd_hr?: Decimal | null;
  color_calendario: string | null;
  ubicacion_base: string;
  activa: boolean;
  notas: string | null;
  /** Programa de servicio: secuencia cíclica de intervalos en horas (ej. [50,100,200]). */
  servicio_intervalos: number[];
  /** Horómetro (Hobbs) donde arranca la secuencia de servicios. */
  servicio_horas_base: number;
  created_at: string;
  updated_at: string;
  /** Foto principal de la galería (para el avatar del listado). */
  imagen_principal_url?: string | null;
}

/** Histórico de tacómetros + estatus de servicio de una aeronave. */
export interface TacometroHistorial {
  horas_actuales: number;
  servicio_intervalos: number[];
  servicio_horas_base: number;
  proximo_servicio: { a_las: number; intervalo: number; faltan: number } | null;
  historial: {
    escala_id: string;
    folio: number | null;
    fecha: string | null;
    ruta: string;
    taco_salida: number | null;
    taco_llegada: number | null;
    horas: number | null;
    /** URLs firmadas de las fotos del tacómetro (bucket privado), si tiene. */
    foto_salida_url?: string | null;
    foto_llegada_url?: string | null;
  }[];
}

export interface Motor {
  id: string;
  posicion: PosicionMotor;
  numero_serie: string;
  tipo: TipoMotor;
  horas_totales: Decimal;
  turm: Decimal;
  tbo_horas: Decimal;
  /** Horas de vida vivas (acumulan con lo volado). Lo calcula el snapshot. */
  horas_actuales?: number;
  /** Horas restantes para el próximo overhaul (TBO). null si no hay TBO. */
  tbo_restante?: number | null;
}

export interface Propeller {
  id: string;
  posicion: PosicionHelice;
  numero_serie: string;
  horas_totales: Decimal;
  tbo_horas: Decimal | null;
  horas_actuales?: number;
  tbo_restante?: number | null;
}

export interface AircraftOwner {
  id: string;
  socio_id: string;
  porcentaje: Decimal;
  vigente_desde: string;
  vigente_hasta: string | null;
  notas: string | null;
  usuario: {
    nombre: string;
    es_empresa: boolean;
    rol: string;
  } | null;
}

export interface OverhaulReserve {
  id: string;
  motor_id: string | null;
  monto_por_hora_usd: Decimal;
  horas_acumuladas: Decimal;
}

export interface AeronaveImagen {
  id: string;
  aeronave_id: string;
  storage_path: string;
  url: string;
  alt_text: string | null;
  orden: number;
  es_principal: boolean;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface AeronaveSeguro {
  id: string;
  aeronave_id: string;
  aseguradora: string;
  num_poliza: string;
  cobertura: string | null;
  suma_asegurada_usd: Decimal | null;
  prima_usd: Decimal | null;
  vigente_desde: string;
  vigente_hasta: string;
  archivo_url: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export type SeveridadSquawk = "BAJA" | "MEDIA" | "ALTA";
export type EstadoSquawk = "ABIERTA" | "EN_PROGRESO" | "RESUELTA";

export interface AeronaveDiscrepancia {
  id: string;
  aeronave_id: string;
  vuelo_id: string | null;
  descripcion: string;
  severidad: SeveridadSquawk;
  estado: EstadoSquawk;
  reportado_por: string | null;
  fecha_reporte: string;
  resolucion: string | null;
  fecha_resolucion: string | null;
  resuelto_por: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface AircraftSnapshot extends Aircraft {
  motors: Motor[];
  propellers: Propeller[];
  owners: AircraftOwner[];
  overhaul_reserves: OverhaulReserve[];
  imagenes: AeronaveImagen[];
  seguros: AeronaveSeguro[];
  discrepancias: AeronaveDiscrepancia[];
}

export interface AircraftMetrics {
  airworthiness: {
    apto: boolean;
    documentos_vencidos: { id: string; tipo_nombre: string; objetivo: string }[];
    en_taller: boolean;
    componentes_vencidos: { posicion: string; numero_serie: string; restantes: number }[];
  };
  utilizacion: {
    horas_total: number;
    horas_mes: number;
    horas_anio: number;
    vuelos_total: number;
    vuelos_mes: number;
    vuelos_anio: number;
  };
  finanzas: {
    moneda: string;
    ingresos: number;
    gastos: number;
    utilidad: number;
  }[];
}

export interface ListResponse<T> {
  data: T[];
  count: number;
  limit: number;
  offset: number;
}
