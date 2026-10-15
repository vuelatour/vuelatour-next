/**
 * Respuestas de `GET /v1/conciliacion/cobros/:id` e `/ingresos/:id` (API 0.0.78,
 * invariante 78) para las pruebas de la hoja «Conciliación con el banco» de una
 * ENTRADA. Las REALES salen de `api.ejemplos_reales` de la spec
 * (conciliacion-inversa-ingresos, 14-oct-2026, SELECTs en prod
 * bjesduasnzbzywofukbf) y de las filas reales del fixture del API
 * (`conciliacion-entradas.fixture-spec.ts`); las SINTÉTICAS van rotuladas (0
 * sobres, 0 anticipos y 0 parciales en prod).
 */
import type { CuentaDeCargo, UltimoMovimientoCuenta } from "@/types/conciliacion";
import type {
  AbonoDeEntrada,
  ConciliacionDeEntrada,
  EntradaDeConciliacion,
} from "@/types/conciliacion-entrada";

export const CUENTA_COMBUSTIBLE: CuentaDeCargo = {
  id: "0752514c-6e08-455d-a1bd-d5ed4c7ca689",
  alias: "COMBUSTIBLE",
  banco: "Scotiabank",
  moneda: "MXN",
  tipo: "BANCO",
};
export const CUENTA_EJE: CuentaDeCargo = {
  id: "212add6c-c4e5-44cc-a30c-0635c0ab3036",
  alias: "EJE SCOTIA",
  banco: "Scotiabank",
  moneda: "MXN",
  tipo: "BANCO",
};
export const CUENTA_PAYWISE: CuentaDeCargo = {
  id: "51740293-2e8f-4f7c-81f8-71c4d105db10",
  alias: "Paywise",
  banco: "Paywise",
  moneda: "MXN",
  tipo: "PASARELA",
};
export const CUENTA_HSBC_USD: CuentaDeCargo = {
  id: "47d8fe90-8c9b-49e7-b648-31441f738131",
  alias: "HSBC USD",
  banco: "HSBC",
  moneda: "USD",
  tipo: "BANCO",
};
export const CUENTA_HSBC_PESOS: CuentaDeCargo = {
  id: "033efd4a-3cbc-4999-951f-6ec259c9791b",
  alias: "HSBC Pesos",
  banco: "HSBC",
  moneda: "MXN",
  tipo: "BANCO",
};

/** Las 9 cuentas ACTIVAS por alias (ejemplo D; SCOTIA USD está inactiva y no viaja). */
export const ULTIMOS_PROD: UltimoMovimientoCuenta[] = [
  {
    cuenta: { id: "6c9b0a81-8de2-4d83-b2e3-2b3676faf526", alias: "afirme", banco: "afirme", moneda: "MXN", tipo: "BANCO" },
    primera_fecha: null,
    ultima_fecha: null,
  },
  {
    cuenta: {
      id: "834fe175-bdc6-4825-ad5c-44179757413c",
      alias: "American Express Ale",
      banco: "American Express",
      moneda: "MXN",
      tipo: "BANCO",
    },
    primera_fecha: null,
    ultima_fecha: null,
  },
  { cuenta: CUENTA_COMBUSTIBLE, primera_fecha: "2026-07-01", ultima_fecha: "2026-10-12" },
  { cuenta: CUENTA_EJE, primera_fecha: "2026-09-01", ultima_fecha: "2026-10-12" },
  {
    cuenta: { id: "76a931e0-7c06-47c6-a574-6c7d4a698c14", alias: "GASTOS GNRAL", banco: "Scotiabank", moneda: "MXN", tipo: "BANCO" },
    primera_fecha: "2026-07-01",
    ultima_fecha: "2026-10-12",
  },
  { cuenta: CUENTA_HSBC_PESOS, primera_fecha: "2026-09-01", ultima_fecha: "2026-10-07" },
  { cuenta: CUENTA_HSBC_USD, primera_fecha: "2026-09-01", ultima_fecha: "2026-10-06" },
  { cuenta: CUENTA_PAYWISE, primera_fecha: "2026-09-01", ultima_fecha: "2026-09-30" },
  {
    cuenta: {
      id: "a9d43a0b-69fc-4d60-bdbc-aa5a840e7b1e",
      alias: "Tarjeta credito personal HSBC",
      banco: "HSBC",
      moneda: "MXN",
      tipo: "BANCO",
    },
    primera_fecha: null,
    ultima_fecha: null,
  },
];

