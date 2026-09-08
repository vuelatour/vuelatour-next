import { describe, expect, it } from "vitest";
import {
  armarMotivoRevision,
  cambiosTocanTripulacion,
  MOTIVO_MAX,
  resumirCambios,
  textoResumenCambios,
  type QuoteFormDiff,
} from "@/lib/admin/quote-revision";
import { candadoRevision } from "@/lib/admin/quote-revision";

/** Form base "limpio" (rehidratado de una v2 típica CUN→HOL→CUN, 4 pax). */
function base(): QuoteFormDiff {
  return {
    cliente_id: "cli-1",
    fecha_vuelo: "2026-09-12T08:00",
    fecha_traslado_final: "2026-09-12T18:00",
    aeronave_id: "av-kodiak",
    escalas: [
      { origen_iata: "CUN", destino_iata: "HOL", millas_nauticas: 190, pasajeros: 4, es_ferry: false, requiere_pernocta: false, pernocta_costo_usd: null, tipo_parada: "NORMAL", servicio_notas: null, notas: null, fecha_salida_plan: null },
      { origen_iata: "HOL", destino_iata: "CUN", millas_nauticas: 190, pasajeros: 4, es_ferry: false, requiere_pernocta: false, pernocta_costo_usd: null, tipo_parada: "NORMAL", servicio_notas: null, notas: null, fecha_salida_plan: null },
    ],
    tipo_tarifa: "PUBLICO",
    pasajeros: 4,
    pase_abordar: false,
    sobrevuelo_hr: null,
    tiempo_cobrable_override_hr: null,
    cobrar_tuas: true,
    tuas_lineas: [{ iata: "CUN", monto_pax: 25, moneda: "USD" }],
    cotizacion_abierta: false,
    pdf_mostrar_tarifa: false,
    pdf_mostrar_itinerario: true,
    es_externo: false,
    operador_externo: "",
    avion_externo_modelo: "",
    avion_externo_matricula: "",
    costo_externo_monto: null,
    costo_externo_moneda: "USD",
    total_pactado_usd: null,
    extras: [{ concepto: "Catering", monto_usd: 170, moneda: "USD", aplica_iva: true }],
    redondeo_auto: false,
    redondeo_usd: null,
    descuento_usd: null,
    metodo_pago: "TRANSFERENCIA",
    metodo_pago_detalle: "",
    tc_usd_mxn: 18.1,
    comision_billpocket_pct: null,
    comision_vendedor_modo: "FIJA",
    comision_vendedor_usd: null,
    comision_vendedor_tarifa_hr: null,
    comision_vendedor_nombre: "",
    tarifa_hora_override_usd: null,
    tuas_override_usd_pax: null,
    iva_pct_override: null,
    notas: "Sujeto a slot en CUN",
    notas_internas: "",
    motivo: "",
    tarifa_personalizada: false,
  };
}

const textos = (prev: QuoteFormDiff, next: QuoteFormDiff) =>
  resumirCambios(prev, next, {
    aviones: [
      { id: "av-kodiak", modelo: "Kodiak" },
      { id: "av-seneca", modelo: "Piper Seneca V" },
    ],
  }).map((c) => c.texto);

