export interface RepartoSocio {
  socio_id: string;
  socio_nombre: string;
  porcentaje: number;
  monto_usd: number;
}

/** Un vuelo del periodo dentro del desglose por avión. */
export interface DetalleVuelo {
  id: string;
  folio: number | null;
  fecha: string | null;
  ruta: string;
  es_externo: boolean;
  total_usd: number;
  cobrado_usd: number;
  pendiente_usd: number;
  comision_vendedor_usd: number;
  cobrado: boolean;
  cobros_sin_tc_mxn: number;
}

export type DetalleGastoGrupo = "DIRECTO" | "INDIRECTO" | "PERMISO" | "EXCLUIDO" | 'FIJO';

/** Gastos del avión agrupados por categoría (para el desglose expandible). */
export interface DetalleGastoCategoria {
  categoria: string;
  grupo: DetalleGastoGrupo;
  count: number;
  usd: number;
  sin_tc_count: number;
  sin_tc_mxn: number;
}

/**
 * Desglose por avión (vuelos + gastos + reserva). Campo ADITIVO del API:
 * puede faltar si el backend aún no lo publica — la UI degrada sin crashear.
 */
export interface AvionRepartoDetalle {
  vuelos: DetalleVuelo[];
  gastos_por_categoria: DetalleGastoCategoria[];
  reserva: { horas_hr: number; tarifa_hora_usd: number; monto_usd: number };
}

export interface AvionReparto {
  aeronave: { id: string; matricula: string; modelo: string };
  ingresos: {
    cobrado_usd: number;
    /** Comisión de vendedores: se descuenta del ingreso a repartir. */
    comisiones_venta_usd: number;
    pendiente_cobro_usd: number;
    vuelos_cobrados: number;
    vuelos_pendientes: number;
    /** Cobros MXN que no pudieron convertirse a USD (sin TC). */
    cobros_sin_tc_mxn: number;
  };
  /** Horas de tacómetro voladas en el periodo (base de la reserva). */
  horas_voladas_hr: number;
  gastos: {
    directos_usd: number;
    indirectos_usd: number;
    permisos_usd: number;
    otros_prorrateados_usd: number;
    gastos_sin_tc_count: number;
    gastos_sin_tc_mxn: number;
  };
  reserva_overhaul_usd: number;
  reserva_overhaul_incompleta: boolean;
  saldo_disponible_usd: number;
  reparto: RepartoSocio[];
  reparto_porcentaje_total: number;
  /** Opcional: el API viejo no lo manda; tratar siempre defensivo. */
  detalle?: AvionRepartoDetalle | null;
}

/** Vuelos EXTERNOS del periodo (sin avión de flota): bloque informativo — su
 *  utilidad NO se reparte entre socios hasta que el cliente decida el
 *  tratamiento. Opcional por tolerancia a APIs sin el campo. */
export interface ExternosResumen {
  vuelos: number;
  cobrado_usd: number;
  costo_usd: number;
  utilidad_usd: number;
  sin_costo_count: number;
  cobros_sin_tc_mxn: number;
}

export interface ProfitSharingResult {
  externos?: ExternosResumen;
  periodo: { desde: string; hasta: string };
  gastos_sin_tc: { count: number; monto_mxn: number };
  aviones: AvionReparto[];
}
