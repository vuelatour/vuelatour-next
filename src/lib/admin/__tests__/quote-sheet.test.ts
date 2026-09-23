import { describe, expect, it } from "vitest";
import {
  CANAL_CROMA_PX,
  ETIQUETA_BASE_GRAVABLE,
  ETIQUETA_SIN_IVA,
  ETIQUETA_SUBTOTAL,
  TOLERANCIA_USD,
  conceptoTua,
  descuentoImpresoUsd,
  etiquetaExtra,
  extraerMapaSvgDeHtml,
  fechaCorta,
  fechaCortaFlexible,
  fechaDia,
  fechaLegible,
  fechaLegibleDeInput,
  fechaLegibleFlexible,
  fechaVueloImpresa,
  fechasTrasladoImpresas,
  geometriaHoja,
  HOJA_ANCHO_PX,
  horasTramoTexto,
  modelosCotizadosPdf,
  moneyPdf,
  numeroG,
  particionarPorIva,
  puntosRutaVisibles,
  rutaFontSize,
  servicioAereoImpresoUsd,
  porcentajeEntero,
  subtotalSinIvaUsd,
  tramoCalculado,
  tramosParaMapa,
  tramosVisibles,
  tuasDetalleLegado,
} from "@/lib/admin/quote-sheet";
import type { QuoteBreakdown, TramoBreakdown } from "@/types/quote";

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
    expect(r.inicial).toEqual({ texto: "20/11/2026 06:00", tramoIdx: null, valor: "2026-11-20T06:00" });
    expect(r.final).toEqual({ texto: "23/11/2026 12:00", tramoIdx: null, valor: "2026-11-23T12:00" });
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
    expect(fechasTrasladoImpresas(base, oc).final).toEqual({
      texto: "22/11/2026 09:00",
      tramoIdx: 1,
      valor: "2026-11-22T09:00",
    });
    // Sin plan propio: el visible no es primero ni último → cae a la fecha del vuelo.
    const sinPlan = { ...base, escalas: base.escalas.map((e) => ({ ...e, fecha_salida_plan: undefined })) };
    expect(fechasTrasladoImpresas(sinPlan, oc).final).toEqual({
      texto: "23/11/2026 12:00",
      tramoIdx: null,
      valor: "2026-11-23T12:00",
    });
    // Primer tramo oculto y el único visible es el último: hereda la fecha final.
    const soloUltimo = {
      ...base,
      escalas: [
        { origen_iata: "CUN", destino_iata: "MID", millas_nauticas: 1, pdf_oculto: true },
        { origen_iata: "MID", destino_iata: "CUN", millas_nauticas: 1 },
      ],
    };
    expect(fechasTrasladoImpresas(soloUltimo, oc).inicial).toEqual({
      texto: "23/11/2026 12:00",
      tramoIdx: 1,
      valor: "2026-11-23T12:00",
    });
  });

  /**
   * «Fecha del vuelo» de `.meta` (15-sep-2026): espejo de `_fecha_corta` /
   * `_fecha_vuelo_html` de pyservices. Sin hora, día de PARED de Cancún.
   */
  it("fechaCorta: ISO → día de pared en Cancún, sin hora", () => {
    // 02:30 UTC del 16 es todavía el 15 en Cancún (UTC−5).
    expect(fechaCorta("2026-09-16T02:30:00Z")).toBe("15/09/2026");
    expect(fechaCorta("2026-09-15T21:00:00Z")).toBe("15/09/2026");
    // Un día suelto YA es pared: no pasa por la zona (no retrocede un día).
    expect(fechaCorta("2026-09-15")).toBe("15/09/2026");
    // Sin dato → "" (la línea no se pinta; jamás «Por confirmar»).
    expect(fechaCorta(null)).toBe("");
    expect(fechaCorta("")).toBe("");
    expect(fechaCorta("   ")).toBe("");
    // Sin zona se asume UTC (como `_fecha_corta`), nunca la del navegador.
    expect(fechaCorta("2026-09-16T02:30:00")).toBe("15/09/2026");
    expect(fechaCorta("2026-09-16T02:30")).toBe("15/09/2026");
    // No parseable → tal cual (React lo escapa).
    expect(fechaCorta("por confirmar")).toBe("por confirmar");
  });

  it("fechaCortaFlexible: el datetime-local de pared no se convierte", () => {
    expect(fechaCortaFlexible("2026-09-12T08:00")).toBe("12/09/2026");
    // Pared 23:00 del 12: si se tratara como UTC caería el 12 a las 18:00…
    // pero como ISO con Z el 13T02:30 sí es el 12 en Cancún.
    expect(fechaCortaFlexible("2026-09-12T23:00")).toBe("12/09/2026");
    expect(fechaCortaFlexible("2026-09-13T02:30:00Z")).toBe("12/09/2026");
    expect(fechaCortaFlexible("")).toBe("");
  });

  it("fechaVueloImpresa: un día, rango en dos días, nada sin fecha", () => {
    const t = (inicial: string, final: string) => ({ inicial: { valor: inicial }, final: { valor: final } });
    expect(fechaVueloImpresa(t("2026-09-15T16:00", "2026-09-15T20:00"))).toEqual({
      etiqueta: "Fecha del vuelo",
      texto: "15/09/2026",
    });
    expect(fechaVueloImpresa(t("2026-09-15T13:00", "2026-09-17T18:00"))).toEqual({
      etiqueta: "Fechas del vuelo",
      texto: "15/09/2026 – 17/09/2026",
    });
    // Solo salida (regreso «Por confirmar» en el form): singular.
    expect(fechaVueloImpresa(t("2026-12-05T08:00", ""))).toEqual({
      etiqueta: "Fecha del vuelo",
      texto: "05/12/2026",
    });
    // Sin salida no hay línea, aunque haya regreso (la fuente es la inicial).
    expect(fechaVueloImpresa(t("", ""))).toBeNull();
    expect(fechaVueloImpresa(t("", "2026-09-17T18:00"))).toBeNull();
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

describe("horas por tramo (feedback 9-sep-2026: solo se pintan, nunca se calculan)", () => {
  const tramo = (orden: number, origen: string, destino: string, tiempo_hr: number): TramoBreakdown =>
    ({ orden, origen, destino, millas: 60, pasajeros: 4, es_ferry: false, tiempo_hr, tuas_usd: 0 }) as TramoBreakdown;
  const tramos = [tramo(1, "CUN", "HOL", 0.4833), tramo(2, "HOL", "CZM", 0.5944)];

  it("tramoCalculado: mismo índice y mismos extremos; si no, null (breakdown atrasado)", () => {
    expect(tramoCalculado(tramos, 0, { origen_iata: "CUN", destino_iata: "HOL" })?.tiempo_hr).toBe(0.4833);
    expect(tramoCalculado(tramos, 1, { origen_iata: "HOL", destino_iata: "CZM" })?.orden).toBe(2);
    // Fila nueva sin cálculo todavía.
    expect(tramoCalculado(tramos, 2, { origen_iata: "CZM", destino_iata: "CUN" })).toBeNull();
    // Tramo quitado: el índice ya apunta a otro tramo → no se atribuyen sus horas.
    expect(tramoCalculado(tramos, 0, { origen_iata: "HOL", destino_iata: "CZM" })).toBeNull();
    // El motor devuelve IATA en mayúsculas: lo capturado se compara sin distinguirlas.
    expect(tramoCalculado(tramos, 0, { origen_iata: "cun", destino_iata: " hol " })?.orden).toBe(1);
    expect(tramoCalculado(null, 0, { origen_iata: "CUN", destino_iata: "HOL" })).toBeNull();
    expect(tramoCalculado(undefined, 0, { origen_iata: "CUN", destino_iata: "HOL" })).toBeNull();
  });

  it("horasTramoTexto: «1.20 h» a 2 decimales; sin cálculo «—»", () => {
    expect(horasTramoTexto({ tiempo_hr: 1.2 })).toBe("1.20 h");
    expect(horasTramoTexto({ tiempo_hr: 0.4833 })).toBe("0.48 h");
    expect(horasTramoTexto(null)).toBe("—");
    expect(horasTramoTexto(undefined)).toBe("—");
  });
});

/**
 * CONCEPTOS SIN IVA DEBAJO DEL IVA (22-sep-2026). `particionarPorIva` es el
 * port EXACTO de la función homónima de `cotizacion_pdf.py`: los dos
 * documentos (hoja del panel y PDF del cliente) tienen que decidir lo MISMO
 * con los mismos umbrales, o la pantalla y el papel divergen. Aquí se
 * congelan los DOS escenarios pedidos —con y sin exentos— y la degradación.
 */
describe("particionarPorIva = particionar_por_iva de pyservices", () => {
  /** Etiqueta de la fila: aquí basta un string (en la hoja es un ReactNode). */
  const ln = (fila: string, montoUsd: number, exento = false) => ({ montoUsd, exento, fila });
  const etiquetas = (ls: Array<{ fila: string }>) => ls.map((l) => l.fila);

  /** El caso del fixture `hoja-sin-iva`: 4,000 gravables + 640 IVA + 250 exentos. */
  const CON_EXENTOS = [
    ln("Servicio aéreo", 3700),
    ln("TUA CUN", 100),
    ln("Handler", 200),
    ln("Transfers", 100, true),
    ln("Viáticos por pernocta", 150, true),
  ];

  it("CON exentos: base gravable, exentos abajo y orden conservado dentro de cada grupo", () => {
    const p = particionarPorIva(CON_EXENTOS, 4000, 640, 4890);
    expect(p.activa).toBe(true);
    expect(p.baseUsd).toBe(4000);
    expect(etiquetas(p.gravables)).toEqual(["Servicio aéreo", "TUA CUN", "Handler"]);
    expect(etiquetas(p.exentos)).toEqual(["Transfers", "Viáticos por pernocta"]);
  });

  it("SIN exentos: inactiva, todas las filas en su orden original y base 0", () => {
    const lineas = [ln("Servicio aéreo", 4200), ln("TUA CUN", 150)];
    const p = particionarPorIva(lineas, 4350, 696, 5046);
    expect(p.activa).toBe(false);
    expect(etiquetas(p.gravables)).toEqual(["Servicio aéreo", "TUA CUN"]);
    expect(p.exentos).toEqual([]);
    expect(p.baseUsd).toBe(0);
  });

  it("IVA 0 (efectivo): los exentos NO se mueven — «Subtotal (sin IVA)» sigue siendo verdad", () => {
    const p = particionarPorIva(
      [ln("Servicio aéreo", 8580), ln("TUA CUN", 75), ln("Viáticos por pernocta", 300, true)],
      8655,
      0,
      8955,
    );
    expect(p.activa).toBe(false);
    expect(etiquetas(p.gravables)).toEqual(["Servicio aéreo", "TUA CUN", "Viáticos por pernocta"]);
  });

  it("exento en $0 (o medio centavo): cuenta como gravable y se queda donde está", () => {
    const p = particionarPorIva(
      [ln("Servicio aéreo", 4000), ln("Cortesía", 0, true), ln("Transfers", 0.004, true)],
      4000,
      640,
      4640.004,
    );
    expect(p.activa).toBe(false);
    expect(etiquetas(p.gravables)).toEqual(["Servicio aéreo", "Cortesía", "Transfers"]);
  });

  it("base DERIVADA cuando no viaja (snapshot legado): total − IVA − Σ exentos", () => {
    for (const sinBase of [null, undefined, Number.NaN]) {
      // Derivada ⇒ hay que verificarla contra el PORCENTAJE: 16 % de 4,000 = 640.
      const p = particionarPorIva(CON_EXENTOS, sinBase, 640, 4890, 16);
      expect(p.activa).toBe(true);
      expect(p.baseUsd).toBeCloseTo(4000, 6);
    }
  });

  it("base DERIVADA que NO es la base del % del IVA: degrada (redondeo post-IVA)", () => {
    // Espejo EXACTO de `test_base_derivada_se_verifica_contra_el_porcentaje_de_iva`
    // de pyservices. Sin `iva.base_usd` las otras dos identidades se cumplen
    // por construcción, así que sin este candado se rotularía «Subtotal
    // gravable» un número cuyo 16 % no es el IVA impreso.
    const conRedondeo = [ln("Servicio aéreo", 3725.33), ln("Transfers", 100, true)];
    expect(particionarPorIva(conRedondeo, null, 594.67, 4420, 16).activa).toBe(false);
    // La misma columna, cuadrada: 16 % de 3,716.67 = 594.67.
    const cuadrada = [ln("Servicio aéreo", 3716.67), ln("Transfers", 100, true)];
    expect(particionarPorIva(cuadrada, null, 594.67, 4411.34, 16).activa).toBe(true);
    // Sin `ivaPct` (API viejo) no se rotula nada como base.
    expect(particionarPorIva(cuadrada, null, 594.67, 4411.34).activa).toBe(false);
    // Con la base EXPLÍCITA manda el campo: el porcentaje no se exige.
    expect(particionarPorIva(cuadrada, 3716.67, 594.67, 4411.34).activa).toBe(true);
  });

  it("DEGRADA si Σ gravables ≠ base (el AJUSTE que mezcla base y redondeo post-IVA)", () => {
    // 3,700 + 100 + 200 = 4,000 impresos arriba, pero la base del 16 % fue
    // 3,990: los $10 del redondeo se suman DESPUÉS del IVA.
    const p = particionarPorIva(CON_EXENTOS, 3990, 638.4, 4888.4);
    expect(p.activa).toBe(false);
    expect(etiquetas(p.gravables)).toEqual([
      "Servicio aéreo",
      "TUA CUN",
      "Handler",
      "Transfers",
      "Viáticos por pernocta",
    ]);
  });

  it("DEGRADA si base + IVA + Σ exentos ≠ total (columna que no suma)", () => {
    expect(particionarPorIva(CON_EXENTOS, 4000, 640, 5000).activa).toBe(false);
  });

  it("tolerancia: medio centavo cuadra, un centavo no", () => {
    expect(particionarPorIva(CON_EXENTOS, 4000.004, 640, 4890.004).activa).toBe(true);
    expect(particionarPorIva(CON_EXENTOS, 4000.01, 640, 4890.01).activa).toBe(false);
  });

  it("las etiquetas son el MISMO texto literal que imprime pyservices", () => {
    expect(ETIQUETA_BASE_GRAVABLE).toBe("Subtotal gravable");
    expect(ETIQUETA_SUBTOTAL).toBe("Subtotal (sin IVA)");
    expect(ETIQUETA_SIN_IVA).toBe("No causan IVA");
    expect(TOLERANCIA_USD).toBe(0.005);
  });
});

/**
 * GEOMETRÍA del papel en pantalla (pedido del cliente, 22-sep-2026 noche:
 * «se pierde el botón o la opción que está del lado izquierdo»). La croma que
 * vive FUERA del área impresa (`.cot-margen`: 🗑, ⋯ y las marcas del tramo)
 * tiene que caber SIEMPRE entre el borde del contenedor y el texto del papel,
 * a cualquier ancho. Lo que la aloja son dos cosas que se suman: el CANAL
 * (padding del escenario) y el padding propio del papel — y el papel escala,
 * así que el canal también.
 */
describe("geometriaHoja: la croma del margen nunca se corta", () => {
  // Padding izquierdo del papel en `cotizacion-*-pantalla.css`.
  const PAD_INTERNA = 45;
  const PAD_CLIENTE = 74;
  // Margen MÁS CARGADO que se ve de verdad (tramo 4 de la #232: ferry +
  // pernocta + servicio + nota + oculto), medido sobre el marcado — ver la
  // cuenta completa en `CANAL_CROMA_PX`.
  const MARGEN_INTERNA = 116;
  const MARGEN_CLIENTE = 116 + 36; // + botón de HORAS del tramo (solo cliente)

  const anchos = [320, 480, 640, 720, 816, 866, 888, 898, 920, 961, 1100, 1400];

  it("el papel nunca se sale por la derecha", () => {
    for (const anchoHoja of [HOJA_ANCHO_PX, 816]) {
      for (const w of anchos) {
        const { canal, escalaEfectiva } = geometriaHoja({ anchoDisponible: w, anchoHoja });
        expect(canal + anchoHoja * escalaEfectiva, `${anchoHoja}@${w}`).toBeLessThanOrEqual(w + 0.5);
      }
    }
  });

  it("el margen más cargado cabe en las DOS hojas, a cualquier ancho", () => {
    for (const [anchoHoja, pad, margen] of [
      [816, PAD_INTERNA, MARGEN_INTERNA],
      [HOJA_ANCHO_PX, PAD_CLIENTE, MARGEN_CLIENTE],
    ] as const) {
      for (const w of anchos) {
        const { canal, escalaEfectiva: s, anchoUtil } = geometriaHoja({ anchoDisponible: w, anchoHoja });
        // Con la hoja a tamaño real, `margin: 0 auto` regala la mitad del
        // sobrante; sin escalar no hay sobrante que regalar.
        const centrado = s === 1 ? Math.max(0, (anchoUtil - anchoHoja) / 2) : 0;
        const disponible = canal + centrado + pad * s;
        expect(disponible, `${anchoHoja}@${w}`).toBeGreaterThanOrEqual(margen * s);
      }
    }
  });

  it("en LECTURA no hay canal (ahí la hoja ES el PDF y no se monta croma)", () => {
    const g = geometriaHoja({ anchoDisponible: 961, anchoHoja: 816, lectura: true });
    expect(g.canal).toBe(0);
    expect(g.escalaEfectiva).toBe(1);
  });

  it("una escala impuesta manda, y el canal la sigue", () => {
    const g = geometriaHoja({ anchoDisponible: 961, anchoHoja: 816, escala: 0.5 });
    expect(g.escalaEfectiva).toBe(0.5);
    expect(g.canal).toBe(Math.round(CANAL_CROMA_PX * 0.5));
  });

  it("sin medida todavía (SSR / primer render) ya reserva el canal", () => {
    // Si el canal apareciera DESPUÉS de medir, la croma saltaría de sitio al
    // hidratar — justo lo que el cliente describe como «se pierde el botón».
    expect(geometriaHoja({ anchoDisponible: 0, anchoHoja: 816 })).toEqual({
      canal: CANAL_CROMA_PX,
      escalaEfectiva: 1,
      anchoUtil: 0,
    });
    expect(geometriaHoja({ anchoDisponible: 0, anchoHoja: 816, lectura: true }).canal).toBe(0);
  });
});
