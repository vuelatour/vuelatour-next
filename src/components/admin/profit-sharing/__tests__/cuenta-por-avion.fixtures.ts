/**
 * EL CASO REAL del saldo POR AVIÓN (10-nov-2026, API 0.0.134): la cuenta de
 * Mauricio Roque, socio de DOS aviones (N4142R 69 % y XB-ANU 70 %), con los
 * números de la captura del cliente («está mezclado todos los aviones que
 * tenga un socio en su cuenta… lo mete todo en la misma licuadora»).
 *
 * Son respuestas CRUDAS, con la forma en que las manda el API
 * (`reparto-cuenta.por-avion.spec.ts` del API usa las mismas cifras): las
 * pruebas las pasan por los normalizadores de verdad.
 *
 *   N4142R  generó 360,678.28 (19,002.73 del mes en curso) · entregado
 *           341,879.57 · por entregar 18,798.71 (sin el mes en curso −204.02)
 *           saldo corrido: 232,547.75 → −5,717.78 → 103,410.02 → −204.02 → 18,798.71
 *   XB-ANU  generó −3,862.60 (la pérdida de octubre) · entregado 0 · −3,862.60
 *   Socio   generado 356,815.68 · entregado 341,879.57 · por entregar 14,936.11
 *
 * La lista MEZCLADA de siempre (la raíz) lleva el saldo que el cliente veía:
 * … → 99,547.42 → −4,066.62 (la entrega del N4142R «contra» la pérdida del
 * XB-ANU) → 14,936.11.
 */

export const MAURICIO = "50c10000-0000-4000-8000-000000000001";
export const N4142R = "a1a1a1a1-0000-4000-8000-000000004142";
export const XBANU = "a1a1a1a1-0000-4000-8000-0000000000a0";
export const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
export const ENTREGA_SEP_ID = "dddddddd-0000-4000-8000-000000000001";
export const ENTREGA_OCT_ID = "dddddddd-0000-4000-8000-000000000002";
export const ENTREGA_GENERAL_ID = "dddddddd-0000-4000-8000-000000000003";

const AV_N4142R = { id: N4142R, matricula: "N4142R" };
const AV_XBANU = { id: XBANU, matricula: "XB-ANU" };

type Crudo = Record<string, unknown>;

function entrega(over: Crudo): Crudo {
  return {
    socio_id: MAURICIO,
    aeronave_id: N4142R,
    aeronave: AV_N4142R,
    moneda: "MXN",
    tc_usd_mxn: 18.5,
    utilidad_snapshot_usd: null,
    saldo_snapshot_usd: null,
    saldo_snapshot_mxn: null,
    metodo: "TRANSFERENCIA",
    referencia: null,
    entregado_por: ALE.id,
    entregado_por_nombre: ALE.nombre,
    recibido_por: null,
    factura_folio: null,
    comprobante_path: null,
    comprobante_url: null,
    notas: null,
    created_by: ALE.id,
    created_by_nombre: ALE.nombre,
    ...over,
  };
}

/** Entrega del 20-oct por septiembre, «corresponde a» N4142R. */
export const ENTREGA_SEP = entrega({
  id: ENTREGA_SEP_ID,
  periodo: "2026-09-01",
  mes: "2026-09",
  monto: 238265.53,
  monto_mxn: 238265.53,
  monto_usd: 12879.22,
  fecha_pago: "2026-10-20",
  referencia: "SPEI 8841",
  created_at: "2026-10-20T15:00:01Z",
});

/** Entrega del 10-nov por octubre, «corresponde a» N4142R (la de la captura). */
export const ENTREGA_OCT = entrega({
  id: ENTREGA_OCT_ID,
  periodo: "2026-10-01",
  mes: "2026-10",
  monto: 103614.04,
  monto_mxn: 103614.04,
  monto_usd: 5600.76,
  fecha_pago: "2026-11-10",
  created_at: "2026-11-10T16:20:00Z",
});

