import type { CierrePeriodoAditivo } from "./cierres";

export interface RepartoSocio {
  socio_id: string;
  socio_nombre: string;
  porcentaje: number;
  monto_usd: number;
  /** ADITIVO (reparto en pesos, 18-oct-2026, API 0.0.93): el mismo reparto
      por porcentaje sobre `saldo_disponible_mxn` (residuo en centavos). */
  monto_mxn?: number | null;
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
  /** Comisión del vendedor COBRADA (pre-IVA), INFORMATIVA: desde el
      28-ago-2026 es ingreso de VuelaTour (va en "otros ingresos"). Su PAGO
      es solo el gasto real (13-oct-2026, dos categorías): la «(VuelaTour)»
      egresa en «otros movimientos» y la «(avión)» resta en
      `comisiones_venta_usd` del avión. */
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
  /** ADITIVOS (cierre de mes, 16-oct-2026, API 0.0.88): marca del API
      («Viene de septiembre 2026» / «Pendiente de cobro: pasará a…» o, ya
      cobrado después del corte, «Pasará a… · cobrado el 14-oct, después del
      30-sep» desde el 0.0.91) y los meses `YYYY-MM` de/a los que se
      difirió. Ausentes con un API previo. */
  cierre_marca?: string | null;
  diferido_de?: string | null;
  diferido_a?: string | null;
  /** ADITIVOS (reparto en pesos, 18-oct-2026, API 0.0.93): la parte del
      avión cobrada / pendiente EN PESOS (round2(USD × K)) y el K usado (T.C.
      de la cotización o el oficial del día de la cotización). null = sin
      ningún T.C. para pasarla a pesos. */
  cobrado_avion_mxn?: number | null;
  pendiente_avion_mxn?: number | null;
  tc_pesos?: number | null;
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
  /** ADITIVO (reparto en pesos, 18-oct-2026, API 0.0.93): la categoría en
      pesos (MXN tal cual; USD × su T.C. o el oficial de su día). */
  mxn?: number;
}

/**
 * Un ingreso de Ingresos ASIGNADO a este avión (13-oct-2026, API 0.0.75):
 * cuenta en su saldo y su reparto. `usd` = neto (monto − comisión) en USD con
 * el T.C. propio del ingreso o el oficial de su día (`tc_oficial`); null =
 * MXN sin T.C. (NO entró al saldo: va en `otros_ingresos_avion_sin_tc_mxn`).
 */
export interface DetalleOtroIngresoAvion {
  id: string;
  /** «ING-4». */
  clave: string;
  /** Día Cancún YYYY-MM-DD. */
  fecha: string;
  categoria: string;
  categoria_etiqueta: string;
  /** Descripción · cliente o pagador. */
  concepto: string;
  moneda: "MXN" | "USD";
  monto: number;
  comision: number | null;
  neto: number;
  usd: number | null;
  tc: number | null;
  tc_oficial: boolean;
  /** ADITIVO (reparto en pesos, 18-oct-2026, API 0.0.93): neto en pesos;
      null = ingreso en USD sin T.C. para pasarlo a pesos. */
  mxn?: number | null;
}

/**
 * Desglose por avión (vuelos + gastos + reserva). Campo ADITIVO del API:
 * puede faltar si el backend aún no lo publica — la UI degrada sin crashear.
 */