describe("resumirCambios", () => {
  it("sin cambios → lista vacía", () => {
    expect(textos(base(), base())).toEqual([]);
  });

  it("ignora normalizaciones: '4' vs 4, '' vs null, espacios, motivo y modo de UI", () => {
    const next: QuoteFormDiff = {
      ...base(),
      pasajeros: "4",
      sobrevuelo_hr: "",
      tc_usd_mxn: "18.10",
      notas: "  Sujeto a slot en CUN ",
      motivo: "algo que no cuenta",
      tarifa_personalizada: true,
      escalas: base().escalas!.map((e) => ({ ...e, millas_nauticas: "190", pasajeros: "4" })),
      tuas_lineas: [{ iata: "cun", monto_pax: "25.00", moneda: "USD" }],
    };
    expect(textos(base(), next)).toEqual([]);
  });

  it("pasajeros 4→6", () => {
    expect(textos(base(), { ...base(), pasajeros: 6 })).toEqual(["Pasajeros 4→6"]);
  });

  it("IVA % capturado en el desglose (16 → 0.16) y fecha de tramo re-tecleada no son cambios", () => {
    // El input del desglose guarda la fracción redondeada a 4 decimales.
    const conIva: QuoteFormDiff = { ...base(), iva_pct_override: 0.16 };
    const reTecleado: QuoteFormDiff = {
      ...conIva,
      iva_pct_override: Math.round(Math.min(100, Math.max(0, Number("16"))) * 100) / 10000,
      escalas: conIva.escalas!.map((e) => ({ ...e, fecha_salida_plan: "2026-09-12T08:00" })),
    };
    const conFecha: QuoteFormDiff = {
      ...conIva,
      escalas: conIva.escalas!.map((e) => ({ ...e, fecha_salida_plan: "2026-09-12T08:00" })),
    };
    expect(textos(conFecha, reTecleado)).toEqual([]);
    expect(textos(conIva, { ...conIva, iva_pct_override: "0.16" })).toEqual([]);
    expect(textos(conIva, { ...conIva, iva_pct_override: null })).toEqual(["IVA según método de pago"]);
  });

  it("extra agregado con monto y moneda", () => {
    const next = { ...base(), extras: [...base().extras!, { concepto: "Handler", monto_usd: 1500 }] };
    expect(textos(base(), next)).toEqual(["+Extra Handler $1,500"]);
    const mxn = { ...base(), extras: [...base().extras!, { concepto: "Tour", cantidad: 2, unitario: 850, moneda: "MXN", monto_usd: 0 }] };
    expect(textos(base(), mxn)).toEqual(["+Extra Tour MX$1,700"]);
  });

  it("extra eliminado y extra con monto cambiado", () => {
    expect(textos(base(), { ...base(), extras: [] })).toEqual(["−Extra Catering"]);
    const cambiado = { ...base(), extras: [{ concepto: "Catering", monto_usd: 200, moneda: "USD", aplica_iva: true }] };
    expect(textos(base(), cambiado)).toEqual(["Extra Catering $170→$200"]);
  });

  it("TUA CUN 25→30, nueva línea y vuelta al catálogo", () => {
    expect(textos(base(), { ...base(), tuas_lineas: [{ iata: "CUN", monto_pax: 30, moneda: "USD" }] })).toEqual(["TUA CUN $25→$30"]);
    expect(textos(base(), { ...base(), tuas_lineas: [] })).toEqual(["TUA CUN vuelve al catálogo"]);
    expect(
      textos(base(), { ...base(), tuas_lineas: [...base().tuas_lineas!, { iata: "HOL", monto_pax: 0, moneda: "USD" }] }),
    ).toEqual(["TUA HOL $0"]);
  });

  it("tramo eliminado", () => {
    const next = { ...base(), escalas: [base().escalas![0]] };
    expect(textos(base(), next)).toEqual(["Tramo 2 HOL→CUN eliminado"]);
  });

  it("tramo agregado, ruta cambiada, millas y pax por tramo", () => {
    const agregado = { ...base(), escalas: [...base().escalas!, { origen_iata: "CUN", destino_iata: "CZM", millas_nauticas: 40 }] };
    expect(textos(base(), agregado)).toEqual(["+Tramo 3 CUN→CZM"]);
    const ruta = { ...base(), escalas: [base().escalas![0], { ...base().escalas![1], destino_iata: "CZM" }] };
    expect(textos(base(), ruta)).toEqual(["Tramo 2 HOL→CUN ahora HOL→CZM"]);
    const nm = { ...base(), escalas: [{ ...base().escalas![0], millas_nauticas: 200, pasajeros: 6 }, base().escalas![1]] };
    expect(textos(base(), nm)).toEqual(["Tramo 1 NM 190→200", "Tramo 1 pax 4→6"]);
  });

  it("fechas de traslado y avión: legibles y marcados como tripulación", () => {
    const next = { ...base(), fecha_vuelo: "2026-09-13T08:00", aeronave_id: "av-seneca" };
    const cambios = resumirCambios(base(), next, {
      aviones: [{ id: "av-kodiak", modelo: "Kodiak" }, { id: "av-seneca", modelo: "Piper Seneca V" }],
    });
    expect(cambios.map((c) => c.texto)).toEqual([
      "Fecha traslado inicial 12 sep 08:00→13 sep 08:00",
      "Avión Kodiak→Piper Seneca V",
    ]);
    expect(cambiosTocanTripulacion(cambios)).toBe(true);
    // El precio nunca notifica.
    expect(cambiosTocanTripulacion(resumirCambios(base(), { ...base(), pasajeros: 6 }))).toBe(false);
  });

  it("pernocta en un tramo notifica; el costo de la pernocta no", () => {
    const pern = { ...base(), escalas: [{ ...base().escalas![0], requiere_pernocta: true, pernocta_costo_usd: 150 }, base().escalas![1]] };
    const c1 = resumirCambios(base(), pern);
    expect(c1.map((c) => c.texto)).toEqual(["Tramo 1 pernocta sí"]);
    expect(cambiosTocanTripulacion(c1)).toBe(true);
    const costo = { ...pern, escalas: [{ ...pern.escalas[0], pernocta_costo_usd: 200 }, pern.escalas[1]] };
    const c2 = resumirCambios(pern, costo);
    expect(c2.map((c) => c.texto)).toEqual(["Tramo 1 pernocta $150→$200"]);
    expect(cambiosTocanTripulacion(c2)).toBe(false);
  });

  it("tarifa, override, método de pago, TC, descuento, IVA manual y comisión", () => {
    const next: QuoteFormDiff = {
      ...base(),
      tipo_tarifa: "BROKER",
      tarifa_hora_override_usd: 989.58,
      metodo_pago: "BILLPOCKET",
      comision_billpocket_pct: 3.5,
      tc_usd_mxn: 18.5,
      descuento_usd: 100,
      iva_pct_override: 0.08,
      comision_vendedor_usd: 150,
      comision_vendedor_nombre: "Itzy",
    };
    expect(textos(base(), next)).toEqual([
      "Tarifa Público→Broker",
      "Tarifa/hr manual $989.58",
      "Método Transferencia→BillPocket",
      "TC 18.1→18.5",
      "BillPocket 0%→3.5%",
      "IVA manual 8%",
      "Descuento $0→$100",
      "Comisión vendedor $0→$150",
      "Vendedor Itzy",
    ]);
  });

  it("notas y toggles del PDF", () => {
    const next = { ...base(), notas: "Otra nota", pdf_mostrar_tarifa: true, pdf_mostrar_itinerario: false };
    expect(textos(base(), next)).toEqual([
      "PDF: tarifa/hr visible",
      "PDF: itinerario oculto",
      "Notas del PDF",
    ]);
  });

  it("externo: operador, ficha y costo con moneda", () => {
    const next = { ...base(), es_externo: true, operador_externo: "Aerocharter", avion_externo_modelo: "Hawker 400", avion_externo_matricula: "XA-REG", costo_externo_monto: 50000, costo_externo_moneda: "MXN" };
    expect(textos(base(), next)).toEqual([
      "Operador externo sí",
      "Operador —→Aerocharter",
      "Avión externo Hawker 400 · XA-REG",
      "Costo externo —→MX$50,000",
    ]);
  });
});