const BASE_RESPUESTA = {
  sobre: null,
  anticipo: null,
  alertas: [],
  ultimos_movimientos: null,
  mismo_dia_cliente: null,
  cruce_no_corrio: null,
  varios_abonos_por_cobro: false,
} satisfies Partial<ConciliacionDeEntrada>;

function entradaCobro(e: Partial<EntradaDeConciliacion> & Pick<EntradaDeConciliacion, "id" | "monto" | "neto">): EntradaDeConciliacion {
  return {
    origen: "COBRO_VUELO",
    etiqueta: "Vuelo #?",
    categoria: "COBRO_VUELO",
    categoria_etiqueta: "Cobro de vuelo",
    dia: "2026-09-15",
    comision: null,
    moneda: "MXN",
    tc_usd_mxn: null,
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    cliente_nombre: null,
    concepto: null,
    vuelo_id: null,
    vuelo_folio: null,
    cuenta: null,
    cuenta_destino: null,
    registrado_por_nombre: null,
    registrado_at: null,
    es_reembolso: false,
    dado_de_baja: false,
    ...e,
  };
}

// ── A · ING-3 «DLO DIDI RIDES MX (AJUSTE)» $78.00 (COMBUSTIBLE), REAL ──

export const ING3_ID = "ffb57607-77e4-4334-8ee9-94afdba75f91";
export const ING3_ABONO = "abcf6f05-e560-4d33-ae1e-d0248bd40c6e";

export const respuestaIng3 = (): ConciliacionDeEntrada => ({
  entrada: {
    origen: "INGRESO",
    id: ING3_ID,
    etiqueta: "ING-3",
    categoria: "OTRO_INGRESO",
    categoria_etiqueta: "Otros ingresos",
    dia: "2026-09-10",
    monto: 78,
    comision: null,
    neto: 78,
    moneda: "MXN",
    tc_usd_mxn: null,
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    cliente_nombre: "didi",
    concepto: "DLO DIDI RIDES MX (AJUSTE)",
    vuelo_id: null,
    vuelo_folio: null,
    cuenta: CUENTA_COMBUSTIBLE,
    cuenta_destino: null,
    registrado_por_nombre: "Alejandro Canales",
    registrado_at: "2026-10-12T22:57:31.939317+00:00",
    es_reembolso: false,
    dado_de_baja: false,
  },
  estado: "CONCILIADO",
  via: "INGRESO",
  fuente: "COLUMNA",
  cobertura: null,
  abonos: [
    {
      movimiento_id: ING3_ABONO,
      fecha: "2026-09-10",
      tipo: "ABONO",
      monto: 78,
      moneda: "MXN",
      descripcion: "DLO DIDI RIDES MX (AJUSTE)",
      referencia: "00005579209156174929 REF. 9156174929 AUT. 085488",
      conciliado: true,
      origen: "IMPORTADO",
      creado_at: "2026-09-29T20:35:24.413103+00:00",
      creado_por: "Jimmy Chi",
      orden_archivo: null,
      cuenta: CUENTA_COMBUSTIBLE,
      estado_cuenta: {
        id: "caa0a50a-df3d-4df4-96e1-97845d8ae7e1",
        filename: "scotia combus (6).pdf",
        formato: "pdf",
        importado_at: "2026-09-29T20:35:24.229074+00:00",
        importado_por: "Jimmy Chi",
        movimientos_importados: 75,
      },
      sin_archivo: null,
      monto_bruto: null,
      comision_pasarela: null,
      liga: {
        via: "INGRESO",
        monto_parte: null,
        moneda: "MXN",
        cruzada: false,
        tc_implicito: null,
        cuadre: { por: "NETO", diferencia: 0, tolerancia: 1 },
        registro: { por: "Alejandro Canales", at: "2026-10-12T22:57:32.606618+00:00" },
        sin_registro: null,
      },
      lote: null,
      notas_oficina: null,
    },
  ],
  ...BASE_RESPUESTA,
});

// ── B · #293 Paywise $12,495.00 (comisión $624.76, neto $11,870.24), REAL ──

export const C293 = "ba71a50f-6f80-4412-82fe-ec0f97aec63e";
export const ABONO_293 = "5b8ef8f4-0655-4a41-88e6-01a73a626549";

