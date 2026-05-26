export interface DashboardResumen {
  ingresos_cobrados_usd: number;
  ingresos_pendientes_usd: number;
  gastos_totales_usd: number;
  saldo_disponible_usd: number;
  vuelos_periodo: number;
  vuelos_completados: number;
  vuelos_cancelados: number;
}

export interface DashboardAvion {
  aeronave_id: string;
  matricula: string;
  modelo: string;
  vuelos: number;
  ingresos_cobrado_usd: number;
  gastos_usd: number;
  saldo_usd: number;
}

export interface DashboardOperacion {
  solicitudes: number;
  cotizaciones: number;
  confirmados: number;
  en_vuelo: number;
  completados_periodo: number;
  cancelados_periodo: number;
}

export interface DashboardCliente {
  cliente_id: string;
  nombre: string;
  vuelos: number;
  ingresos_usd: number;
}

export interface DashboardOverview {
  periodo: { desde: string; hasta: string };
  resumen: DashboardResumen;
  por_avion: DashboardAvion[];
  operacion: DashboardOperacion;
  top_clientes: DashboardCliente[];
}