/** Variante: una entrega SIN avión (queda «a cuenta general»). */
export const ENTREGA_GENERAL = entrega({
  id: ENTREGA_GENERAL_ID,
  aeronave_id: null,
  aeronave: null,
  periodo: null,
  mes: null,
  monto: 3000,
  monto_mxn: 3000,
  monto_usd: 162.16,
  fecha_pago: "2026-10-25",
  metodo: "EFECTIVO",
  created_at: "2026-10-25T18:00:00Z",
});

function mov(over: Crudo): Crudo {
  return {
    mes: null,
    aeronave: null,
    porcentaje: null,
    cargo_mxn: 0,
    abono_mxn: 0,
    en_curso: false,
    pago: null,
    ...over,
  };
}

const utilidad = (
  mes: string,
  fecha: string,
  etiqueta: string,
  avion: { id: string; matricula: string },
  porcentaje: number,
  cargo: number,
  saldo: number,
  enCurso = false,
): Crudo =>
  mov({
    fecha,
    tipo: "UTILIDAD",
    concepto: `Utilidad ${etiqueta} · ${avion.matricula} ${porcentaje} %`,
    mes,
    aeronave: avion,
    porcentaje,
    cargo_mxn: cargo,
    saldo_mxn: saldo,
    en_curso: enCurso,
  });

const entregaMov = (pago: Crudo, concepto: string, saldo: number): Crudo =>
  mov({
    fecha: pago.fecha_pago,
    tipo: "ENTREGA",
    concepto,
    mes: pago.mes,
    aeronave: pago.aeronave,
    abono_mxn: pago.monto_mxn,
    saldo_mxn: saldo,
    pago,
  });

const CONCEPTO_SEP = "Entrega · Transferencia · $238,265.53 MXN a T.C. 18.5 · ref SPEI 8841 · corresponde a sep 2026 · N4142R";
const CONCEPTO_OCT = "Entrega · Transferencia · $103,614.04 MXN a T.C. 18.5 · corresponde a oct 2026 · N4142R";
const CONCEPTO_GENERAL = "Adelanto a cuenta · Efectivo · $3,000 MXN a T.C. 18.5";

const ARRANQUE = mov({
  fecha: "2026-09-01",
  tipo: "SALDO_INICIAL",
  concepto: "Arranque de la cuenta (saldo inicial $0)",
  mes: "2026-09",
  saldo_mxn: 0,
});

/** Los movimientos del N4142R con SU saldo corrido (toda la cuenta). */
const MOVS_N4142R: Crudo[] = [
  utilidad("2026-09", "2026-09-30", "sep 2026", AV_N4142R, 69, 232547.75, 232547.75),
  entregaMov(ENTREGA_SEP, CONCEPTO_SEP, -5717.78),
  utilidad("2026-10", "2026-10-31", "oct 2026", AV_N4142R, 69, 109127.8, 103410.02),
  // La pérdida del XB-ANU ya NO entra aquí: −$204.02, no −$4,066.62.
  entregaMov(ENTREGA_OCT, CONCEPTO_OCT, -204.02),
  utilidad("2026-11", "2026-11-30", "nov 2026", AV_N4142R, 69, 19002.73, 18798.71, true),
];

const MOVS_XBANU: Crudo[] = [utilidad("2026-10", "2026-10-31", "oct 2026", AV_XBANU, 70, -3862.6, -3862.6)];

/** Los totales de HOY de cada avión (no cambian con el filtro de meses). */
const SALDO_N4142R: Crudo = {
  aeronave: AV_N4142R,
  porcentaje: 69,
  generado_mxn: 360678.28,
  mes_en_curso_mxn: 19002.73,
  entregado_mxn: 341879.57,
  por_entregar_mxn: 18798.71,
  por_entregar_cerrado_mxn: -204.02,
  estado: "POR_ENTREGAR",
};