export const respuesta293 = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({
    id: C293,
    etiqueta: "Vuelo #293",
    dia: "2026-09-11",
    monto: 12495,
    comision: 624.76,
    neto: 11870.24,
    tc_usd_mxn: 17,
    metodo: "PAYWISE",
    metodo_etiqueta: "Link de pago (Paywise)",
    cliente_nombre: "Diego Beltra",
    vuelo_id: "538043ec-7cd3-46c8-802c-d2d2e1c91206",
    vuelo_folio: 293,
    cuenta_destino: "Paywise",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-09-21T16:43:40.081513+00:00",
  }),
  estado: "CONCILIADO",
  via: "DIRECTO",
  fuente: "PUENTE",
  cobertura: {
    neto: 11870.24,
    monto_vinculado: 11870.24,
    faltante: 0,
    sobrante: 0,
    cubierto: true,
    abonos_n: 1,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [
    {
      movimiento_id: ABONO_293,
      fecha: "2026-09-11",
      tipo: "ABONO",
      monto: 11870.24,
      moneda: "MXN",
      descripcion: "DIEGO FRANCISCO,BELTRAN/COLLADO : dbc cozcan 20sep",
      referencia: null,
      conciliado: true,
      origen: "IMPORTADO",
      creado_at: "2026-09-24T19:46:03.346932+00:00",
      creado_por: "Alejandro Canales",
      orden_archivo: null,
      cuenta: CUENTA_PAYWISE,
      estado_cuenta: {
        id: "530470fc-c363-4149-82b9-e296567151f4",
        filename: "Reporte de Movimientos Septiembre-2026.pdf",
        formato: "pdf",
        importado_at: "2026-09-24T19:46:03.233773+00:00",
        importado_por: "Alejandro Canales",
        movimientos_importados: 34,
      },
      sin_archivo: null,
      monto_bruto: null,
      comision_pasarela: null,
      liga: {
        via: "DIRECTO",
        monto_parte: 11870.24,
        moneda: "MXN",
        cruzada: false,
        tc_implicito: null,
        cuadre: null,
        registro: null,
        sin_registro: "ANTERIOR_AL_CORTE",
      },
      lote: null,
      notas_oficina: null,
    },
  ],
  ...BASE_RESPUESTA,
});

/** Variante de centavos #358 (Andy de León, Paywise): neto $38,950.01 y el abono de $38,950.00. REAL. */
export const respuesta358 = (): ConciliacionDeEntrada => {
  const r = respuesta293();
  const abono = r.abonos[0];
  return {
    ...r,
    entrada: {
      ...r.entrada,
      id: "6276578b-e7bb-4925-a233-8e8cfd80c3b6",
      etiqueta: "Vuelo #358",
      dia: "2026-09-30",
      monto: 41000.01,
      comision: 2050,
      neto: 38950.01,
      cliente_nombre: "Andy de León",
      vuelo_folio: 358,
    },
    cobertura: {
      neto: 38950.01,
      monto_vinculado: 38950,
      faltante: 0.01,
      sobrante: 0,
      cubierto: true,
      abonos_n: 1,
      cruzado: false,
      tolerancia: 1,
    },
    abonos: [
      {
        ...abono,
        movimiento_id: "b8ed1d61-f8c5-4f6f-9d7f-d87db4072b30",
        fecha: "2026-09-30",
        monto: 38950,
        descripcion: "Vuelo Andy De Leon 29 septiembre 2026",
        estado_cuenta: abono.estado_cuenta
          ? { ...abono.estado_cuenta, filename: "Reporte de Movimientos paywise Septiembre-2026.pdf" }
          : null,
        liga: { ...abono.liga, monto_parte: 38950 },
      },
    ],
  };
};

// ── C · el SPEI de $69,183.00 (EJE SCOTIA, 15-sep) = #315 $68,205.55 + #332 $977.45, REAL ──

export const C315 = "46c6dae8-6751-4faa-8caa-b8d952817209";
export const C332 = "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f";
export const ABONO_69183 = "8a7eff81-6b8c-469e-a74d-2b0f4b631b08";
export const VUELO_315 = "e3851d95-b022-4825-883f-1e81068712cb";
export const VUELO_332 = "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e";

