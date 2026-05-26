export interface RepartoSocio {
  socio_id: string;
  socio_nombre: string;
  porcentaje: number;
  monto_usd: number;
}

export interface AvionReparto {
  aeronave: { id: string; matricula: string; modelo: string };
  ingresos: {
    cobrado_usd: number;
    pendiente_cobro_usd: number;
    vuelos_cobrados: number;
    vuelos_pendientes: number;
  };
  gastos: {
    directos_usd: number;
    indirectos_usd: number;
    permisos_usd: number;
    otros_prorrateados_usd: number;
    gastos_sin_tc_count: number;
  };
  reserva_overhaul_usd: number;
  reserva_overhaul_incompleta: boolean;
  saldo_disponible_usd: number;
  reparto: RepartoSocio[];
  reparto_porcentaje_total: number;
}

export interface ProfitSharingResult {
  periodo: { desde: string; hasta: string };
  gastos_sin_tc: { count: number; monto_mxn: number };
  aviones: AvionReparto[];
}
