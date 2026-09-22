import { describe, expect, it } from "vitest";
import {
  BANDA_INTERNA,
  GUION_RUTA,
  ROLES_HOJA_INTERNA,
  SIN_DATO,
  ajustePositivoUsd,
  avionCotizadoTxt,
  avionUtilizadoTxt,
  avisoCobrosSinTc,
  celdaRutaTramo,
  claseSemaforo,
  comisionVendedorCanonicaUsd,
  conceptoCanonico,
  conceptoComisionVendedor,
  diaLargo,
  diaMes,
  fechaCortaCobro,
  hayAjuste,
  hhmm,
  horasTxt,
  lineaCanonicaUsd,
  metodoPrevistoTxt,
  millasTxt,
  moneyInterno,
  montoInterno,
  motivoAjuste,
  notasTramos,
  opComisionVendedor,
  opTotalMxnInterna,
  pctBanco,
  pieTramos,
  piezasConceptoTuaInterna,
  puedeVerHojaInterna,
  resumenCobros,
  servicioAereoCanonicoUsd,
  subLineaCobro,
  tarifaFicha,
} from "@/lib/admin/quote-sheet-interna";
import type { QuoteBreakdown } from "@/types/quote";

/**
 * Helpers PUROS de la HOJA INTERNA (Fase 2.2, 22-sep-2026). Son el espejo de
 * los formatos de `cotizacion_interna_pdf.py`: si allá cambia uno, aquí falla
 * el test antes de que la pantalla y el papel digan dos cosas distintas del
 * MISMO vuelo. La paridad de punta a punta la custodian además los fixtures
 * (`__tests__/quote-sheet-interna.test.tsx`).
 */

describe("formatos del documento interno", () => {
  it("`_hhmm`: horas decimales → hh:mm", () => {
    expect(hhmm(1.3)).toBe("01:18");
    expect(hhmm(0.4)).toBe("00:24");
    expect(hhmm(0.45)).toBe("00:27");
    expect(hhmm(2.1)).toBe("02:06");
    expect(hhmm(0)).toBe("00:00");
    // Nunca negativo: un tiempo así sería un bug del motor, no algo que
    // inventar en la pantalla.
    expect(hhmm(-1)).toBe("00:00");
    expect(hhmm(null)).toBe(SIN_DATO);
  });

  it("`_millas`: sin ceros de cola", () => {
    expect(millasTxt(157)).toBe("157");
    expect(millasTxt(157.3)).toBe("157.3");
    expect(millasTxt(1234)).toBe("1,234");
    expect(millasTxt(null)).toBe(SIN_DATO);
  });

  it("`_horas`: dos decimales y su unidad", () => {
    expect(horasTxt(1.75)).toBe("1.75 h");
    expect(horasTxt(1.5)).toBe("1.50 h");
    expect(horasTxt(null)).toBe(SIN_DATO);
  });

  it("`_dia_mes` / `_dia_largo`: el día de PARED no se convierte", () => {
    expect(diaMes("2026-06-26")).toBe("26-jun");
    expect(diaLargo("2026-06-26")).toBe("26 jun 2026");
    expect(diaMes(null)).toBe(SIN_DATO);
    expect(diaLargo(null)).toBe("");
    // Un instante ISO sí se lleva a su día en Cancún (05:00Z del 27 = el 26).
    expect(diaMes("2026-06-27T04:00:00Z")).toBe("26-jun");
  });

  it("`_monto`: el negativo lleva el signo MENOS tipográfico, no un guion", () => {
    expect(montoInterno(2475)).toBe("$2,475.00");
    expect(montoInterno(-412.5)).toBe("−$412.50");
    expect(montoInterno(0)).toBe("$0.00");
    expect(moneyInterno(1650)).toBe("$1,650.00");
  });

  it("`_pct_banco`: 2 decimales, o 4 cuando los hay", () => {
    expect(pctBanco(2.9)).toBe("2.90 %");
    expect(pctBanco(8.857)).toBe("8.8570 %");
    expect(pctBanco(null)).toBe(SIN_DATO);
  });

  it("`_fecha_corta(con_anio)`: instante en hora Cancún, día de pared tal cual", () => {
    expect(fechaCortaCobro("2026-06-22T14:30:00Z")).toBe("22/06/2026 09:30");
    expect(fechaCortaCobro("2026-06-22")).toBe("22/06/2026");
    expect(fechaCortaCobro(null)).toBe(SIN_DATO);
  });
});