const abono69183 = (liga: AbonoDeEntrada["liga"]): AbonoDeEntrada => ({
  movimiento_id: ABONO_69183,
  fecha: "2026-09-15",
  tipo: "ABONO",
  monto: 69183,
  moneda: "MXN",
  descripcion: "TRANSF INTERBANCARIA SPEI",
  referencia: "00000000000000150926",
  conciliado: true,
  origen: "IMPORTADO",
  creado_at: "2026-10-06T15:22:46.58996+00:00",
  creado_por: "Alejandro Canales",
  orden_archivo: null,
  cuenta: CUENTA_EJE,
  estado_cuenta: {
    id: "1758cc58-7d78-4f73-966b-e7867803b8cc",
    filename: "scotia eje sep.pdf",
    formato: "pdf",
    importado_at: "2026-10-06T15:22:46.413405+00:00",
    importado_por: "Alejandro Canales",
    movimientos_importados: 98,
  },
  sin_archivo: null,
  monto_bruto: null,
  comision_pasarela: null,
  liga,
  lote: {
    cobros_n: 2,
    cobros_suma: 69183,
    cobros_diferencia: 0,
    cobros: [
      {
        cobro_id: C315,
        monto_parte: 68205.55,
        vuelo_id: VUELO_315,
        folio: 315,
        cliente: "Beh Kay ",
        fecha_cobro: "2026-09-15T17:00:00+00:00",
        monto: 68205.55,
        moneda: "MXN",
        metodo_cobro: "TRANSFERENCIA",
        comision_banco_monto: null,
        neto: 68205.55,
      },
      {
        cobro_id: C332,
        monto_parte: 977.45,
        vuelo_id: VUELO_332,
        folio: 332,
        cliente: "Beh Kay ",
        fecha_cobro: "2026-09-15T17:00:00+00:00",
        monto: 977.45,
        moneda: "MXN",
        metodo_cobro: "TRANSFERENCIA",
        comision_banco_monto: null,
        neto: 977.45,
      },
    ],
  },
  notas_oficina: null,
});

export const respuesta332 = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({
    id: C332,
    etiqueta: "Vuelo #332",
    monto: 977.45,
    neto: 977.45,
    tc_usd_mxn: 17.15,
    cliente_nombre: "Beh Kay ",
    vuelo_id: VUELO_332,
    vuelo_folio: 332,
    cuenta_destino: "Scotiabank Pesos",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-09-24T22:31:02.318945+00:00",
  }),
  estado: "CONCILIADO",
  via: "DIRECTO",
  fuente: "PUENTE",
  cobertura: {
    neto: 977.45,
    monto_vinculado: 977.45,
    faltante: 0,
    sobrante: 0,
    cubierto: true,
    abonos_n: 1,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [
    abono69183({
      via: "DIRECTO",
      monto_parte: 977.45,
      moneda: "MXN",
      cruzada: false,
      tc_implicito: null,
      cuadre: null,
      registro: { por: "Diego Ramírez", at: "2026-10-14T21:21:49.025963+00:00" },
      sin_registro: null,
    }),
  ],
  ...BASE_RESPUESTA,
  varios_abonos_por_cobro: true,
});