const SALDO_XBANU: Crudo = {
  aeronave: AV_XBANU,
  porcentaje: 70,
  generado_mxn: -3862.6,
  mes_en_curso_mxn: 0,
  entregado_mxn: 0,
  por_entregar_mxn: -3862.6,
  por_entregar_cerrado_mxn: -3862.6,
  // El API clasifica por el saldo: negativo ⇒ ADELANTADO (el panel lo llama
  // «Pérdida acumulada» porque no hay entregas).
  estado: "ADELANTADO",
};

/** «A cuenta general» con la entrega sin avión de $3,000 (variante). */
const SALDO_GENERAL: Crudo = {
  aeronave: null,
  porcentaje: null,
  generado_mxn: 0,
  mes_en_curso_mxn: 0,
  entregado_mxn: 3000,
  por_entregar_mxn: -3000,
  por_entregar_cerrado_mxn: -3000,
  estado: "ADELANTADO",
};

const SOCIO = { id: MAURICIO, nombre: "Mauricio Roque", rol: "SOCIO", estado: "ACTIVO" };
const CUENTA = { cuenta_desde: "2026-09", saldo_inicial_mxn: 0, notas: null, configurada: true };
const AVIONES = [
  { ...AV_N4142R, porcentaje: 69, vigente: true, activa: true },
  { ...AV_XBANU, porcentaje: 70, vigente: true, activa: true },
];

const POR_MES: Crudo[] = [
  {
    mes: "2026-09",
    utilidad_mxn: 232547.75,
    en_curso: false,
    por_avion: [{ aeronave: AV_N4142R, porcentaje: 69, monto_mxn: 232547.75 }],
    entregado_mxn: 0,
  },
  {
    mes: "2026-10",
    utilidad_mxn: 105265.2,
    en_curso: false,
    por_avion: [
      { aeronave: AV_N4142R, porcentaje: 69, monto_mxn: 109127.8 },
      { aeronave: AV_XBANU, porcentaje: 70, monto_mxn: -3862.6 },
    ],
    entregado_mxn: 238265.53,
  },
  {
    mes: "2026-11",
    utilidad_mxn: 19002.73,
    en_curso: true,
    por_avion: [{ aeronave: AV_N4142R, porcentaje: 69, monto_mxn: 19002.73 }],
    entregado_mxn: 103614.04,
  },
];

const TOTALES: Crudo = {
  generado_mxn: 356815.68,
  mes_en_curso_mxn: 19002.73,
  entregado_mxn: 341879.57,
  por_entregar_mxn: 14936.11,
  por_entregar_cerrado_mxn: -4066.62,
  estado: "POR_ENTREGAR",
};

/**
 * `GET /v1/profit-sharing/socios/:id/estado-cuenta` de Mauricio Roque, TODA
 * la cuenta (septiembre a noviembre 2026, noviembre en curso).
 */
export function estadoCuentaPorAvion(): Crudo {
  return {
    disponible: true,
    socio: SOCIO,
    cuenta: CUENTA,
    aviones: AVIONES,
    desde: "2026-09",
    hasta: "2026-11",
    saldo_anterior_mxn: 0,
    // La lista MEZCLADA de siempre: un solo saldo corrido para los dos aviones.
    movimientos: [
      ARRANQUE,
      utilidad("2026-09", "2026-09-30", "sep 2026", AV_N4142R, 69, 232547.75, 232547.75),
      entregaMov(ENTREGA_SEP, CONCEPTO_SEP, -5717.78),
      utilidad("2026-10", "2026-10-31", "oct 2026", AV_N4142R, 69, 109127.8, 103410.02),
      utilidad("2026-10", "2026-10-31", "oct 2026", AV_XBANU, 70, -3862.6, 99547.42),
      entregaMov(ENTREGA_OCT, CONCEPTO_OCT, -4066.62),
      utilidad("2026-11", "2026-11-30", "nov 2026", AV_N4142R, 69, 19002.73, 14936.11, true),
    ],
    por_mes: POR_MES,
    totales: TOTALES,
    rango: { generado_mxn: 356815.68, entregado_mxn: 341879.57, saldo_final_mxn: 14936.11 },
    avisos: [],
    por_avion: [
      {
        ...SALDO_N4142R,
        saldo_anterior_mxn: 0,
        movimientos: MOVS_N4142R,
        rango: { generado_mxn: 360678.28, entregado_mxn: 341879.57, saldo_final_mxn: 18798.71 },
      },
      {
        ...SALDO_XBANU,
        saldo_anterior_mxn: 0,
        movimientos: MOVS_XBANU,
        rango: { generado_mxn: -3862.6, entregado_mxn: 0, saldo_final_mxn: -3862.6 },
      },
    ],
    cuenta_por_avion: true,
  };
}

