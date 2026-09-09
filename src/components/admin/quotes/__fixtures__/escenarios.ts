import type { QuoteSheetProps } from "@/components/admin/quotes/quote-sheet";
import type { QuoteBreakdown } from "@/types/quote";

/**
 * ESCENARIOS de la hoja editable: por cada `<nombre>.payload.json`
 * (`CotizacionPdfRequest` con el que pyservices generó `<nombre>.html`), las
 * props con las que `QuoteSheet` debe imprimir EXACTAMENTE lo mismo — los
 * valores del form (pared Cancún), el breakdown del motor (de donde sale
 * todo el dinero) y los catálogos. El test de fidelidad
 * (`__tests__/quote-sheet.test.tsx`) compara estructura y texto.
 *
 * Correspondencia payload ⇄ props que hay que mantener a mano:
 * - `fecha_traslado_*` ISO UTC ⇄ `fecha_vuelo`/`fecha_traslado_final` de pared
 *   Cancún (UTC−5), salvo cuando el PDF la toma de un tramo visible.
 * - `tuas_detalle` ⇄ `breakdown.tuas.filas` (mismo formato del motor).
 * - `subtotal_usd` = subtotal_vuelo + redondeo>0 + Σ COMISION_VENDEDOR;
 *   `descuento_usd` = |ajuste_final| si negativo; `iva_pct` = porcentaje×100.
 */

const AEROPUERTOS = [
  { iata: "CUN", nombre: "Cancún", latitud: 21.0365, longitud: -86.8771 },
  { iata: "HOL", nombre: "Holbox", latitud: 21.5216, longitud: -87.3796 },
  { iata: "CZM", nombre: "Cozumel", latitud: 20.5224, longitud: -86.9256 },
  { iata: "PCE", nombre: "Puerto Escondido", latitud: 15.8769, longitud: -97.0892 },
  { iata: "MID", nombre: "Mérida", latitud: 20.937, longitud: -89.6577 },
  { iata: "VSA", nombre: "Villahermosa", latitud: 17.997, longitud: -92.8174 },
  { iata: "MEX", nombre: "Ciudad de México", latitud: 19.4363, longitud: -99.0721 },
];

const AERONAVES = [
  { id: "a1", matricula: "XA-VGV", modelo: "Piper Seneca V", asientos: 6 },
  { id: "a2", matricula: "XA-ABC", modelo: "Cessna Grand Caravan", asientos: 9 },
  { id: "a3", matricula: "XA-KOD", modelo: "Kodiak 100", asientos: 8 },
];

const CLIENTES = [
  { id: "c1", nombre: "Cliente Demo S.A." },
  { id: "c2", nombre: "Viajes Península & Cía." },
  { id: "c3", nombre: "Grupo Mérida" },
  { id: "c4", nombre: "Broker Riviera" },
];

const tua = (iata: string, montoPax: number, pax: number, moneda: "USD" | "MXN" = "USD", tc: number | null = null) => {
  const totalNativo = Math.round(montoPax * pax * 100) / 100;
  const usdPax = moneda === "MXN" && tc ? Math.round((montoPax / tc) * 100) / 100 : montoPax;
  return {
    iata,
    aplica: true,
    moneda,
    monto_pax: montoPax,
    usd_pax: usdPax,
    pax,
    total_nativo: totalNativo,
    total_usd: moneda === "MXN" && tc ? Math.round((totalNativo / tc) * 100) / 100 : totalNativo,
    tc_aplicado: moneda === "MXN" ? tc : null,
    razon: "catálogo",
  };
};

const airport = (iata: string, aplica: boolean, usdPax = 0) => ({
  iata,
  aplica,
  usd_pax: usdPax,
  monto_pax: usdPax,
  moneda: "USD" as const,
  razon: aplica ? "catálogo" : "exento",
});