/** Desde #315: el MISMO abono y el MISMO lote; su parte es del backfill (06-oct) ⇒ «Liga anterior…». */
export const respuesta315 = (): ConciliacionDeEntrada => ({
  ...respuesta332(),
  entrada: entradaCobro({
    id: C315,
    etiqueta: "Vuelo #315",
    monto: 68205.55,
    neto: 68205.55,
    tc_usd_mxn: 17.15,
    cliente_nombre: "Beh Kay ",
    vuelo_id: VUELO_315,
    vuelo_folio: 315,
    cuenta_destino: "Scotiabank Pesos",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-09-24T22:19:27.067696+00:00",
  }),
  cobertura: {
    neto: 68205.55,
    monto_vinculado: 68205.55,
    faltante: 0,
    sobrante: 0,
    cubierto: true,
    abonos_n: 1,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [
    abono69183({
      via: "DIRECTO",
      monto_parte: 68205.55,
      moneda: "MXN",
      cruzada: false,
      tc_implicito: null,
      cuadre: null,
      registro: null,
      sin_registro: "ANTERIOR_AL_CORTE",
    }),
  ],
});

// ── D · #223 $812.00 USD «Sin conciliar» (Morena Mia), REAL ──

export const C223 = "d45a8387-e0f2-42ad-bcc7-226a45d1bbe0";

export const respuesta223 = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({
    id: C223,
    etiqueta: "Vuelo #223",
    dia: "2026-09-10",
    monto: 812,
    neto: 812,
    moneda: "USD",
    cliente_nombre: "Morena Mia",
    vuelo_id: "fb8c9f91-2beb-48e7-ba6b-3476d3b8587c",
    vuelo_folio: 223,
    cuenta_destino: "HSBC Dólares",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-09-17T21:14:16.291733+00:00",
  }),
  estado: "SIN_CONCILIAR",
  via: null,
  fuente: "PUENTE",
  cobertura: {
    neto: 812,
    monto_vinculado: 0,
    faltante: 812,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [],
  sobre: null,
  anticipo: null,
  alertas: [],
  ultimos_movimientos: ULTIMOS_PROD,
  mismo_dia_cliente: {
    cliente: "Morena Mia",
    dia: "2026-09-10",
    moneda: "USD",
    cobros: [
      { cobro_id: "3426fd35-ba04-4bc8-be7d-ed9a9f8e2775", vuelo_id: "3c8a63bf-ba67-45f9-a238-25525a80cce5", folio: 198, monto: 783, neto: 783 },
      { cobro_id: "7a3161a7-3169-4e10-aec2-b33c08edd2fe", vuelo_id: "c4e4673e-b6ae-4fd0-b987-cc9eaf5ee2f7", folio: 226, monto: 812, neto: 812 },
    ],
    n: 2,
    suma_netos: 2407,
  },
  cruce_no_corrio: null,
  varios_abonos_por_cobro: true,
});

/** #163 (Morena Mia, $910.60 USD, 19-ago): anterior a todo lo importado en USD. Respuesta armada con datos REALES. */
export const respuesta163 = (): ConciliacionDeEntrada => ({
  ...respuesta223(),
  entrada: entradaCobro({
    id: "931287d8-780c-44f3-84b9-824b61169681",
    etiqueta: "Vuelo #163",
    dia: "2026-08-19",
    monto: 910.6,
    neto: 910.6,
    moneda: "USD",
    cliente_nombre: "Morena Mia",
    vuelo_folio: 163,
    cuenta_destino: "HSBC Dólares",
  }),
  cobertura: {
    neto: 910.6,
    monto_vinculado: 0,
    faltante: 910.6,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  mismo_dia_cliente: null,
});

// ── E · PARCIAL (SINTÉTICO, 0.0.78: incidente Beh Kay antes de la corrección) ──

export const C3400 = "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d";
export const ABONO_1700_A = "32dd3b1d-0000-4a7b-8c9d-0e1f2a3b4c5d";
export const ABONO_1700_B = "a7e31d9d-0000-4a7b-8c9d-0e1f2a3b4c5d";

const abono1700 = (id: string, registro: AbonoDeEntrada["liga"]["registro"]): AbonoDeEntrada => ({
  movimiento_id: id,
  fecha: "2026-09-15",
  tipo: "ABONO",
  monto: 1700,
  moneda: "MXN",
  descripcion: "TRANSF INTERBANCARIA SPEI",
  referencia: null,
  conciliado: true,
  origen: "IMPORTADO",
  creado_at: "2026-10-06T15:22:46.58996+00:00",
  creado_por: "Alejandro Canales",
  orden_archivo: null,
  cuenta: CUENTA_EJE,
  estado_cuenta: {
    id: "1758cc58-7d78-4f73-966b-e7867803b8cc",
    filename: "scotia eje sep.pdf",
    formato: "pdf",
    importado_at: "2026-10-06T15:22:46.413405+00:00",
    importado_por: "Alejandro Canales",
    movimientos_importados: 98,
  },
  sin_archivo: null,
  monto_bruto: null,
  comision_pasarela: null,
  liga: {
    via: "DIRECTO",
    monto_parte: 1700,
    moneda: "MXN",
    cruzada: false,
    tc_implicito: null,
    cuadre: null,
    registro,
    sin_registro: null,
  },
  lote: null,
  notas_oficina: null,
});

export const respuestaParcial = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({
    id: C3400,
    etiqueta: "Vuelo #315",
    monto: 3400,
    neto: 3400,
    cliente_nombre: "Beh Kay ",
    vuelo_id: VUELO_315,
    vuelo_folio: 315,
    cuenta_destino: "Scotiabank Pesos",
  }),
  estado: "PARCIAL",
  via: "DIRECTO",
  fuente: "PUENTE",
  cobertura: {
    neto: 3400,
    monto_vinculado: 1700,
    faltante: 1700,
    sobrante: 0,
    cubierto: false,
    abonos_n: 1,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [abono1700(ABONO_1700_A, { por: "Diego Ramírez", at: "2026-10-14T21:21:49.025963+00:00" })],
  ...BASE_RESPUESTA,
  ultimos_movimientos: ULTIMOS_PROD,
  varios_abonos_por_cobro: true,
});

