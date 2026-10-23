/**
 * Reparto de dos aviones para las pruebas del REPARTO EN PESOS (18-oct-2026,
 * API 0.0.93). `avionA()` / `avionB()` tienen la forma EXACTA del API ≤ 0.0.92
 * (sin una sola llave `*_mxn` ni la bandera): con ellas se congeló el HTML de
 * la pantalla ANTES del cambio (`reparto-pesos.golden.json`). `conPesos(…)`
 * agrega las llaves ADITIVAS del contrato §2a con los pesos que mandaría el
 * API 0.0.93 (K = 17.25, salvo el vuelo #301 cotizado a 18.012345).
 *
 * A (N621TX): venta $12,000 + otros ingresos $2,586.16 − comisiones $360 −
 * directos $4,000 − indirectos $800 − permisos $150 − fijos $600 − reserva
 * $500 = saldo $8,176.16 USD. En pesos el gasto MXN sin T.C. ($1,740) SÍ
 * resta (los pesos van tal cual): saldo $145,050.03 MXN.
 * B (N4142R): sin vuelos, gastos y fijos ⇒ saldo −$1,000 USD / −$17,250 MXN,
 * un socio al 50 % y sin `detalle` (API viejo).
 */
import type {
  AvionReparto,
  DetalleOtroIngresoAvion,
  OtrosIngresosVuelatour,
} from "@/types/profit-sharing";

export const ING4: DetalleOtroIngresoAvion = {
  id: "i-4",
  clave: "ING-4",
  fecha: "2026-09-04",
  categoria: "REEMBOLSO_DEVOLUCION",
  categoria_etiqueta: "Reembolsos y devoluciones recibidos",
  concepto: "TRANSF INTERBANCARIA SPEI · angel alvarez",
  moneda: "MXN",
  monto: 46550.8,
  comision: null,
  neto: 46550.8,
  usd: 2586.16,
  tc: 18,
  tc_oficial: true,
};

