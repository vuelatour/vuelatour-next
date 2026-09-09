import { describe, expect, it } from "vitest";
import {
  conceptoTua,
  descuentoImpresoUsd,
  etiquetaExtra,
  extraerMapaSvgDeHtml,
  fechaDia,
  fechaLegible,
  fechaLegibleDeInput,
  fechaLegibleFlexible,
  fechasTrasladoImpresas,
  modelosCotizadosPdf,
  moneyPdf,
  numeroG,
  puntosRutaVisibles,
  rutaFontSize,
  servicioAereoImpresoUsd,
  porcentajeEntero,
  subtotalSinIvaUsd,
  tramosParaMapa,
  tramosVisibles,
  tuasDetalleLegado,
} from "@/lib/admin/quote-sheet";
import type { QuoteBreakdown } from "@/types/quote";

describe("formatos idénticos al armador de pyservices", () => {
  it("moneyPdf = _money (en-US, 2 decimales)", () => {
    expect(moneyPdf(4110)).toBe("$4,110.00");
    expect(moneyPdf(96371.64)).toBe("$96,371.64");
    expect(moneyPdf(0)).toBe("$0.00");
    expect(moneyPdf("1650")).toBe("$1,650.00");
  });

  it("numeroG = Python :g", () => {
    expect(numeroG(2.4)).toBe("2.4");
    expect(numeroG(18.1)).toBe("18.1");
    expect(numeroG(1)).toBe("1");
    expect(numeroG(18.25)).toBe("18.25");
  });

  it("fechaLegible: ISO → dd/mm/aaaa HH:MM en hora Cancún; vacío → Por confirmar", () => {
    expect(fechaLegible("2026-09-12T13:00:00Z")).toBe("12/09/2026 08:00");
    expect(fechaLegible("2026-09-08T14:00:00Z")).toBe("08/09/2026 09:00");
    // Medianoche UTC = 19:00 del día anterior en Cancún.
    expect(fechaLegible("2026-09-13T00:30:00Z")).toBe("12/09/2026 19:30");
    expect(fechaLegible(null)).toBe("Por confirmar");
    expect(fechaLegible("")).toBe("Por confirmar");
    expect(fechaLegible("no-es-fecha")).toBe("no-es-fecha");
  });

  it("fechaLegibleDeInput: la pared Cancún del datetime-local, sin convertir", () => {
    expect(fechaLegibleDeInput("2026-09-12T08:00")).toBe("12/09/2026 08:00");
    expect(fechaLegibleDeInput("")).toBe("Por confirmar");
  });

  it("fechaDia = _fecha_dia (d mes aaaa, es-MX abreviado)", () => {
    expect(fechaDia("2026-09-03")).toBe("3 sep 2026");
    expect(fechaDia("2026-12-25")).toBe("25 dic 2026");
    expect(fechaDia(null)).toBe("");
    expect(fechaDia("")).toBe("");
  });

  it("rutaFontSize: 26/20/16 según los puntos", () => {
    expect(rutaFontSize(2)).toBe("26px");
    expect(rutaFontSize(4)).toBe("26px");
    expect(rutaFontSize(5)).toBe("20px");
    expect(rutaFontSize(6)).toBe("20px");
    expect(rutaFontSize(7)).toBe("16px");
  });

  it("conceptoTua reproduce el desglose canónico del motor", () => {
    expect(
      conceptoTua({ iata: "CUN", moneda: "USD", monto_pax: 25, pax: 4, total_nativo: 100 }),
    ).toBe("TUA CUN · $25.00 × 4 pax");
    expect(
      conceptoTua({ iata: "PCE", moneda: "MXN", monto_pax: 330.6, pax: 4, total_nativo: 1322.4 }),
    ).toBe("TUA PCE · $330.60 MXN × 4 pax = $1322.40 MXN");
  });

  it("etiquetaExtra: MXN agrega ' · $X MXN'", () => {
    expect(etiquetaExtra({ concepto: "Catering", moneda: "USD" })).toBe("Catering");
    expect(etiquetaExtra({ concepto: "Handler", moneda: "MXN", monto_nativo: 1500 })).toBe(
      "Handler · $1,500.00 MXN",
    );
    expect(etiquetaExtra({ concepto: "", moneda: "USD" })).toBe("Extra");
  });
});