/** Con el SEGUNDO SPEI: conciliado con 2 abonos, cada uno con su registro (SINTÉTICO). */
export const respuestaDosAbonos = (): ConciliacionDeEntrada => ({
  ...respuestaParcial(),
  estado: "CONCILIADO",
  cobertura: {
    neto: 3400,
    monto_vinculado: 3400,
    faltante: 0,
    sobrante: 0,
    cubierto: true,
    abonos_n: 2,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [
    abono1700(ABONO_1700_A, { por: "Diego Ramírez", at: "2026-10-14T21:21:49.025963+00:00" }),
    abono1700(ABONO_1700_B, { por: "Alejandro Canales", at: "2026-10-13T16:51:24.805037+00:00" }),
  ],
  ultimos_movimientos: null,
});

// ── F · parte de un SOBRE ligado (SINTÉTICO: 0 sobres en prod) ──

export const respuestaSobre = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({ id: "5a5a5a5a-0000-4000-8000-000000000001", etiqueta: "Vuelo #401", monto: 2060.16, neto: 2060.16 }),
  estado: "CONCILIADO",
  via: "SOBRE",
  fuente: "COLUMNA",
  cobertura: null,
  abonos: [
    {
      ...abono1700("5b5b5b5b-0000-4000-8000-000000000001", null),
      monto: 10800.76,
      liga: {
        via: "SOBRE",
        monto_parte: null,
        moneda: "MXN",
        cruzada: false,
        tc_implicito: null,
        cuadre: null,
        registro: null,
        sin_registro: "NO_SE_GUARDA",
      },
    },
  ],
  ...BASE_RESPUESTA,
  sobre: {
    tipo: "SOBRE_GRUPO",
    cobro_grupo_id: "5c5c5c5c-0000-4000-8000-000000000001",
    grupo_id: "5d5d5d5d-0000-4000-8000-000000000001",
    grupo_folio: 4,
    grupo_nombre: "Boda Pérez",
    monto: 10800.76,
    moneda: "MXN",
    metodo: "TRANSFERENCIA",
    metodo_cobro: "TRANSFERENCIA",
    fecha: "2026-09-15T17:00:00+00:00",
    fecha_cobro: "2026-09-15T17:00:00+00:00",
    referencia: null,
    comision_banco_monto: null,
    neto: 10800.76,
    aviones_n: 3,
  },
});

/** La parte de un sobre SIN ligar (SINTÉTICO). */
export const respuestaSobreSinConciliar = (): ConciliacionDeEntrada => ({
  ...respuestaSobre(),
  estado: "SIN_CONCILIAR",
  via: null,
  abonos: [],
  ultimos_movimientos: ULTIMOS_PROD,
});

// ── G · cobro de un ANTICIPO (SINTÉTICO: 0 anticipos en prod) ──

export const ANTICIPO_ID = "6e6e6e6e-0000-4000-8000-000000000012";

export const respuestaAnticipo = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({ id: "6a6a6a6a-0000-4000-8000-000000000001", etiqueta: "Vuelo #402", monto: 20000, neto: 20000 }),
  estado: "VIA_ANTICIPO",
  via: "ANTICIPO",
  fuente: "COLUMNA",
  cobertura: null,
  abonos: [
    {
      ...abono1700("6b6b6b6b-0000-4000-8000-000000000001", null),
      monto: 50000,
      liga: {
        via: "ANTICIPO",
        monto_parte: null,
        moneda: "MXN",
        cruzada: false,
        tc_implicito: null,
        cuadre: null,
        registro: { por: "Alejandro Canales", at: "2026-10-12T22:57:32.606618+00:00" },
        sin_registro: null,
      },
    },
  ],
  ...BASE_RESPUESTA,
  anticipo: {
    ingreso_id: ANTICIPO_ID,
    etiqueta: "ING-12",
    monto: 50000,
    moneda: "MXN",
    dia: "2026-09-01",
    cuenta_bancaria_id: CUENTA_EJE.id,
    conciliado: true,
  },
});

