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

// ===== Operativo (Itzel / COORDINADOR) =====

export interface DashboardVueloSemana {
  id: string;
  folio: number | null;
  estado: string;
  origen_iata: string | null;
  destino_iata: string | null;
  fecha_vuelo: string | null;
  piloto_id: string | null;
  aeronave_id: string | null;
}

export interface DashboardOperativo {
  periodo: { desde: string; hasta: string };
  hoy: {
    solicitudes_del_dia: number;
    solicitudes_abiertas: number;
    cotizaciones_pendientes: number;
    confirmados: number;
    en_vuelo: number;
  };
  conversion: {
    base_cotizados: number;
    convertidos: number;
    cancelados: number;
    tasa_conversion_pct: number;
  };
  vuelos_semana: DashboardVueloSemana[];
  vuelos_semana_total: number;
}

// ===== Gastos (Jimmy / ANALISTA) =====

export interface DashboardGastosAvion {
  aeronave_id: string;
  matricula: string;
  modelo: string;
  vuelos: number;
  horas_voladas: number;
  gastos_usd: number;
  ingresos_cobrado_usd: number;
  utilidad_usd: number;
  costo_hora_usd: number | null;
  utilidad_hora_usd: number | null;
}

export interface DashboardGastos {
  periodo: { desde: string; hasta: string };
  resumen: {
    gastos_totales_usd: number;
    gastos_avion_usd: number;
    gastos_sin_avion_usd: number;
    horas_voladas: number;
    costo_hora_promedio_usd: number | null;
    gastos_sin_tc: number;
  };
  por_avion: DashboardGastosAvion[];
}

// ===== Gastos por tarjeta (Ale / ADMIN) =====

export interface DashboardTarjetaItem {
  terminacion: string;
  titular: string | null;
  gasto_usd: number;
  movimientos: number;
}

export interface DashboardTarjetaPersona {
  usuario_id: string | null;
  nombre: string;
  gasto_usd: number;
  movimientos: number;
}

export interface DashboardTarjetaCategoria {
  categoria: string;
  gasto_usd: number;
  movimientos: number;
}

export interface DashboardTarjetas {
  periodo: { desde: string; hasta: string };
  resumen: {
    gasto_total_usd: number;
    movimientos: number;
    tarjetas_con_gasto: number;
    gastos_sin_tc: number;
  };
  por_tarjeta: DashboardTarjetaItem[];
  por_persona: DashboardTarjetaPersona[];
  por_categoria: DashboardTarjetaCategoria[];
}

// ===== Horas de piloto (COORDINADOR / ADMIN) =====

export interface DashboardPilotoHoras {
  piloto_id: string;
  nombre: string;
  horas_periodo: number;
  vuelos_periodo: number;
  horas_mes_actual: number;
  limite_horas_mes: number;
  excede_limite: boolean;
  horas_restantes_mes: number;
}

export interface DashboardHorasPiloto {
  periodo: { desde: string; hasta: string };
  mes_actual: { desde: string; hasta: string };
  limite_horas_mes: number;
  resumen: {
    horas_periodo_total: number;
    pilotos_con_actividad: number;
    pilotos_sobre_limite: number;
  };
  pilotos: DashboardPilotoHoras[];
}