describe("textoResumenCambios / armarMotivoRevision", () => {
  it("resume en una línea con tope y cuenta el resto", () => {
    const cambios = resumirCambios(base(), {
      ...base(),
      pasajeros: 6,
      descuento_usd: 50,
      tc_usd_mxn: 19,
      notas: "x",
      pdf_mostrar_tarifa: true,
    });
    expect(cambios).toHaveLength(5);
    expect(textoResumenCambios(cambios, 2)).toBe("Pasajeros 4→6 · TC 18.1→19 · +3 más");
    expect(textoResumenCambios([], 3)).toBe("");
  });

  it("arma el motivo con el resumen como prefijo y el chip obligatorio", () => {
    expect(armarMotivoRevision({ chip: "Cliente pidió", resumen: "pax 4→6 · +Handler $1,500" })).toBe(
      "[pax 4→6 · +Handler $1,500] Cliente pidió",
    );
    expect(armarMotivoRevision({ chip: "Otro", texto: " subió la TUA ", resumen: "" })).toBe("Otro — subió la TUA");
    expect(armarMotivoRevision({ chip: "", texto: "algo", resumen: "x" })).toBe("");
  });

  it("nunca excede 500 caracteres: recorta el resumen, no el motivo humano", () => {
    const resumen = "Pasajeros 4→6 · ".repeat(60);
    const m = armarMotivoRevision({ chip: "Corrección", texto: "cliente llamó", resumen });
    expect(m.length).toBeLessThanOrEqual(MOTIVO_MAX);
    expect(m.endsWith("] Corrección — cliente llamó")).toBe(true);
    expect(m.startsWith("[Pasajeros 4→6")).toBe(true);
  });
});


describe("candadoRevision · dinero cobrado (espejo D3)", () => {
  const base = {
    estado: "COTIZADO",
    cobrado: false,
    facturado: false,
    fecha_vuelo: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    escalas: [],
  } as unknown as Parameters<typeof candadoRevision>[0];

  it("sin cobros: editable", () => {
    expect(candadoRevision(base, { totalCobrado: 0, cobrosSinTc: 0 }).canRevise).toBe(true);
  });
  it("anticipo parcial (neto > 0) bloquea aunque `cobrado` sea false", () => {
    const c = candadoRevision(base, { totalCobrado: 250, cobrosSinTc: 0 });
    expect(c.canRevise).toBe(false);
    expect(c.bloqueadaPorCobro).toBe(true);
  });
  it("cobro MXN sin TC bloquea aunque el neto sea 0", () => {
    expect(candadoRevision(base, { totalCobrado: 0, cobrosSinTc: 1 }).bloqueadaPorCobro).toBe(true);
  });
  it("cobro + reembolso completo (neto 0) no bloquea", () => {
    expect(candadoRevision(base, { totalCobrado: 0, cobrosSinTc: 0 }).bloqueadaPorCobro).toBe(false);
  });
  it("cancelada con cobros sigue editable (regla 1-sep)", () => {
    const c = candadoRevision({ ...base, estado: "CANCELADO" } as typeof base, { totalCobrado: 500 });
    expect(c.canRevise).toBe(true);
    expect(c.bloqueadaPorCobro).toBe(false);
  });
});