/**
 * El mismo estado de cuenta con el filtro `?desde=2026-11&hasta=2026-11`:
 * cada avión colapsa lo anterior en SU «Saldo al cierre de oct 2026» (y el
 * XB-ANU, que no se movió en noviembre, solo trae ese renglón).
 */
export function estadoCuentaPorAvionNoviembre(): Crudo {
  const saldoAnterior = (avion: { id: string; matricula: string } | null, saldo: number): Crudo =>
    mov({
      fecha: "2026-11-01",
      tipo: "SALDO_ANTERIOR",
      concepto: "Saldo al cierre de oct 2026",
      mes: "2026-10",
      aeronave: avion,
      saldo_mxn: saldo,
    });
  return {
    ...estadoCuentaPorAvion(),
    desde: "2026-11",
    hasta: "2026-11",
    saldo_anterior_mxn: 99547.42,
    movimientos: [
      saldoAnterior(null, 99547.42),
      entregaMov(ENTREGA_OCT, CONCEPTO_OCT, -4066.62),
      utilidad("2026-11", "2026-11-30", "nov 2026", AV_N4142R, 69, 19002.73, 14936.11, true),
    ],
    por_mes: [POR_MES[2]],
    rango: { generado_mxn: 19002.73, entregado_mxn: 103614.04, saldo_final_mxn: 14936.11 },
    por_avion: [
      {
        ...SALDO_N4142R,
        saldo_anterior_mxn: 103410.02,
        movimientos: [saldoAnterior(AV_N4142R, 103410.02), MOVS_N4142R[3], MOVS_N4142R[4]],
        rango: { generado_mxn: 19002.73, entregado_mxn: 103614.04, saldo_final_mxn: 18798.71 },
      },
      {
        ...SALDO_XBANU,
        saldo_anterior_mxn: -3862.6,
        movimientos: [saldoAnterior(AV_XBANU, -3862.6)],
        rango: { generado_mxn: 0, entregado_mxn: 0, saldo_final_mxn: -3862.6 },
      },
    ],
  };
}

/**
 * Filtro `?desde=2026-09&hasta=2026-09`: el XB-ANU todavía no tenía nada
 * (ni antes ni en el mes) ⇒ su sección llega SIN movimientos, con sus
 * totales de hoy.
 */
export function estadoCuentaPorAvionSeptiembre(): Crudo {
  return {
    ...estadoCuentaPorAvion(),
    desde: "2026-09",
    hasta: "2026-09",
    saldo_anterior_mxn: 0,
    movimientos: [ARRANQUE, utilidad("2026-09", "2026-09-30", "sep 2026", AV_N4142R, 69, 232547.75, 232547.75)],
    por_mes: [POR_MES[0]],
    rango: { generado_mxn: 232547.75, entregado_mxn: 0, saldo_final_mxn: 232547.75 },
    por_avion: [
      {
        ...SALDO_N4142R,
        saldo_anterior_mxn: 0,
        movimientos: [MOVS_N4142R[0]],
        rango: { generado_mxn: 232547.75, entregado_mxn: 0, saldo_final_mxn: 232547.75 },
      },
      {
        ...SALDO_XBANU,
        saldo_anterior_mxn: 0,
        movimientos: [],
        rango: { generado_mxn: 0, entregado_mxn: 0, saldo_final_mxn: 0 },
      },
    ],
  };
}

