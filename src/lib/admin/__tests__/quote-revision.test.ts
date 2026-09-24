import { describe, expect, it } from "vitest";
import {
  armarMotivoRevision,
  avisoFechasVueloVolado,
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

  /**
   * HORAS PACTADAS a 8 decimales (22-sep-2026, cotizaciones #322 / #302).
   * Pactar «2:20» sobre una cotización que guardaba 2.3333 mueve el dinero
   * dos centavos ($1,399.98 → $1,400.00): el diff TIENE que verlo (si no,
   * no aparece «Guardar» y la cotización no se puede arreglar) y tiene que
   * contarlo de forma legible, nunca «2.3333→2.3333 hr».
   */
  it("cobrable pactado: un cambio más allá del 4.º decimal SE VE y se lee distinto", () => {
    const prev = { ...base(), tiempo_cobrable_override_hr: 2.3333 };
    const next = { ...base(), tiempo_cobrable_override_hr: 2.33333333 };
    expect(textos(prev, next)).toEqual(["Cobrable pactado 2.3333→2.33333333 hr"]);
  });

  it("cobrable pactado: lo de siempre se cuenta corto y volver a la regla se dice", () => {
    const prev = { ...base(), tiempo_cobrable_override_hr: 2.4 };
    expect(textos(prev, { ...prev, tiempo_cobrable_override_hr: 3 })).toEqual([
      "Cobrable pactado 2.4→3 hr",
    ]);
    expect(textos(prev, { ...prev, tiempo_cobrable_override_hr: null })).toEqual([
      "Cobrable vuelve a la regla",
    ]);
    // Contra «sin pactar» los textos ya se distinguen: no hace falta subir
    // la precisión (el resumen es corto a propósito).
    expect(textos(base(), { ...base(), tiempo_cobrable_override_hr: 2.33333333 })).toEqual([
      "Cobrable pactado —→2.33 hr",
    ]);
  });

  it("cobrable pactado: el MISMO número (string vs number) no es un cambio", () => {
    const prev = { ...base(), tiempo_cobrable_override_hr: 2.33333333 };
    expect(textos(prev, { ...prev, tiempo_cobrable_override_hr: "2.33333333" })).toEqual([]);
  });

  it("sobrevuelo también se compara con la precisión de las horas", () => {
    const prev = { ...base(), sobrevuelo_hr: 0.5 };
    expect(textos(prev, { ...prev, sobrevuelo_hr: 0.75 })).toEqual([
      "Sobrevuelo 0.5→0.75 hr",
    ]);
    expect(textos(base(), { ...base(), sobrevuelo_hr: 0.33333333 })).toEqual([
      "Sobrevuelo 0→0.33 hr",
    ]);
    // Pero un ajuste fino sobre un sobrevuelo YA pactado no se traga.
    const fino = { ...base(), sobrevuelo_hr: 0.3333 };
    expect(textos(fino, { ...fino, sobrevuelo_hr: 0.33333333 })).toEqual([
      "Sobrevuelo 0.3333→0.33333333 hr",
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

/**
 * VUELO YA VOLADO (24-sep-2026, caso #338): con el vuelo COMPLETADO la v2
 * cambió el avión (Seneca → Cessna 206, «se cobra como cessna») y el regreso
 * (—→ 10:00), y el piloto recibió «cambio de avión» y «el REGRESO ahora
 * sale…» de un vuelo que ya había aterrizado. Espejo del API: con el vuelo
 * VOLADO ni el avión ni la salida avisan; con el viaje TERMINADO nada avisa.
 */
describe("tripulación y fechas de un vuelo ya volado (#338)", () => {
  const aviones = [
    { id: "av-seneca", modelo: "PIPER SENECA V" },
    { id: "av-cessna", modelo: "Cessna 206" },
  ];
  const v1 = (): QuoteFormDiff => ({ ...base(), aeronave_id: "av-seneca", fecha_traslado_final: null });
  const v2338 = (): QuoteFormDiff => ({
    ...v1(),
    aeronave_id: "av-cessna",
    fecha_traslado_final: "2026-09-24T10:00",
  });

  it("#338 COMPLETADO: ni el avión ni el regreso avisan a la tripulación", () => {
    const cambios = resumirCambios(v1(), v2338(), { aviones });
    expect(cambios.map((c) => c.texto)).toEqual([
      "Fecha traslado final —→24 sep 10:00",
      "Avión PIPER SENECA V→Cessna 206",
    ]);
    // Sin contexto (vuelo por volar) sí avisan, como siempre.
    expect(cambiosTocanTripulacion(cambios)).toBe(true);
    expect(cambiosTocanTripulacion(cambios, { yaVolo: true, termino: true })).toBe(false);
  });

  it("ya voló pero NO terminó: el avión y la salida callan; el regreso y la pernocta sí avisan", () => {
    const volado = { yaVolo: true, termino: false };
    const avion = resumirCambios(v1(), { ...v1(), aeronave_id: "av-cessna" }, { aviones });
    expect(cambiosTocanTripulacion(avion, volado)).toBe(false);
    const salida = resumirCambios(v1(), { ...v1(), fecha_vuelo: "2026-09-13T08:00" });
    expect(cambiosTocanTripulacion(salida, volado)).toBe(false);
    const regreso = resumirCambios(v1(), { ...v1(), fecha_traslado_final: "2026-09-14T18:00" });
    expect(cambiosTocanTripulacion(regreso, volado)).toBe(true);
    const pern = {
      ...v1(),
      escalas: [{ ...v1().escalas![0], requiere_pernocta: true, pernocta_costo_usd: 150 }, v1().escalas![1]],
    };
    expect(cambiosTocanTripulacion(resumirCambios(v1(), pern), volado)).toBe(true);
  });

  it("aviso de fechas ANTES de guardar: salida con el vuelo volado, regreso con el viaje terminado", () => {
    const regreso = resumirCambios(v1(), v2338(), { aviones });
    expect(avisoFechasVueloVolado(regreso, { yaVolo: true, termino: true })).toBe(
      "El viaje ya terminó: la fecha de regreso no se cambia desde la cotización; se conserva la del vuelo.",
    );
    // A medio camino el regreso todavía se reagenda: nada que decir.
    expect(avisoFechasVueloVolado(regreso, { yaVolo: true, termino: false })).toBeNull();
    const salida = resumirCambios(v1(), { ...v1(), fecha_vuelo: "2026-09-13T08:00" });
    expect(avisoFechasVueloVolado(salida, { yaVolo: true, termino: false })).toBe(
      "El vuelo ya voló: la fecha de salida no se cambia desde la cotización; se conserva la del vuelo.",
    );
    const ambas = resumirCambios(v1(), {
      ...v1(),
      fecha_vuelo: "2026-09-13T08:00",
      fecha_traslado_final: "2026-09-24T10:00",
    });
    expect(avisoFechasVueloVolado(ambas, { yaVolo: true, termino: true })).toBe(
      "El vuelo ya voló: sus fechas de salida y regreso no se cambian desde la cotización; se conservan las del vuelo.",
    );
    // Vuelo por volar: las fechas se escriben como siempre.
    expect(avisoFechasVueloVolado(ambas, {})).toBeNull();
  });
});