describe("celda RUTA de la tabla de tramos", () => {
  it("abre con la abreviatura y las marcas en gris, en la MISMA línea", () => {
    const c = celdaRutaTramo({
      ruta: "Cancun-Playa del Carmen",
      origen_iata: "CUN",
      destino_iata: "PCE",
      es_ferry: true,
      pernocta: true,
      pernocta_usd: 150,
    });
    expect(c.texto).toBe(`CUN${GUION_RUTA}PCE`);
    expect(c.marcas).toBe("ferry · pernocta $150.00");
  });

  /**
   * RIESGO 4 del diseño: promover la abreviatura sin respaldo dejaría SIN
   * ruta la fila consolidada o la que no trae los dos IATA.
   */
  it("sin los dos IATA o consolidada conserva el nombre largo", () => {
    expect(
      celdaRutaTramo({ ruta: "Cancun-Merida", origen_iata: "CUN", destino_iata: "" }).texto,
    ).toBe("Cancun-Merida");
    expect(
      celdaRutaTramo({
        ruta: "Cotización consolidada",
        origen_iata: "CUN",
        destino_iata: "CUN",
        consolidado: true,
      }).texto,
    ).toBe("Cotización consolidada");
    expect(
      celdaRutaTramo({ origen_iata: "CUN", destino_iata: "MID", origen_nombre: "Cancún", destino_nombre: "Mérida" })
        .largo,
    ).toBe("Cancún-Mérida");
    // Sin nada que decir, «—» — jamás una celda en blanco.
    expect(celdaRutaTramo({}).texto).toBe(SIN_DATO);
  });

  it("el guion es el LARGO (lo que ya está impreso en todas las cotizaciones)", () => {
    expect(GUION_RUTA).toBe("–");
    expect(celdaRutaTramo({ origen_iata: "CUN", destino_iata: "PCE" }).texto).not.toContain("-");
  });
});

describe("pie de la tabla: los números son del API, jamás de aquí", () => {
  const b = (extra: Partial<QuoteBreakdown>) => extra as QuoteBreakdown;

  it("con los ADITIVOS del API 0.0.27 se leen tal cual", () => {
    const pie = pieTramos(
      b({
        tramos_total_usd: 2475,
        tramos_tiempo_total_hhmm: "01:30",
        tramos_ajuste_usd: 412.5,
        tramos_ajuste_motivo: "Horas pactadas 1.75 h",
      }),
      [{ millas: 40 }, { millas: 90 }, { millas: 40 }],
      2887.5,
    );
    expect(pie.totalUsd).toBe(2475);
    expect(pie.tiempo).toBe("01:30");
    expect(pie.millas).toBe("170");
    expect(pie.hayAjuste).toBe(true);
    expect(pie.ajusteMotivo).toBe("Horas pactadas 1.75 h");
    expect(pie.servicioAereoUsd).toBe(2887.5);
  });

  /**
   * RIESGO 10 del diseño: con un API previo la columna TOTAL se deja vacía,
   * NUNCA se multiplica `tiempo × tarifa` en el panel (serían dos fuentes del
   * mismo número y pantalla y PDF podrían discrepar).
   */
  it("con un API previo no inventa el total ni el tiempo", () => {
    const pie = pieTramos(b({}), [{ millas: 40 }], null);
    expect(pie.totalUsd).toBeNull();
    expect(pie.tiempo).toBe(SIN_DATO);
    expect(pie.servicioAereoUsd).toBeNull();
    expect(pie.hayAjuste).toBe(false);
  });

  it("la Σ de MILLAS solo se re-suma si TODOS los tramos la traen", () => {
    expect(pieTramos(b({}), [{ millas: 40 }, { millas: null as unknown as number }], null).millas).toBe("");
    expect(pieTramos(b({}), [], null).millas).toBe("");
  });

  it("`_hay_ajuste`: medio centavo de tolerancia", () => {
    expect(hayAjuste(0.004)).toBe(false);
    expect(hayAjuste(-0.005)).toBe(true);
    expect(hayAjuste(null)).toBe(false);
    expect(motivoAjuste(null)).toBe("Ajuste de horas");
    expect(motivoAjuste("  Sobrevuelo 0.5 h ")).toBe("Sobrevuelo 0.5 h");
  });

  it("la nota al pie lleva los calzos y avisa de la fila consolidada", () => {
    expect(notasTramos(0.45, false)).toBe(
      "Tiempo de vuelo en hh:mm e incluye calzos (0.45 h en total) · distancia en millas náuticas.",
    );
    expect(notasTramos(null, true)).toContain("una sola fila con los totales");
  });
});