/** El anticipo SIN conciliar (SINTÉTICO): el panel solo pinta la cuenta del anticipo. */
export const respuestaAnticipoSinConciliar = (): ConciliacionDeEntrada => ({
  ...respuestaAnticipo(),
  estado: "SIN_CONCILIAR",
  via: null,
  abonos: [],
  anticipo: { ...respuestaAnticipo().anticipo!, conciliado: false },
  ultimos_movimientos: ULTIMOS_PROD,
});

// ── H · ESPEJO (SINTÉTICO: BD sin 20261012000002) ──

export const respuestaEspejo = (): ConciliacionDeEntrada => ({
  ...respuesta332(),
  fuente: "ESPEJO",
  abonos: [
    {
      ...abono69183({
        via: "DIRECTO",
        monto_parte: 69183,
        moneda: "MXN",
        cruzada: false,
        tc_implicito: null,
        cuadre: null,
        registro: null,
        sin_registro: null,
      }),
      lote: null,
    },
  ],
});

// ── I · lotes del día y registro tardío (REALES) ──

export const C379 = "6a71d26c-c534-46e4-8953-956fa23c3da3";

/** #379 (Palma, $29,540.50, 06-oct): `mismo_dia_cliente` = #380 · suma $59,081.00. */
export const respuesta379 = (): ConciliacionDeEntrada => ({
  entrada: entradaCobro({
    id: C379,
    etiqueta: "Vuelo #379",
    dia: "2026-10-06",
    monto: 29540.5,
    neto: 29540.5,
    tc_usd_mxn: 18.189963,
    cliente_nombre: "Palma",
    vuelo_id: "9ebdb0dc-33d5-4d8c-a077-2357cc406e55",
    vuelo_folio: 379,
    cuenta_destino: "Scotiabank Pesos",
    registrado_por_nombre: "Alejandro Canales",
    registrado_at: "2026-10-07T16:18:42.540003+00:00",
  }),
  estado: "SIN_CONCILIAR",
  via: null,
  fuente: "PUENTE",
  cobertura: {
    neto: 29540.5,
    monto_vinculado: 0,
    faltante: 29540.5,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  abonos: [],
  sobre: null,
  anticipo: null,
  alertas: [],
  ultimos_movimientos: ULTIMOS_PROD,
  mismo_dia_cliente: {
    cliente: "Palma",
    dia: "2026-10-06",
    moneda: "MXN",
    cobros: [
      { cobro_id: "3924e3c4-ac1b-4eb4-bc01-2f387b7f7636", vuelo_id: "a1fec1ba-833a-417e-9324-bb2f1b7094bd", folio: 380, monto: 29540.5, neto: 29540.5 },
    ],
    n: 1,
    suma_netos: 59081,
  },
  cruce_no_corrio: null,
  varios_abonos_por_cobro: true,
});

/** #323 de ACP (22-sep): 3 cobros más ese día (#295, #296, #297) y la suma $6,873.00 USD. */
export const respuesta323 = (): ConciliacionDeEntrada => ({
  ...respuesta379(),
  entrada: entradaCobro({
    id: "4308757f-f811-4024-88a0-8b2415d5e521",
    etiqueta: "Vuelo #323",
    dia: "2026-09-22",
    monto: 2697,
    neto: 2697,
    moneda: "USD",
    cliente_nombre: "ACP",
    vuelo_id: "e20670f3-66cf-4a45-b0ab-9373512c912c",
    vuelo_folio: 323,
    cuenta_destino: "HSBC Dólares",
    registrado_por_nombre: "Alejandro Canales",
    registrado_at: "2026-09-24T21:35:29.644547+00:00",
  }),
  cobertura: {
    neto: 2697,
    monto_vinculado: 0,
    faltante: 2697,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  mismo_dia_cliente: {
    cliente: "ACP",
    dia: "2026-09-22",
    moneda: "USD",
    cobros: [
      { cobro_id: "5a651256-19f2-4ea8-a61c-682a60c2749b", vuelo_id: "72ca2c0d-274f-43c7-a1a7-a143e47b3de4", folio: 295, monto: 1392, neto: 1392 },
      { cobro_id: "c4143e99-295f-47d5-9534-a52a586ad621", vuelo_id: "a3cea311-702b-41b8-a1d5-26761e7459e2", folio: 296, monto: 1392, neto: 1392 },
      { cobro_id: "e8543fb6-26ea-4728-8422-2b0e1b886ad0", vuelo_id: "dc204a2f-6342-43f1-9406-f76dc1302b97", folio: 297, monto: 1392, neto: 1392 },
    ],
    n: 3,
    suma_netos: 6873,
  },
});

/** #383 (This Is Czm, $48,004.20, 08-oct): registrado 26 min DESPUÉS de importar «scotia eje.pdf». */
export const respuesta383 = (): ConciliacionDeEntrada => ({
  ...respuesta379(),
  entrada: entradaCobro({
    id: "f09f2120-a7f8-416b-983c-34b1b98c5b3b",
    etiqueta: "Vuelo #383",
    dia: "2026-10-08",
    monto: 48004.2,
    neto: 48004.2,
    tc_usd_mxn: 18.1903,
    cliente_nombre: "This Is Czm",
    vuelo_id: "137d80a6-b553-41bb-bbf2-834a391618b5",
    vuelo_folio: 383,
    cuenta_destino: "Scotiabank Pesos",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-10-08T18:43:29.809678+00:00",
  }),
  cobertura: {
    neto: 48004.2,
    monto_vinculado: 0,
    faltante: 48004.2,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  mismo_dia_cliente: null,
  cruce_no_corrio: { abonos_previos: 4, desde: "2026-10-05", hasta: "2026-10-11" },
});

/** #349 (Jacobo, $11,440.00, «Transferencia» con comisión $572.00 y cuenta capturada «Paywise», 25-sep). */
export const respuesta349 = (): ConciliacionDeEntrada => ({
  ...respuesta379(),
  entrada: entradaCobro({
    id: "b014ddbb-cebb-4e43-abcc-b1d28b1211e1",
    etiqueta: "Vuelo #349",
    dia: "2026-09-25",
    monto: 11440,
    comision: 572,
    neto: 10868,
    tc_usd_mxn: 17.6,
    cliente_nombre: "Jacobo Adrián Arzate Hop",
    vuelo_id: "43f64ec8-04c3-411d-a1eb-4f49accc9b77",
    vuelo_folio: 349,
    cuenta_destino: "Paywise",
    registrado_por_nombre: "Alejandro Canales",
    registrado_at: "2026-09-26T18:34:08.462162+00:00",
  }),
  cobertura: {
    neto: 10868,
    monto_vinculado: 0,
    faltante: 10868,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  mismo_dia_cliente: null,
  varios_abonos_por_cobro: false,
});

/** #375 (January Davila, HSBC_LINK $16,343.59 con comisión $625.64, 02-oct): «de un solo abono». */
export const respuesta375 = (): ConciliacionDeEntrada => ({
  ...respuesta379(),
  entrada: entradaCobro({
    id: "074ab922-ecc5-41b6-b408-428068658945",
    etiqueta: "Vuelo #375",
    dia: "2026-10-02",
    monto: 16343.59,
    comision: 625.64,
    neto: 15717.95,
    tc_usd_mxn: 18.069,
    metodo: "HSBC_LINK",
    metodo_etiqueta: "Link de pago (HSBC)",
    cliente_nombre: "January Davila",
    concepto: "Pago dos vuelos en uno, el otro es el 21 oct",
    vuelo_id: "423e468d-ffb8-4b87-a6da-d9b19e2e1d5f",
    vuelo_folio: 375,
    cuenta_destino: "HSBC Pesos",
    registrado_por_nombre: "Itzi",
    registrado_at: "2026-10-05T20:03:09.69733+00:00",
  }),
  cobertura: {
    neto: 15717.95,
    monto_vinculado: 0,
    faltante: 15717.95,
    sobrante: 0,
    cubierto: false,
    abonos_n: 0,
    cruzado: false,
    tolerancia: 1,
  },
  mismo_dia_cliente: {
    cliente: "January Davila",
    dia: "2026-10-02",
    moneda: "MXN",
    cobros: [
      { cobro_id: "3aca34ac-1ef9-448c-b484-dc88c854b95c", vuelo_id: "eb474572-8bda-469f-adca-db556f811d86", folio: 376, monto: 16343.59, neto: 15717.95 },
    ],
    n: 1,
    suma_netos: 31435.9,
  },
  varios_abonos_por_cobro: false,
});