export interface AvionRepartoDetalle {
  vuelos: DetalleVuelo[];
  gastos_por_categoria: DetalleGastoCategoria[];
  reserva: {
    horas_hr: number;
    tarifa_hora_usd: number;
    monto_usd: number;
    /** ADITIVOS (reparto en pesos, 18-oct-2026, API 0.0.93): la reserva en
        pesos y el T.C. oficial del cierre del periodo con que se pasó. */
    monto_mxn?: number;
    tc?: number | null;
  };
  /** ADITIVO (13-oct-2026, API 0.0.75): los ingresos asignados a este avión
      ([] sin ingresos; ausente con un API previo). */
  otros_ingresos_avion?: DetalleOtroIngresoAvion[];
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
    /** Comisiones que absorbe el avión («Comisiones (banco + vendedor)» de
        la cascada): su parte de la comisión bancaria de sus cobros (regla
        de septiembre 2026, API 0.0.65) + los pagos capturados como
        «Comisión del vendedor (avión)» (13-oct-2026, API 0.0.74; puede ser
        ≠ 0 en un mes anterior a la regla). Lo cobrado al cliente por la
        comisión sigue siendo ingreso de VuelaTour (28-ago-2026) y la
        «Comisión del vendedor (VuelaTour)» nunca entra aquí. 0 = nada que
        restar. */
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
    /** ADITIVOS (13-oct-2026, API 0.0.75): ingresos de Ingresos ASIGNADOS a
        este avión, netos de comisión, en USD. SUMAN al saldo (ya están
        dentro de `saldo_disponible_usd`) y NO se mezclan con la venta. */
    otros_ingresos_avion_usd?: number;
    /** Los de esos ingresos en MXN sin T.C. propio ni oficial: NO suman. */
    otros_ingresos_avion_sin_tc_mxn?: number;
    /** Cuántos de esos ingresos se convirtieron con el T.C. oficial del día. */
    otros_ingresos_avion_tc_oficial_count?: number;
    /** ADITIVOS (reparto en pesos, 18-oct-2026, API 0.0.93): las mismas
        cifras EN PESOS (lo que se transfiere a los socios). El panel no las
        calcula: las pinta. Con la bandera raíz `reparto_en_pesos`. */
    cobrado_mxn?: number;
    comisiones_venta_mxn?: number;
    pendiente_cobro_mxn?: number;
    otros_ingresos_avion_mxn?: number;
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
    /** ADITIVOS (reparto en pesos, 18-oct-2026, API 0.0.93): gastos MXN tal
        cual (menos TUA/extensión embebidas); USD × su T.C. o el oficial. */
    directos_mxn?: number;
    indirectos_mxn?: number;
    permisos_mxn?: number;
    otros_prorrateados_mxn?: number;
  };
  reserva_overhaul_usd: number;
  reserva_overhaul_incompleta: boolean;
  saldo_disponible_usd: number;
  /** ADITIVOS (reparto en pesos, 18-oct-2026, API 0.0.93). `saldo_disponible_mxn`
      = cobrado − comisiones − directos − indirectos − permisos − otros −
      reserva + otros ingresos (todo en pesos). `pesos_sin_tc_usd` = dólares
      que SÍ entraron al saldo USD pero no se pudieron pasar a pesos: > 0 ⇒ el
      saldo en pesos está incompleto (se avisa). */
  reserva_overhaul_mxn?: number;
  saldo_disponible_mxn?: number;
  pesos_sin_tc_usd?: number;
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
    /** Comisión del vendedor COBRADA (pre-IVA), ingreso de VuelaTour desde
        el 28-ago-2026. Su pago es el gasto real: «(VuelaTour)» egresa en
        otros movimientos; «(avión)» resta en las Comisiones del avión
        (13-oct-2026). Aditivo: el API previo no lo manda. */
    comision_usd?: number;
  };
}

/** Resumen global del TC oficial de respaldo usado en el periodo (29-ago-2026):
 *  vuelos con cobros MXN sin TC y gastos MXN sin TC (por avión + fijos del
 *  pool + externos) convertidos con el TC oficial del día. Informativo. */
export interface TcOficialResumen {
  vuelos: number;
  gastos: TcOficialGastos;
  /** ADITIVO (13-oct-2026, API 0.0.75): otros ingresos de aviones en MXN
      convertidos con el T.C. oficial (mismo shape que `gastos`). */
  ingresos?: TcOficialGastos;
  /** Fuentes legibles usadas ("open.er-api", "BCE (frankfurter)"). */
  fuentes: string[];
  leyenda: string;
}

export interface ProfitSharingResult {
  /** ADITIVO (18-oct-2026, API 0.0.93): el reparto viene EN PESOS (llaves
      `*_mxn`). Sin ella (API ≤ 0.0.92) la pantalla es la de siempre, en
      dólares. Fuente única de la lectura: `repartoEnPesos` de
      `lib/admin/reparto-pesos.ts`. */
  reparto_en_pesos?: boolean;
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
  /** ADITIVO (cierre de mes, 16-oct-2026, API 0.0.88): estado del mes y los
      vuelos que salen / entran / pasarían. Ausente con un API previo. */
  cierre?: CierrePeriodoAditivo | null;
}