describe("desglose canónico (lo que el documento interno publica aparte)", () => {
  const conDesglose = (lineas: { clave: string; concepto: string; monto_usd: number }[]) =>
    ({
      desglose: lineas,
      totales: { subtotal_vuelo_usd: 999, ajuste_final_usd: 0 },
      meta: {},
    }) as unknown as QuoteBreakdown;

  it("«Servicio aéreo» es la línea TIEMPO_VUELO, no la composición del cliente", () => {
    const b = conDesglose([
      { clave: "TIEMPO_VUELO", concepto: "Tiempo de vuelo", monto_usd: 2887.5 },
      { clave: "COMISION_VENDEDOR", concepto: "Comisión", monto_usd: 165 },
    ]);
    expect(servicioAereoCanonicoUsd(b)).toBe(2887.5);
    expect(comisionVendedorCanonicaUsd(b)).toBe(165);
    expect(lineaCanonicaUsd(b, "AJUSTE")).toBeNull();
  });

  it("sin desglose cae al escalar espejo del motor", () => {
    const b = conDesglose([]);
    expect(servicioAereoCanonicoUsd(b)).toBe(999);
    expect(servicioAereoCanonicoUsd(null)).toBeNull();
  });

  it("el AJUSTE positivo se publica; el negativo es el DESCUENTO y tiene su renglón", () => {
    const pos = { totales: { ajuste_final_usd: 7.5 } } as unknown as QuoteBreakdown;
    const neg = { totales: { ajuste_final_usd: -200 } } as unknown as QuoteBreakdown;
    expect(ajustePositivoUsd(pos)).toBe(7.5);
    expect(ajustePositivoUsd(neg)).toBeNull();
    expect(ajustePositivoUsd(null)).toBeNull();
  });

  it("la operación de la comisión se arma con los números del motor", () => {
    expect(
      opComisionVendedor({ modo: "POR_HORA", horas: 2.4, tarifaHr: 50, pagoVendedorUsd: 139.2, conIva: true }),
    ).toBe("2.40 h × $50.00/hr · pago al vendedor c/IVA $139.20");
    expect(opComisionVendedor({ modo: "FIJA", pagoVendedorUsd: 100 })).toBe(
      "fija · pago al vendedor $100.00",
    );
    expect(opComisionVendedor({})).toBe("");
  });

  it("`_tua_fila`: «TUA CUN» + gris «4 pax × $25.00»", () => {
    const p = piezasConceptoTuaInterna({ iata: "CUN", pax: 4, moneda: "USD" });
    expect(p.concepto).toBe("TUA CUN");
    expect(p.antes).toBe("4 pax × $");
    expect(p.despues).toBe("");
    const mxn = piezasConceptoTuaInterna({
      iata: "PCE",
      pax: 4,
      moneda: "MXN",
      total_nativo: 1322.4,
      tc_aplicado: 18.1,
    });
    expect(mxn.despues).toBe(" MXN = $1,322.40 MXN");
  });
});

