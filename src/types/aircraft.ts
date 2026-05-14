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

export interface AircraftSnapshot extends Aircraft {
  motors: Motor[];
  propellers: Propeller[];
  owners: AircraftOwner[];
  overhaul_reserves: OverhaulReserve[];
}

export interface ListResponse<T> {
  data: T[];
  count: number;
  limit: number;
  offset: number;
}