/** N621TX con todo lo que pinta la card (forma del API ≤ 0.0.92). */
export function avionA(): AvionReparto {
  return {
    aeronave: { id: "av-621", matricula: "N621TX", modelo: "Cessna 421C" },
    ingresos: {
      cobrado_usd: 12000,
      cobrado_bruto_usd: 13500,
      otros_ingresos_vuelatour_usd: 1500,
      otros_ingresos_vuelatour_pendiente_usd: 200,
      comisiones_venta_usd: 360,
      pendiente_cobro_usd: 3000,
      pendiente_bruto_usd: 3400,
      vuelos_cobrados: 2,
      vuelos_pendientes: 1,
      cobros_sin_tc_mxn: 5000,
      cobros_tc_oficial_count: 1,
      otros_ingresos_avion_usd: 2586.16,
      otros_ingresos_avion_sin_tc_mxn: 0,
      otros_ingresos_avion_tc_oficial_count: 1,
    },
    horas_voladas_hr: 12.5,
    gastos: {
      directos_usd: 4000,
      indirectos_usd: 800,
      permisos_usd: 150,
      otros_prorrateados_usd: 600,
      gastos_sin_tc_count: 1,
      gastos_sin_tc_mxn: 1740,
      gastos_tc_oficial: { count: 2, monto_mxn: 3450.5 },
    },
    reserva_overhaul_usd: 500,
    reserva_overhaul_incompleta: false,
    saldo_disponible_usd: 8176.16,
    reparto: [
      { socio_id: "s-hernan", socio_nombre: "Hernán Pérez", porcentaje: 40.92, monto_usd: 3345.68 },
      { socio_id: "s-vt", socio_nombre: "VuelaTour", porcentaje: 59.08, monto_usd: 4830.48 },
    ],
    reparto_porcentaje_total: 100,
    detalle: {
      vuelos: [
        {
          id: "v-301",
          folio: 301,
          fecha: "2026-09-03",
          ruta: "CUN-CZM-CUN",
          es_externo: false,
          total_usd: 6000,
          cobrado_usd: 6000,
          pendiente_usd: 0,
          comision_vendedor_usd: 0,
          cobrado: true,
          cobros_sin_tc_mxn: 0,
          venta_avion_usd: 5000,
          cobrado_avion_usd: 5000,
          pendiente_avion_usd: 0,
          otros_ingresos_vuelatour_usd: 1000,
          otros_ingresos_vuelatour_pendiente_usd: 0,
          tc_oficial: { tc: 18.012345, fecha_dato: "2026-09-02", fuente: "open.er-api" },
        },
        {
          id: "v-302",
          folio: 302,
          fecha: "2026-09-10",
          ruta: "CUN-MID-CUN",
          es_externo: false,
          total_usd: 10500,
          cobrado_usd: 7500,
          pendiente_usd: 3000,
          comision_vendedor_usd: 0,
          cobrado: false,
          cobros_sin_tc_mxn: 5000,
          venta_avion_usd: 10000,
          cobrado_avion_usd: 7000,
          pendiente_avion_usd: 3000,
          otros_ingresos_vuelatour_usd: 500,
          otros_ingresos_vuelatour_pendiente_usd: 200,
        },
        {
          id: "v-303",
          folio: 303,
          fecha: "2026-09-20",
          ruta: "CUN-HAV",
          es_externo: false,
          total_usd: 0,
          cobrado_usd: 0,
          pendiente_usd: 0,
          comision_vendedor_usd: 0,
          cobrado: false,
          cobros_sin_tc_mxn: 0,
          venta_avion_usd: 0,
          cobrado_avion_usd: 0,
          pendiente_avion_usd: 0,
          otros_ingresos_vuelatour_usd: 0,
          cancelado: true,
        },
      ],
      gastos_por_categoria: [
        {
          categoria: "COMBUSTIBLE",
          grupo: "DIRECTO",
          count: 3,
          usd: 3200,
          sin_tc_count: 0,
          sin_tc_mxn: 0,
          tc_oficial_count: 2,
          tc_oficial_mxn: 3450.5,
          etiqueta: "Combustible",
        },
        {
          categoria: "MANTENIMIENTO",
          grupo: "DIRECTO",
          count: 2,
          usd: 800,
          sin_tc_count: 1,
          sin_tc_mxn: 1740,
          etiqueta: "Mantenimiento",
        },
        { categoria: "HANGAR", grupo: "INDIRECTO", count: 1, usd: 800, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Hangar" },
        { categoria: "PERMISO", grupo: "PERMISO", count: 1, usd: 150, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Permiso AFAC" },
        {
          categoria: "NOMINA (repartido)",
          grupo: "FIJO",
          count: 1,
          usd: 600,
          sin_tc_count: 0,
          sin_tc_mxn: 0,
          etiqueta: "Nómina (repartido)",
        },
      ],
      reserva: { horas_hr: 12.5, tarifa_hora_usd: 40, monto_usd: 500 },
      otros_ingresos_avion: [ING4],
    },
  };
}

/** N4142R: saldo negativo, socios al 50 % y sin `detalle` (forma del API ≤ 0.0.92). */
export function avionB(): AvionReparto {
  return {
    aeronave: { id: "av-142", matricula: "N4142R", modelo: "Piper Seneca" },
    ingresos: {
      cobrado_usd: 0,
      comisiones_venta_usd: 0,
      pendiente_cobro_usd: 0,
      vuelos_cobrados: 0,
      vuelos_pendientes: 0,
      cobros_sin_tc_mxn: 0,
    },
    horas_voladas_hr: 2,
    gastos: {
      directos_usd: 300,
      indirectos_usd: 100,
      permisos_usd: 0,
      otros_prorrateados_usd: 600,
      gastos_sin_tc_count: 0,
      gastos_sin_tc_mxn: 0,
    },
    reserva_overhaul_usd: 0,
    reserva_overhaul_incompleta: true,
    saldo_disponible_usd: -1000,
    reparto: [{ socio_id: "s-ana", socio_nombre: "Ana López", porcentaje: 50, monto_usd: -500 }],
    reparto_porcentaje_total: 50,
    detalle: null,
  };
}

export function otrosIngresosVt(): OtrosIngresosVuelatour {
  return {
    vuelos: 2,
    cobrado_usd: 1500,
    pendiente_usd: 200,
    desglose: { tuas_usd: 600, extras_usd: 300, pernocta_usd: 200, iva_usd: 250, comision_usd: 150 },
  };
}

/** Pesos de cada avión (API 0.0.93). */
const PESOS: Record<string, (a: AvionReparto) => AvionReparto> = {
  "av-621": (a) => ({
    ...a,
    ingresos: {
      ...a.ingresos,
      cobrado_mxn: 210811.73,
      comisiones_venta_mxn: 6210,
      pendiente_cobro_mxn: 51750,
      otros_ingresos_avion_mxn: 46550.8,
    },
    gastos: {
      ...a.gastos,
      directos_mxn: 70740,
      indirectos_mxn: 13800,
      permisos_mxn: 2587.5,
      otros_prorrateados_mxn: 10350,
    },
    reserva_overhaul_mxn: 8625,
    saldo_disponible_mxn: 145050.03,
    pesos_sin_tc_usd: 0,
    reparto: [
      { ...a.reparto[0], monto_mxn: 59354.47 },
      { ...a.reparto[1], monto_mxn: 85695.56 },
    ],
    detalle: {
      ...a.detalle!,
      vuelos: a.detalle!.vuelos.map((v) =>
        v.id === "v-301"
          ? { ...v, cobrado_avion_mxn: 90061.73, pendiente_avion_mxn: 0, tc_pesos: 18.012345 }
          : v.id === "v-302"
            ? { ...v, cobrado_avion_mxn: 120750, pendiente_avion_mxn: 51750, tc_pesos: 17.25 }
            : { ...v, cobrado_avion_mxn: 0, pendiente_avion_mxn: 0, tc_pesos: 17.25 },
      ),
      gastos_por_categoria: a.detalle!.gastos_por_categoria.map((g) => ({
        ...g,
        mxn: ({ COMBUSTIBLE: 55200, MANTENIMIENTO: 15540, HANGAR: 13800, PERMISO: 2587.5 } as Record<string, number>)[
          g.categoria
        ] ?? 10350,
      })),
      reserva: { ...a.detalle!.reserva, monto_mxn: 8625, tc: 17.25 },
      otros_ingresos_avion: a.detalle!.otros_ingresos_avion!.map((o) => ({ ...o, mxn: 46550.8 })),
    },
  }),
  "av-142": (a) => ({
    ...a,
    ingresos: {
      ...a.ingresos,
      cobrado_mxn: 0,
      comisiones_venta_mxn: 0,
      pendiente_cobro_mxn: 0,
      otros_ingresos_avion_mxn: 0,
    },
    gastos: {
      ...a.gastos,
      directos_mxn: 5175,
      indirectos_mxn: 1725,
      permisos_mxn: 0,
      otros_prorrateados_mxn: 10350,
    },
    reserva_overhaul_mxn: 0,
    saldo_disponible_mxn: -17250,
    pesos_sin_tc_usd: 0,
    reparto: [{ ...a.reparto[0], monto_mxn: -8625 }],
  }),
};

/** El mismo avión con las llaves `*_mxn` del API 0.0.93 (la bandera es de la RAÍZ). */
export function conPesos(a: AvionReparto): AvionReparto {
  return PESOS[a.aeronave.id](a);
}

/**
 * N621TX, septiembre 2026, con el COMBUSTIBLE SEPARADO (23-oct-2026, API
 * 0.0.103, invariante 104): los pesos son los del Excel «Balance» real del
 * cliente — venta 787,851.13 − comisiones 2,591.00 − directos 40,588.14 −
 * AFAC 42,575.49 = utilidad antes de gastos 702,096.50; combustible
 * 147,277.58 (antes la card unía 187,865.72 en «Gastos directos»); −
 * indirectos 13,800 − permisos 2,587.50 − fijos 10,350 + otros ingresos
 * 46,550.80 = saldo 574,632.22. Los dólares son informativos y cuadran igual
 * (AFAC $200/hr × 12.5 hr = $2,500). Las banderas raíz (`reparto_en_pesos`,
 * `reparto_como_balance`) van aparte, como siempre.
 */
export function avionCombustible(): AvionReparto {
  return {
    aeronave: { id: "av-621", matricula: "N621TX", modelo: "Cessna 421C" },
    ingresos: {
      cobrado_usd: 45672.53,
      cobrado_bruto_usd: 47172.53,
      otros_ingresos_vuelatour_usd: 1500,
      otros_ingresos_vuelatour_pendiente_usd: 0,
      comisiones_venta_usd: 150.2,
      pendiente_cobro_usd: 0,
      pendiente_bruto_usd: 0,
      vuelos_cobrados: 3,
      vuelos_pendientes: 0,
      cobros_sin_tc_mxn: 0,
      otros_ingresos_avion_usd: 2698.6,
      otros_ingresos_avion_sin_tc_mxn: 0,
      cobrado_mxn: 787851.13,
      comisiones_venta_mxn: 2591,
      pendiente_cobro_mxn: 0,
      otros_ingresos_avion_mxn: 46550.8,
    },
    horas_voladas_hr: 12.5,
    gastos: {
      directos_usd: 2352.94,
      indirectos_usd: 800,
      permisos_usd: 150,
      otros_prorrateados_usd: 600,
      gastos_sin_tc_count: 0,
      gastos_sin_tc_mxn: 0,
      directos_mxn: 40588.14,
      indirectos_mxn: 13800,
      permisos_mxn: 2587.5,
      otros_prorrateados_mxn: 10350,
      combustible_usd: 8537.83,
      combustible_mxn: 147277.58,
    },
    reserva_overhaul_usd: 500,
    reserva_overhaul_mxn: 8625,
    reserva_overhaul_incompleta: false,
    saldo_disponible_usd: 33280.16,
    saldo_disponible_mxn: 574632.22,
    pesos_sin_tc_usd: 0,
    afac_reservado_usd: 2500,
    afac_reservado_mxn: 42575.49,
    reserva_retenida_usd: 204.6,
    reserva_retenida_mxn: 3529.35,
    utilidad_antes_gastos_usd: 40669.39,
    utilidad_antes_gastos_mxn: 702096.5,
    reparto: [
      {
        socio_id: "s-hernan",
        socio_nombre: "Hernán Pérez",
        porcentaje: 40.92,
        utilidad_usd: 13618.24,
        utilidad_mxn: 235139.5,
        reserva_usd: 204.6,
        reserva_mxn: 3529.35,
        descuenta_reserva: true,
        monto_usd: 13413.64,
        monto_mxn: 231610.15,
      },
      {
        socio_id: "s-vt",
        socio_nombre: "VuelaTour",
        porcentaje: 59.08,
        utilidad_usd: 19661.92,
        utilidad_mxn: 339492.72,
        reserva_usd: 295.4,
        reserva_mxn: 5095.65,
        descuenta_reserva: false,
        monto_usd: 19661.92,
        monto_mxn: 339492.72,
      },
    ],
    reparto_porcentaje_total: 100,
    detalle: {
      vuelos: [],
      gastos_por_categoria: [
        { categoria: "GAS", grupo: "COMBUSTIBLE", count: 2, usd: 8537.83, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Combustible", mxn: 147277.58 },
        { categoria: "ATERRIZAJE", grupo: "DIRECTO", count: 1, usd: 1449.28, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Aterrizajes", mxn: 25000 },
        { categoria: "HOTEL", grupo: "DIRECTO", count: 1, usd: 903.66, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Hotel", mxn: 15588.14 },
        { categoria: "HANGAR", grupo: "INDIRECTO", count: 1, usd: 800, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Hangar", mxn: 13800 },
        { categoria: "PERMISO", grupo: "PERMISO", count: 1, usd: 150, sin_tc_count: 0, sin_tc_mxn: 0, etiqueta: "Permiso AFAC", mxn: 2587.5 },
      ],
      reserva: { horas_hr: 12.5, tarifa_hora_usd: 40, monto_usd: 500, monto_mxn: 8625, tc: 17.25 },
      otros_ingresos_avion: [{ ...ING4, usd: 2698.6, mxn: 46550.8 }],
      afac: { tarifa_usd_hr: 200, horas_cobradas_hr: 12.5, monto_usd: 2500, monto_mxn: 42575.49 },
    },
  };
}

/** El mismo avión como lo mandaría un API ≤ 0.0.102: sin las llaves del combustible ni el subtotal. */
export function sinCombustible(a: AvionReparto): AvionReparto {
  const gastos = { ...a.gastos };
  delete gastos.combustible_usd;
  delete gastos.combustible_mxn;
  const out: AvionReparto = { ...a, gastos };
  delete out.utilidad_antes_gastos_usd;
  delete out.utilidad_antes_gastos_mxn;
  return out;
}