describe("ficha y cobros", () => {
  it("la matrícula SIEMPRE se ve en el documento interno", () => {
    expect(avionCotizadoTxt({ modelo: "Piper Seneca V", matricula: "XA-VGV" })).toBe(
      "Piper Seneca V · XA-VGV",
    );
    expect(avionCotizadoTxt({})).toBe(SIN_DATO);
  });

  it("`_avion_utilizado_txt` es TOLERANTE con lo que manda el API", () => {
    expect(avionUtilizadoTxt("N990GG · Seneca V")).toBe("N990GG · Seneca V");
    expect(avionUtilizadoTxt({ matricula: "N990GG", modelo: "Seneca V" })).toBe("N990GG · Seneca V");
    // Otra forma (o sin dato): la línea no se pinta, nunca un objeto crudo.
    expect(avionUtilizadoTxt(null)).toBe("");
    expect(avionUtilizadoTxt(42)).toBe("");
  });

  it("la tarifa lleva sus marcas", () => {
    expect(tarifaFicha({ tipoLabel: "Tarifa pública", tarifaUsdHr: 1650 })).toEqual({
      texto: "Tarifa pública · $1,650.00/hr",
      marcas: "",
    });
    expect(tarifaFicha({ tipoLabel: "Personalizada", tarifaUsdHr: 989.58, override: true }).marcas).toBe(
      "tarifa manual",
    );
  });

  /**
   * RIESGO 5 del diseño: el método PREVISTO decide si la cotización lleva IVA
   * 16 % o 0 %, y es el único sitio del documento donde se ve el % de
   * TERMINAL pactado. Sin cobros registrados sigue siendo lo que explica el
   * IVA, así que también va en la fila vacía.
   */
  it("el método previsto lleva la comisión de terminal", () => {
    expect(metodoPrevistoTxt({ metodoLabel: "Transferencia" })).toBe("previsto: Transferencia");
    expect(metodoPrevistoTxt({ metodoLabel: "BillPocket", comisionBillpocketPct: 8.857 })).toBe(
      "previsto: BillPocket · comisión terminal 8.857 %",
    );
    expect(metodoPrevistoTxt({})).toBe("");
  });

  it("el pie de cobros ordena las palabras, no recalcula el dinero", () => {
    expect(
      resumenCobros({ totalCobradoUsd: 2000, comisionBancoUsd: 0, saldoUsd: 1465.5 }).join(" · "),
    ).toBe("Cobrado $2,000.00 USD · Saldo $1,465.50");
    expect(
      resumenCobros({
        totalCobradoUsd: 3000,
        comisionBancoUsd: 88.57,
        totalCobradoNetoUsd: 2911.43,
        saldoUsd: -10,
      }).join(" · "),
    ).toBe(
      "Cobrado $3,000.00 USD · comisiones banco −$88.57 · neto $2,911.43 · Saldo −$10.00 (sobrecobro)",
    );
    // Sin saldo del API no se inventa uno.
    expect(resumenCobros({ totalCobradoUsd: 0, saldoUsd: null })[1]).toBe(`Saldo ${SIN_DATO}`);
  });

  it("los cobros en MXN sin T.C. se avisan (nunca desaparecen en silencio)", () => {
    expect(avisoCobrosSinTc(1, 18000)).toBe(
      "OJO: 1 cobro en MXN por $18,000.00 SIN tipo de cambio: fuera de la suma.",
    );
    expect(avisoCobrosSinTc(2, 5)).toContain("2 cobros");
    expect(avisoCobrosSinTc(0, 0)).toBe("");
  });

  it("la sub-línea del cobro junta referencia, cuenta y sobre del grupo", () => {
    expect(
      subLineaCobro({
        es_reembolso: false,
        referencia: "REF-88421",
        cuenta_destino: "HSBC Dólares",
        sobre_grupo_folio: "G-12",
        sobre_grupo_monto_total: 9000,
        sobre_grupo_moneda: "USD",
        grupo_factor: 0.25,
      }),
    ).toBe("REF-88421 · HSBC Dólares · Sobre G-12 $9,000.00 USD × 25 %");
    expect(subLineaCobro({ monto: -500 })).toBe("Reembolso");
  });

  it("el semáforo se traduce a su clase del CSS compartido", () => {
    expect(claseSemaforo("verde")).toBe("sem-verde");
    expect(claseSemaforo("AMARILLO")).toBe("sem-amarillo");
    expect(claseSemaforo(null)).toBe("sem-gris");
  });
});