describe("tramos visibles y mapa", () => {
  const legs = [
    { origen_iata: "CUN", destino_iata: "AZP", millas_nauticas: 100 },
    { origen_iata: "AZP", destino_iata: "BZE", millas_nauticas: 100, pdf_oculto: true },
    { origen_iata: "BZE", destino_iata: "CZM", millas_nauticas: 100, es_ferry: true },
    { origen_iata: "CZM", destino_iata: "CUN", millas_nauticas: 100 },
  ];
  const oculto = (_: number, l: { pdf_oculto?: boolean }) => l.pdf_oculto === true;

  it("renumera 1..N sin los ocultos y une la ruta con huecos", () => {
    const v = tramosVisibles(legs, oculto);
    expect(v.map((x) => [x.idx, x.orden])).toEqual([
      [0, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(puntosRutaVisibles(v)).toEqual(["CUN", "AZP", "BZE", "CZM", "CUN"]);
  });

  it("tramosParaMapa manda todas las filas con su bandera (el API filtra y renumera)", () => {
    expect(tramosParaMapa(legs, oculto)).toEqual([
      { origen_iata: "CUN", destino_iata: "AZP" },
      { origen_iata: "AZP", destino_iata: "BZE", pdf_oculto: true },
      { origen_iata: "BZE", destino_iata: "CZM", es_ferry: true },
      { origen_iata: "CZM", destino_iata: "CUN" },
    ]);
    // Tramos a medio capturar no viajan.
    expect(tramosParaMapa([{ origen_iata: "CUN", destino_iata: "", millas_nauticas: 0 }], oculto)).toEqual([]);
  });

  it("extraerMapaSvgDeHtml saca el <svg> del .mapa de la vista previa", () => {
    const html = '<div class="itin-mapa"><div class="mapa"><svg viewBox="0 0 1 1" xmlns="x"><path d="M0"/></svg></div></div>';
    expect(extraerMapaSvgDeHtml(html)).toBe('<svg viewBox="0 0 1 1" xmlns="x"><path d="M0"/></svg>');
    expect(extraerMapaSvgDeHtml("<h2>Itinerario</h2>")).toBeNull();
    expect(extraerMapaSvgDeHtml(null)).toBeNull();
  });
});

describe("derivados del desglose (misma composición que quotes-pdf.service)", () => {
  const b = {
    desglose: [{ clave: "COMISION_VENDEDOR", concepto: "Comisión", monto_usd: 100 }],
    meta: { calculado_at: "", version_motor: "1.3" },
    totales: {
      subtotal_vuelo_usd: 4000,
      tuas_total_usd: 0,
      ajuste_final_usd: 7.5,
      iva_usd: 640,
      total_usd: 4640,
    },
  } as unknown as QuoteBreakdown;

  it("servicio aéreo impreso = subtotal + redondeo>0 + Σ comisión", () => {
    expect(servicioAereoImpresoUsd(b)).toBe(4107.5);
    expect(servicioAereoImpresoUsd(null)).toBeNull();
  });

  it("descuento impreso = |ajuste| solo si fue negativo", () => {
    expect(descuentoImpresoUsd(b)).toBe(0);
    expect(
      descuentoImpresoUsd({ ...b, totales: { ...b.totales, ajuste_final_usd: -20 } } as QuoteBreakdown),
    ).toBe(20);
  });

  it("subtotal sin IVA = total − IVA", () => {
    expect(subtotalSinIvaUsd(b)).toBe(4000);
  });
});

describe("reglas del armador replicadas (fidelidad 8-sep-2026)", () => {
  it("porcentajeEntero = Python :.0f (half-even)", () => {
    expect(porcentajeEntero(16)).toBe("16");
    expect(porcentajeEntero(0)).toBe("0");
    expect(porcentajeEntero(16.5)).toBe("16");
    expect(porcentajeEntero(17.5)).toBe("18");
    expect(porcentajeEntero(8.2)).toBe("8");
  });

  it("fechaLegibleFlexible: pared Cancún directa, ISO convertido", () => {
    expect(fechaLegibleFlexible("2026-11-22T09:00")).toBe("22/11/2026 09:00");
    expect(fechaLegibleFlexible("2026-11-22T14:00:00Z")).toBe("22/11/2026 09:00");
    expect(fechaLegibleFlexible("")).toBe("Por confirmar");
  });

  it("modelosCotizadosPdf = _modelos_cotizados (trim, sin repetidos, sin matrícula)", () => {
    expect(modelosCotizadosPdf([" Piper Seneca V ", "piper seneca v", "XA-VGV", "", null, "Kodiak 100"], "xa-vgv")).toEqual([
      "Piper Seneca V",
      "Kodiak 100",
    ]);
    expect(modelosCotizadosPdf([], null)).toEqual([]);
  });

  it("fechasTrasladoImpresas: sin ocultos en los extremos son las del vuelo", () => {
    const r = fechasTrasladoImpresas(
      {
        fecha_vuelo: "2026-11-20T06:00",
        fecha_traslado_final: "2026-11-23T12:00",
        escalas: [
          { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 1 },
          { origen_iata: "MID", destino_iata: "CUN", millas_nauticas: 1, pdf_oculto: true },
          { origen_iata: "CUN", destino_iata: "HOL", millas_nauticas: 1 },
        ],
      },
      (_, l) => l.pdf_oculto === true,
    );
    expect(r.inicial).toEqual({ texto: "20/11/2026 06:00", tramoIdx: null });
    expect(r.final).toEqual({ texto: "23/11/2026 12:00", tramoIdx: null });
  });

  it("fechasTrasladoImpresas: último tramo oculto → salida planeada del último visible (cascada del API)", () => {
    const base = {
      fecha_vuelo: "2026-11-20T06:00",
      fecha_traslado_final: "2026-11-23T12:00",
      escalas: [
        { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 1 },
        { origen_iata: "MID", destino_iata: "VSA", millas_nauticas: 1, fecha_salida_plan: "2026-11-22T09:00" },
        { origen_iata: "VSA", destino_iata: "CUN", millas_nauticas: 1, pdf_oculto: true },
      ],
    };
    const oc = (_: number, l: { pdf_oculto?: boolean }) => l.pdf_oculto === true;
    expect(fechasTrasladoImpresas(base, oc).final).toEqual({ texto: "22/11/2026 09:00", tramoIdx: 1 });
    // Sin plan propio: el visible no es primero ni último → cae a la fecha del vuelo.
    const sinPlan = { ...base, escalas: base.escalas.map((e) => ({ ...e, fecha_salida_plan: undefined })) };
    expect(fechasTrasladoImpresas(sinPlan, oc).final).toEqual({ texto: "23/11/2026 12:00", tramoIdx: null });
    // Primer tramo oculto y el único visible es el último: hereda la fecha final.
    const soloUltimo = {
      ...base,
      escalas: [
        { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 1, pdf_oculto: true },
        { origen_iata: "MID", destino_iata: "CUN", millas_nauticas: 1 },
      ],
    };
    expect(fechasTrasladoImpresas(soloUltimo, oc).inicial).toEqual({ texto: "23/11/2026 12:00", tramoIdx: 1 });
  });

  it("tuasDetalleLegado: solo sin filas y con líneas TUAS del desglose", () => {
    const b = {
      tuas: { filas: undefined },
      desglose: [
        { clave: "TIEMPO_VUELO", concepto: "x", monto_usd: 1 },
        { clave: "TUAS", concepto: "TUA CUN · $25.00 × 4 pax", monto_usd: 100 },
      ],
    } as unknown as QuoteBreakdown;
    expect(tuasDetalleLegado(b)).toEqual(["TUA CUN · $25.00 × 4 pax"]);
    expect(tuasDetalleLegado({ ...b, tuas: { filas: [] } } as unknown as QuoteBreakdown)).toEqual([]);
    expect(tuasDetalleLegado(null)).toEqual([]);
  });
});
