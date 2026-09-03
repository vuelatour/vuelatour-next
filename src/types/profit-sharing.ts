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
  /** Cifras BRUTAS del cliente (precio completo con TUAs/extras/pernocta/
      comisión del vendedor/IVA). */
  total_usd: number;
  cobrado_usd: number;
  pendiente_usd: number;
  /** Comisión del vendedor (pre-IVA), INFORMATIVA: desde el 28-ago-2026 es
      ingreso/egreso de VuelaTour (va en "otros ingresos"), ya no se descuenta
      al avión. */
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
  /** Vuelo MULTI-AVIÓN (28-ago-2026): fracción (0, 1] de la venta del avión
      que le toca a ESTE avión por sus tramos; las cifras `*_avion_usd` de la
      fila ya vienen repartidas por el API. Aditivo (falta ⇒ 1). */
  participacion?: number;
  /** true cuando el vuelo lo volaron varios aviones de la flota. */
  multi_avion?: boolean;
  /** Etiqueta de los tramos de este avión (p. ej. "1 de 2 tramos"). */
  tramos_avion?: string;
  /** De dónde salió el peso: 'unico' | 'tramos' (partes iguales por tramo
      vendido; el API no emite otra fuente). */
  participacion_fuente?: string;
  /** ADITIVO (29-ago-2026): presente solo cuando los cobros MXN sin TC de
      este vuelo se convirtieron con el TC oficial de referencia del día de
      la cotización (la cotización no trae tc_usd_mxn). */
  tc_oficial?: { tc: number; fecha_dato: string; fuente: string };
}

/** Conteo/monto de lo convertido con el TC oficial de referencia del día
 *  (open.er-api / BCE). Ya está DENTRO de las cifras: solo informa. */
export interface TcOficialGastos {
  count: number;
  monto_mxn: number;
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
  /** ADITIVOS (29-ago-2026): de `count`, los MXN sin TC capturado que se
      convirtieron con el TC oficial del día del gasto. */
  tc_oficial_count?: number;
  tc_oficial_mxn?: number;
  /** ADITIVO (2-sep-2026): etiqueta humana homologada de la categoría base
      con el mismo sufijo de la clave (" (repartido)"); `categoria` sigue
      siendo el código crudo (clave de agregación, nunca se compara con esto). */
  etiqueta?: string;
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
        (TUAs/extras/pernocta/comisión del vendedor/IVA): informativos, NO se
        reparten. */
    otros_ingresos_vuelatour_usd?: number;
    /** Ídem, pendientes de cobro. */
    otros_ingresos_vuelatour_pendiente_usd?: number;
    /** Comisiones de venta descontadas al avión. Desde el 28-ago-2026 es
        SIEMPRE 0: la comisión del vendedor es ingreso/egreso de VuelaTour
        (otros ingresos), no un costo del avión. Se conserva por
        compatibilidad de shape (PDF/XLSX/API previo). */
    comisiones_venta_usd: number;
    /** Pendiente de la VENTA DEL AVIÓN (parte que cuadra con la cascada). */
    pendiente_cobro_usd: number;
    /** Deuda COMPLETA del cliente (venta + otros VuelaTour pendientes).
        Opcional: el API previo al deploy no lo manda. */
    pendiente_bruto_usd?: number;
    vuelos_cobrados: number;
    vuelos_pendientes: number;
    /** Cobros MXN que no pudieron convertirse a USD (sin TC en el cobro, en
        la cotización ni TC oficial de referencia disponible). */
    cobros_sin_tc_mxn: number;
    /** ADITIVO (29-ago-2026): vuelos (contados en el avión que los reporta)
        cuyos cobros MXN sin TC se convirtieron con el TC oficial del día de
        la cotización; ya están dentro de cobrado_usd. */
    cobros_tc_oficial_count?: number;
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
    /** ADITIVO (29-ago-2026): gastos MXN sin tc_gasto convertidos con el TC
        oficial del día del gasto; ya restan en las cifras de arriba. */
    gastos_tc_oficial?: TcOficialGastos;
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
  /** ADITIVO (29-ago-2026): externos cuyos cobros MXN sin TC se convirtieron
      con el TC oficial del día de la cotización. */
  cobros_tc_oficial_count?: number;
  /** Comisión del vendedor cotizada en los vuelos externos del periodo
      (pre-IVA): ingreso de VuelaTour, informativo. Aditivo: el API previo
      no lo manda. */
  comisiones_vendedor_usd?: number;
}

/** Otros ingresos de VuelaTour en el periodo (TUAs, extras, pernocta,
 *  comisión del vendedor e IVA cobrados junto con la venta): bloque
 *  informativo global — NO entran al reparto de socios. Opcional por
 *  tolerancia a APIs previas al deploy. */
export interface OtrosIngresosVuelatour {
  vuelos: number;
  cobrado_usd: number;
  pendiente_usd: number;
  desglose: {
    tuas_usd: number;
    extras_usd: number;
    pernocta_usd: number;
    iva_usd: number;
    /** Comisión del vendedor (pre-IVA), ingreso de VuelaTour desde el
        28-ago-2026; su pago al vendedor es egreso de VuelaTour (otros
        movimientos). Aditivo: el API previo no lo manda. */
    comision_usd?: number;
  };
}

/** Resumen global del TC oficial de respaldo usado en el periodo (29-ago-2026):
 *  vuelos con cobros MXN sin TC y gastos MXN sin TC (por avión + fijos del
 *  pool + externos) convertidos con el TC oficial del día. Informativo. */
export interface TcOficialResumen {
  vuelos: number;
  gastos: TcOficialGastos;
  /** Fuentes legibles usadas ("open.er-api", "BCE (frankfurter)"). */
  fuentes: string[];
  leyenda: string;
}

export interface ProfitSharingResult {
  externos?: ExternosResumen;
  otros_ingresos_vuelatour?: OtrosIngresosVuelatour | null;
  periodo: { desde: string; hasta: string };
  /** FIJOS del pool en MXN que NO convirtieron (sin TC capturado ni oficial). */
  gastos_sin_tc: { count: number; monto_mxn: number };
  /** ADITIVO (29-ago-2026): FIJOS del pool convertidos con el TC oficial. */
  gastos_tc_oficial?: TcOficialGastos;
  /** ADITIVO (29-ago-2026): resumen global del TC oficial de respaldo. */
  tc_oficial?: TcOficialResumen | null;
  aviones: AvionReparto[];
}