describe("quién ve la hoja interna", () => {
  /**
   * RIESGO 8 del diseño: la pantalla tiene que usar el MISMO criterio que el
   * PDF interno; si no, expondría a SOCIO lo que el API le niega en papel.
   */
  it("es la MISMA lista del API (`ROLES_PDF_INTERNO`): sin SOCIO ni PILOTO", () => {
    expect([...ROLES_HOJA_INTERNA].sort()).toEqual([
      "ADMIN",
      "ANALISTA",
      "COORDINADOR",
      "FACTURACION",
    ]);
    for (const rol of ["ADMIN", "COORDINADOR", "FACTURACION", "ANALISTA"]) {
      expect(puedeVerHojaInterna(rol)).toBe(true);
    }
    for (const rol of ["SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeVerHojaInterna(rol)).toBe(false);
    }
    // Sin rol todavía resuelto se asume lo MENOS: nada de dato interno.
    expect(puedeVerHojaInterna(null)).toBe(false);
    expect(puedeVerHojaInterna("")).toBe(false);
  });

  it("la banda roja dice exactamente lo que dice el papel", () => {
    expect(BANDA_INTERNA).toBe(
      "Cotización interna · uso exclusivo de oficina · no enviar al cliente",
    );
  });
});

/**
 * CONCEPTOS CANÓNICOS (revisión adversaria, 22-sep-2026). El papel interno
 * arranca de `ln.concepto` del motor (`_concepto_operacion`): esos textos ya
 * traen dentro el nombre del vendedor con su «$/hr × hr», el «(sin IVA)» de
 * la pernocta y el rótulo «Descuento»/«Redondeo» del ajuste. Redactarlos a
 * mano en el panel hacía que pantalla y PDF nombraran distinto el MISMO
 * renglón — medido en prod: 35 de 231 cotizaciones con comisión del vendedor
 * y 17 con ajuste.
 */
describe("conceptos canónicos del desglose interno", () => {
  const b = (desglose: { clave: string; concepto: string; monto_usd: number }[]) =>
    ({ desglose }) as unknown as QuoteBreakdown;

  it("devuelve el concepto que escribió el motor, no uno inventado", () => {
    const bd = b([
      { clave: "COMISION_VENDEDOR", concepto: "Comisión del vendedor (Saab) · $50.00/hr × 2 hr", monto_usd: 100 },
      { clave: "AJUSTE", concepto: "Redondeo", monto_usd: 50 },
      { clave: "PERNOCTA", concepto: "Viáticos por pernocta (sin IVA)", monto_usd: 150 },
    ]);
    expect(conceptoCanonico(bd, "COMISION_VENDEDOR")).toBe(
      "Comisión del vendedor (Saab) · $50.00/hr × 2 hr",
    );
    expect(conceptoCanonico(bd, "AJUSTE")).toBe("Redondeo");
    expect(conceptoCanonico(bd, "PERNOCTA")).toBe("Viáticos por pernocta (sin IVA)");
    // Sin desglose (API previo / snapshot legado): quien llama usa su respaldo.
    expect(conceptoCanonico(null, "AJUSTE")).toBeNull();
    expect(conceptoCanonico(b([]), "AJUSTE")).toBeNull();
  });

  it("el nombre del vendedor NO se duplica si ya viene en el concepto", () => {
    expect(
      conceptoComisionVendedor("Comisión del vendedor (Saab) · $50.00/hr × 2 hr", "Saab"),
    ).toBe("Comisión del vendedor (Saab) · $50.00/hr × 2 hr");
    expect(conceptoComisionVendedor("Comisión del vendedor", "Saab")).toBe(
      "Comisión del vendedor · Saab",
    );
    expect(conceptoComisionVendedor(null, null)).toBe("Comisión del vendedor");
  });
});

/**
 * «Total MXN · T.C. 18.1 · incluye $1,322.40 MXN nativos»: lo capturado en
 * PESOS (TUAS y extras) entra al total SIN pasar por el tipo de cambio, así
 * que sin esa frase el total en pesos no se puede cuadrar contra el T.C. Son
 * 14 de 231 cotizaciones en prod y la hoja del CLIENTE nunca la lleva.
 */
describe("aclaración de la fila «Total MXN» del documento interno", () => {
  it("nombra el T.C. y los pesos que no pasaron por él", () => {
    expect(opTotalMxnInterna("18.1", 1322.4)).toBe(
      "T.C. 18.1 · incluye $1,322.40 MXN nativos",
    );
    expect(opTotalMxnInterna("18.1", null)).toBe("T.C. 18.1");
    expect(opTotalMxnInterna("18.1", 0)).toBe("T.C. 18.1");
    // Sin T.C. capturado se dice lo que sí se sabe (nunca un «T.C. » vacío).
    expect(opTotalMxnInterna("", 2700)).toBe("incluye $2,700.00 MXN nativos");
    expect(opTotalMxnInterna("", null)).toBe("");
  });
});

/** Una TUA en PESOS dice de dónde salen sus dólares (`_tua_fila`). */
describe("TUA capturada en pesos", () => {
  it("cierra con su T.C., como el papel", () => {
    const p = piezasConceptoTuaInterna(
      { iata: "MID", pax: 4, moneda: "MXN", total_nativo: 1322.4, tc_aplicado: 18.1 },
      "18.1",
    );
    expect(p.concepto).toBe("TUA MID");
    expect(`${p.antes}330.60${p.despues}`).toBe(
      "4 pax × $330.60 MXN = $1,322.40 MXN · T.C. 18.1",
    );
  });

  it("en USD no inventa ni el « MXN» ni el T.C.", () => {
    const p = piezasConceptoTuaInterna({ iata: "CUN", pax: 4, moneda: "USD" });
    expect(`${p.antes}25.00${p.despues}`).toBe("4 pax × $25.00");
  });
});