// ===== hoja1: VGV con matrícula, tarifa/hr visible, 1 TUA, extra USD,
// pernocta, descuento, MXN, fecha por tramo, notas. =====
const breakdownHoja1 = {
  aeronave: { id: "a1", matricula: "XA-VGV", modelo: "Piper Seneca V", pais_registro: "MX", velocidad_crucero_kts: 180 },
  ruta: {
    id: null,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_base: 170,
    millas_nauticas_totales: 170,
    es_redondo_auto: false,
    num_aterrizajes: 3,
    escalas: null,
  },
  tiempos: { vuelo_hr: 2.2, calzos_hr: 0.2, cobrable_hr: 2.4 },
  tarifa: { tipo: "PUBLICO", usd_por_hora: 1650, proviene_de_override: false },
  tuas: {
    usd_pax_default: 25,
    pasajeros: 4,
    origen: airport("CUN", true, 25),
    destino: airport("CUN", true, 25),
    aeropuertos: [airport("CUN", true, 25), airport("HOL", false), airport("CZM", false)],
    filas: [tua("CUN", 25, 4)],
    total_usd: 100,
  },
  tramos: null,
  extras: [{ concepto: "Catering", monto_usd: 170, moneda: "USD", monto_nativo: 170, tc_aplicado: null, aplica_iva: true }],
  desglose: [
    { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo · 2.4 hr × $1650/hr", monto_usd: 4110 },
    { clave: "TUAS", concepto: "TUA CUN · $25.00 × 4 pax", monto_usd: 100 },
    { clave: "EXTRA", concepto: "Catering", monto_usd: 170 },
  ],
  iva: { aplica_por_metodo_pago: true, porcentaje: 0.16, base_usd: 4590, monto_usd: 734.4, nota: "" },
  totales: {
    subtotal_vuelo_usd: 4110,
    tuas_total_usd: 100,
    viaticos_pernocta_usd: 150,
    extras_total_usd: 170,
    ajuste_final_usd: -20,
    iva_usd: 734.4,
    total_usd: 5324.4,
    total_mxn: 96371.64,
  },
  meta: { calculado_at: "2026-09-08T14:00:00Z", version_motor: "1.3.1" },
} as unknown as QuoteBreakdown;

export function escenarioHoja1(): Omit<QuoteSheetProps, "mapaSvg"> {
  return {
    valores: {
      cliente_id: "c1",
      aeronave_id: "a1",
      pasajeros: 4,
      fecha_vuelo: "2026-09-12T08:00",
      fecha_traslado_final: "2026-09-12T18:00",
      escalas: [
        { origen_iata: "CUN", destino_iata: "HOL", millas_nauticas: 60, pdf_fecha: "2026-09-12" },
        { origen_iata: "HOL", destino_iata: "CZM", millas_nauticas: 80 },
        { origen_iata: "CZM", destino_iata: "CUN", millas_nauticas: 30, requiere_pernocta: true, pernocta_costo_usd: 150 },
      ],
      tuas_lineas: [],
      cobrar_tuas: true,
      extras: [{ concepto: "Catering", monto_usd: 170, moneda: "USD", aplica_iva: true }],
      descuento_usd: 20,
      iva_pct_override: null,
      tc_usd_mxn: 18.1,
      notas: "Sujeto a slot en CUN",
      pdf_mostrar_tarifa: true,
      pdf_mostrar_itinerario: true,
      es_externo: false,
      avion_externo_modelo: "",
      avion_externo_matricula: "",
    },
    onCambio: () => undefined,
    breakdown: breakdownHoja1,
    documento: {
      folio: "1042",
      fechaCotizacion: "2026-09-08T14:00:00Z",
      tipo: "REDONDO",
      clienteNombre: "Cliente Demo S.A.",
      modelosCotizados: ["Piper Seneca V"],
      matricula: "XA-VGV",
    },
    catalogos: { clientes: CLIENTES, aeronaves: AERONAVES, aeropuertos: AEROPUERTOS },
    tramosPdf: { onFechaPdfChange: () => undefined, onOcultoChange: () => undefined },
    escala: 1,
  };
}

// ===== hoja-normal: avión sin VGV (sin matrícula), 2 TUAS (USD + MXN),
// extra USD + extra MXN, descuento, Total MXN, tarifa/hr oculta, notas de
// dos líneas, sin fechas por tramo. =====
const breakdownNormal = {
  aeronave: { id: "a2", matricula: "XA-ABC", modelo: "Cessna Grand Caravan", pais_registro: "MX", velocidad_crucero_kts: 170 },
  ruta: {
    id: null,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_base: 960,
    millas_nauticas_totales: 960,
    es_redondo_auto: false,
    num_aterrizajes: 2,
    escalas: null,
  },
  tiempos: { vuelo_hr: 3.2, calzos_hr: 0.3, cobrable_hr: 3.5 },
  tarifa: { tipo: "PUBLICO", usd_por_hora: 1200, proviene_de_override: false },
  tuas: {
    usd_pax_default: 25,
    pasajeros: 6,
    origen: airport("CUN", true, 25),
    destino: airport("CUN", true, 25),
    aeropuertos: [airport("CUN", true, 25), { ...airport("PCE", true, 18.27), monto_pax: 330.6, moneda: "MXN", tc_aplicado: 18.1 }],
    filas: [tua("CUN", 25, 6), tua("PCE", 330.6, 6, "MXN", 18.1)],
    total_usd: 259.59,
    total_mxn_nativo: 1983.6,
  },
  tramos: null,
  extras: [
    { concepto: "Catering", monto_usd: 200, moneda: "USD", monto_nativo: 200, tc_aplicado: null, aplica_iva: true },
    { concepto: "Transporte terrestre", monto_usd: 82.87, moneda: "MXN", monto_nativo: 1500, tc_aplicado: 18.1, aplica_iva: true },
  ],
  desglose: [
    { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo · 3.5 hr × $1200/hr", monto_usd: 4200 },
    { clave: "TUAS", concepto: "TUA CUN · $25.00 × 6 pax", monto_usd: 150 },
    { clave: "TUAS", concepto: "TUA PCE · $330.60 MXN × 6 pax = $1983.60 MXN", monto_usd: 109.59 },
    { clave: "EXTRA", concepto: "Catering", monto_usd: 200 },
    { clave: "EXTRA", concepto: "Transporte terrestre · $1500.00 MXN", monto_usd: 82.87 },
    { clave: "AJUSTE", concepto: "Descuento", monto_usd: -50 },
    { clave: "IVA", concepto: "IVA 16%", monto_usd: 750.79 },
  ],
  iva: { aplica_por_metodo_pago: true, porcentaje: 0.16, base_usd: 4692.46, monto_usd: 750.79, nota: "" },
  totales: {
    subtotal_vuelo_usd: 4200,
    tuas_total_usd: 259.59,
    viaticos_pernocta_usd: 0,
    extras_total_usd: 282.87,
    ajuste_final_usd: -50,
    iva_usd: 750.79,
    total_usd: 5443.25,
    total_mxn: 98522.83,
    mxn_nativos: 3483.6,
  },
  meta: { calculado_at: "2026-09-08T20:30:00Z", version_motor: "1.3.1" },
} as unknown as QuoteBreakdown;

export function escenarioNormal(): Omit<QuoteSheetProps, "mapaSvg"> {
  return {
    valores: {
      cliente_id: "c2",
      aeronave_id: "a2",
      pasajeros: 6,
      fecha_vuelo: "2026-10-01T07:00",
      fecha_traslado_final: "2026-10-01T19:30",
      escalas: [
        { origen_iata: "CUN", destino_iata: "PCE", millas_nauticas: 480 },
        { origen_iata: "PCE", destino_iata: "CUN", millas_nauticas: 480 },
      ],
      tuas_lineas: [],
      cobrar_tuas: true,
      extras: [
        { concepto: "Catering", monto_usd: 200, moneda: "USD", aplica_iva: true },
        { concepto: "Transporte terrestre", monto_usd: 1500, moneda: "MXN", aplica_iva: true },
      ],
      descuento_usd: 50,
      iva_pct_override: null,
      tc_usd_mxn: 18.1,
      notas: "Incluye espera en PCE.\nSujeto a disponibilidad de slot.",
      pdf_mostrar_tarifa: false,
      pdf_mostrar_itinerario: true,
      es_externo: false,
      avion_externo_modelo: "",
      avion_externo_matricula: "",
    },
    onCambio: () => undefined,
    breakdown: breakdownNormal,
    documento: {
      folio: "1043",
      fechaCotizacion: "2026-09-08T20:30:00Z",
      tipo: "MULTIESCALA",
      clienteNombre: "Viajes Península & Cía.",
      modelosCotizados: ["Cessna Grand Caravan"],
      matricula: "XA-ABC",
    },
    catalogos: { clientes: CLIENTES, aeronaves: AERONAVES, aeropuertos: AEROPUERTOS },
    tramosPdf: { onFechaPdfChange: () => undefined, onOcultoChange: () => undefined },
    escala: 1,
  };
}

// ===== hoja-multidia: 4 tramos con el ÚLTIMO oculto (ferry de regreso que
// el cliente no ve): la fecha de traslado final impresa es la salida
// planeada del último tramo VISIBLE, no la del vuelo; fechas por tramo (la
// del oculto jamás se imprime); tarifa/hr visible; viáticos; IVA 0 %; sin
// descuento, sin MXN, sin notas. =====
const breakdownMultidia = {
  aeronave: { id: "a3", matricula: "XA-KOD", modelo: "Kodiak 100", pais_registro: "MX", velocidad_crucero_kts: 165 },
  ruta: {
    id: null,
    origen_iata: "CUN",
    destino_iata: "CUN",
    millas_nauticas_base: 730,
    millas_nauticas_totales: 730,
    es_redondo_auto: false,
    num_aterrizajes: 4,
    escalas: null,
  },
  tiempos: { vuelo_hr: 4.6, calzos_hr: 0.6, cobrable_hr: 5.2 },
  tarifa: { tipo: "PUBLICO", usd_por_hora: 1650, proviene_de_override: false },
  tuas: {
    usd_pax_default: 25,
    pasajeros: 3,
    origen: airport("CUN", true, 25),
    destino: airport("CUN", true, 25),
    aeropuertos: [airport("CUN", true, 25), airport("MID", false), airport("VSA", false)],
    filas: [tua("CUN", 25, 3)],
    total_usd: 75,
  },
  tramos: null,
  extras: null,
  desglose: [
    { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo · 5.2 hr × $1650/hr", monto_usd: 8580 },
    { clave: "TUAS", concepto: "TUA CUN · $25.00 × 3 pax", monto_usd: 75 },
    { clave: "VIATICOS", concepto: "Viáticos por pernocta (sin IVA)", monto_usd: 300 },
  ],
  iva: { aplica_por_metodo_pago: false, porcentaje: 0, base_usd: 8655, monto_usd: 0, nota: "Efectivo: sin IVA" },
  totales: {
    subtotal_vuelo_usd: 8580,
    tuas_total_usd: 75,
    viaticos_pernocta_usd: 300,
    extras_total_usd: 0,
    ajuste_final_usd: 0,
    iva_usd: 0,
    total_usd: 8955,
    total_mxn: null,
  },
  meta: { calculado_at: "2026-09-09T03:15:00Z", version_motor: "1.3.1" },
} as unknown as QuoteBreakdown;

export function escenarioMultidia(): Omit<QuoteSheetProps, "mapaSvg"> {
  return {
    valores: {
      cliente_id: "c3",
      aeronave_id: "a3",
      pasajeros: 3,
      fecha_vuelo: "2026-11-20T06:00",
      // La del VUELO (el regreso oculto llega el 23); el PDF imprime la
      // salida del tramo 3 (22/11 09:00) porque el tramo 4 está oculto.
      fecha_traslado_final: "2026-11-23T12:00",
      escalas: [
        { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 155, pdf_fecha: "2026-11-20" },
        { origen_iata: "MID", destino_iata: "VSA", millas_nauticas: 210, requiere_pernocta: true, pernocta_costo_usd: 150 },
        {
          origen_iata: "VSA",
          destino_iata: "MID",
          millas_nauticas: 210,
          requiere_pernocta: true,
          pernocta_costo_usd: 150,
          fecha_salida_plan: "2026-11-22T09:00",
          pdf_fecha: "2026-11-22",
        },
        { origen_iata: "MID", destino_iata: "CUN", millas_nauticas: 155, es_ferry: true, pdf_oculto: true, pdf_fecha: "2026-11-23" },
      ],
      tuas_lineas: [],
      cobrar_tuas: true,
      extras: [],
      descuento_usd: null,
      iva_pct_override: null,
      tc_usd_mxn: null,
      notas: "",
      pdf_mostrar_tarifa: true,
      pdf_mostrar_itinerario: true,
      es_externo: false,
      avion_externo_modelo: "",
      avion_externo_matricula: "",
    },
    onCambio: () => undefined,
    breakdown: breakdownMultidia,
    documento: {
      folio: "1044",
      fechaCotizacion: "2026-09-09T03:15:00Z",
      tipo: "MULTIESCALA",
      clienteNombre: "Grupo Mérida",
      modelosCotizados: ["Kodiak 100"],
      matricula: "XA-KOD",
    },
    catalogos: { clientes: CLIENTES, aeronaves: AERONAVES, aeropuertos: AEROPUERTOS },
    tramosPdf: { onFechaPdfChange: () => undefined, onOcultoChange: () => undefined },
    escala: 1,
  };
}

// ===== hoja-externo: cubierto por operador EXTERNO (ficha «MODELO ·
// MATRÍCULA» bajo la ruta; la matrícula VGV de referencia NO se imprime y
// no hay línea «Aeronave cotizada»), 1 pasajero, «La ruta» (itinerario
// oculto, solo mapa), traslado final por confirmar, sin TUAS/extras/MXN. =====
const breakdownExterno = {
  aeronave: { id: "a1", matricula: "XA-VGV", modelo: "Piper Seneca V", pais_registro: "MX", velocidad_crucero_kts: 180 },
  ruta: {
    id: null,
    origen_iata: "CUN",
    destino_iata: "MEX",
    millas_nauticas_base: 700,
    millas_nauticas_totales: 700,
    es_redondo_auto: false,
    num_aterrizajes: 1,
    escalas: null,
  },
  tiempos: { vuelo_hr: 2.85, calzos_hr: 0.15, cobrable_hr: 3 },
  tarifa: { tipo: "CUSTOM", usd_por_hora: 2000, proviene_de_override: true },
  tuas: {
    usd_pax_default: 25,
    pasajeros: 1,
    origen: airport("CUN", false),
    destino: airport("MEX", false),
    aeropuertos: [],
    filas: [],
    total_usd: 0,
  },
  tramos: null,
  extras: null,
  desglose: [
    { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo · 3 hr × $2000/hr", monto_usd: 6000 },
    { clave: "IVA", concepto: "IVA 16%", monto_usd: 960 },
  ],
  iva: { aplica_por_metodo_pago: true, porcentaje: 0.16, base_usd: 6000, monto_usd: 960, nota: "" },
  totales: {
    subtotal_vuelo_usd: 6000,
    tuas_total_usd: 0,
    viaticos_pernocta_usd: 0,
    extras_total_usd: 0,
    ajuste_final_usd: 0,
    iva_usd: 960,
    total_usd: 6960,
    total_mxn: null,
  },
  meta: { calculado_at: "2026-09-08T16:45:00Z", version_motor: "1.3.1" },
} as unknown as QuoteBreakdown;

export function escenarioExterno(): Omit<QuoteSheetProps, "mapaSvg"> {
  return {
    valores: {
      cliente_id: "c4",
      aeronave_id: "a1",
      pasajeros: 1,
      fecha_vuelo: "2026-12-05T08:00",
      fecha_traslado_final: "",
      escalas: [{ origen_iata: "CUN", destino_iata: "MEX", millas_nauticas: 700 }],
      tuas_lineas: [],
      cobrar_tuas: true,
      extras: [],
      descuento_usd: null,
      iva_pct_override: null,
      tc_usd_mxn: null,
      notas: "",
      pdf_mostrar_tarifa: false,
      pdf_mostrar_itinerario: false,
      es_externo: true,
      avion_externo_modelo: "HAWKER 400 A",
      avion_externo_matricula: "XA-REG",
    },
    onCambio: () => undefined,
    breakdown: breakdownExterno,
    documento: {
      folio: "1045",
      fechaCotizacion: "2026-09-08T16:45:00Z",
      tipo: "SENCILLO",
      clienteNombre: "Broker Riviera",
      modelosCotizados: ["HAWKER 400 A"],
      matricula: "XA-VGV",
    },
    catalogos: { clientes: CLIENTES, aeronaves: AERONAVES, aeropuertos: AEROPUERTOS },
    tramosPdf: { onFechaPdfChange: () => undefined, onOcultoChange: () => undefined },
    escala: 1,
  };
}

/** Nombre del fixture → escenario (props sin `mapaSvg`, que sale del HTML). */
export const ESCENARIOS: Record<string, () => Omit<QuoteSheetProps, "mapaSvg">> = {
  hoja1: escenarioHoja1,
  "hoja-normal": escenarioNormal,
  "hoja-multidia": escenarioMultidia,
  "hoja-externo": escenarioExterno,
};
