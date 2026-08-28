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
  /** Cifras BRUTAS del cliente (precio completo con TUAs/extras/pernocta/IVA). */
  total_usd: number;
  cobrado_usd: number;
  pendiente_usd: number;
  comision_vendedor_usd: number;
  cobrado: boolean;
  cobros_sin_tc_mxn: number;
  /** Partición ADITIVA (28-ago-2026): la parte que es VENTA DEL AVIÓN (la que
      cuadra con la card y se reparte). El API previo no la manda — leer
      siempre con `?? total_usd` / `?? cobrado_usd` / `?? pendiente_usd`. */
  venta_avion_usd?: number;
  cobrado_avion_usd?: number;
  pendiente_avion_usd?: number;
  /** Otros ingresos VuelaTour COBRADOS en este vuelo (TUAs/extras/pernocta
      + IVA) = cobrado_bruto_usd − cobrado_avion_usd. No se reparten. */
  otros_ingresos_vuelatour_usd?: number;
  /** Ídem, COTIZADOS en este vuelo (lo que el precio trae de TUAs/extras/
      pernocta + IVA). Aditivo: el API previo no lo manda. */
  otros_ingresos_vuelatour_cotizado_usd?: number;
  /** Ídem, POR COBRAR en este vuelo (= cotizado − cobrado). Aditivo. */
  otros_ingresos_vuelatour_pendiente_usd?: number;
  /** Cobrado BRUTO (= venta avión + otros VuelaTour). */
  cobrado_bruto_usd?: number;
  /** De dónde salió la partición: desglose canónico, columnas del vuelo o
      sin precio (todo se trata como venta). */
  particion_fuente?: "desglose" | "columnas" | "sin_precio";
  /** true si la partición no cuadra con el total del vuelo: revisar. */
  particion_inconsistente?: boolean;
  /** Vuelo CANCELADO con dinero real (28-ago): los cobros son retenidos
      (anticipo / cargo por cancelación, no se reembolsan) y los gastos
      cuentan igual. Aditivo: el API previo no lo manda. */
  cancelado?: boolean;
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
    /** VENTA DEL AVIÓN cobrada (lo que sí se reparte). Desde 28-ago-2026
        excluye TUAs/extras/pernocta/IVA, que son ingresos de VuelaTour. */
    cobrado_usd: number;
    /** Cobrado BRUTO (venta + otros ingresos VuelaTour). Opcional: el API
        previo al deploy no lo manda. */
    cobrado_bruto_usd?: number;
    /** Otros ingresos VuelaTour cobrados en vuelos de este avión
        (TUAs/extras/pernocta/IVA): informativos, NO se reparten. */
    otros_ingresos_vuelatour_usd?: number;
    /** Ídem, pendientes de cobro. */
    otros_ingresos_vuelatour_pendiente_usd?: number;
    /** Comisión de vendedores: se descuenta del ingreso a repartir. */
    comisiones_venta_usd: number;
    /** Pendiente de la VENTA DEL AVIÓN (parte que cuadra con la cascada). */
    pendiente_cobro_usd: number;
    /** Deuda COMPLETA del cliente (venta + otros VuelaTour pendientes).
        Opcional: el API previo al deploy no lo manda. */
    pendiente_bruto_usd?: number;
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

/** Otros ingresos de VuelaTour en el periodo (TUAs, extras, pernocta e IVA
 *  cobrados junto con la venta): bloque informativo global — NO entran al
 *  reparto de socios. Opcional por tolerancia a APIs previas al deploy. */
export interface OtrosIngresosVuelatour {
  vuelos: number;
  cobrado_usd: number;
  pendiente_usd: number;
  desglose: {
    tuas_usd: number;
    extras_usd: number;
    pernocta_usd: number;
    iva_usd: number;
  };
}

export interface ProfitSharingResult {
  externos?: ExternosResumen;
  otros_ingresos_vuelatour?: OtrosIngresosVuelatour | null;
  periodo: { desde: string; hasta: string };
  gastos_sin_tc: { count: number; monto_mxn: number };
  aviones: AvionReparto[];
}