/**
 * Variante con «A CUENTA GENERAL»: además de lo de la captura, una entrega
 * de $3,000 SIN avión el 25-oct. Va en su propia sección, al final; el
 * socio queda con $3,000 menos por entregar.
 */
export function estadoCuentaConGeneral(): Crudo {
  const base = estadoCuentaPorAvion();
  return {
    ...base,
    totales: {
      ...TOTALES,
      entregado_mxn: 344879.57,
      por_entregar_mxn: 11936.11,
      por_entregar_cerrado_mxn: -7066.62,
    },
    rango: { generado_mxn: 356815.68, entregado_mxn: 344879.57, saldo_final_mxn: 11936.11 },
    por_avion: [
      ...(base.por_avion as Crudo[]),
      {
        ...SALDO_GENERAL,
        saldo_anterior_mxn: 0,
        movimientos: [ARRANQUE, entregaMov(ENTREGA_GENERAL, CONCEPTO_GENERAL, -3000)],
        rango: { generado_mxn: 0, entregado_mxn: 3000, saldo_final_mxn: -3000 },
      },
    ],
  };
}

/** El renglón de Mauricio en `GET /v1/profit-sharing/socios` (resumen). */
export function resumenPorAvion(): Crudo {
  return {
    socio: SOCIO,
    cuenta: CUENTA,
    generado_mxn: 356815.68,
    mes_en_curso_mxn: 19002.73,
    entregado_mxn: 341879.57,
    por_entregar_mxn: 14936.11,
    por_entregar_cerrado_mxn: -4066.62,
    estado: "POR_ENTREGAR",
    ultimo_pago: {
      id: ENTREGA_OCT_ID,
      fecha_pago: "2026-11-10",
      monto: 103614.04,
      moneda: "MXN",
      monto_mxn: 103614.04,
      monto_usd: 5600.76,
      metodo: "TRANSFERENCIA",
    },
    aviones: AVIONES,
    avisos: [],
    por_avion: [SALDO_N4142R, SALDO_XBANU],
    cuenta_por_avion: true,
  };
}

/**
 * El mismo renglón ANTES de la entrega del 10-nov (la que se va a registrar):
 * el N4142R tiene $103,410.02 por entregar de meses cerrados.
 */
export function resumenAntesDeLaEntrega(): Crudo {
  return {
    ...resumenPorAvion(),
    entregado_mxn: 238265.53,
    por_entregar_mxn: 118550.15,
    por_entregar_cerrado_mxn: 99547.42,
    ultimo_pago: null,
    por_avion: [
      {
        ...SALDO_N4142R,
        entregado_mxn: 238265.53,
        por_entregar_mxn: 122412.75,
        por_entregar_cerrado_mxn: 103410.02,
      },
      SALDO_XBANU,
    ],
  };
}

/** El resumen con «a cuenta general» adelantada por $3,000. */
export function resumenConGeneral(): Crudo {
  const base = resumenAntesDeLaEntrega();
  return {
    ...base,
    entregado_mxn: 241265.53,
    por_entregar_mxn: 115550.15,
    por_entregar_cerrado_mxn: 96547.42,
    por_avion: [...(base.por_avion as Crudo[]), SALDO_GENERAL],
  };
}

/** Quita el aditivo del 0.0.134: la respuesta de un API previo. */
export function sinAditivo(raw: Crudo): Crudo {
  const copia = { ...raw };
  delete copia.por_avion;
  delete copia.cuenta_por_avion;
  return copia;
}
