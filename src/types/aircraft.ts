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
  color_calendario: string | null;
  ubicacion_base: string;
  activa: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Motor {
  id: string;
  posicion: PosicionMotor;
  numero_serie: string;
  tipo: TipoMotor;
  horas_totales: Decimal;
  turm: Decimal;
  tbo_horas: Decimal;
}

export interface Propeller {
  id: string;
  posicion: PosicionHelice;
  numero_serie: string;
  horas_totales: Decimal;
  tbo_horas: Decimal | null;
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
