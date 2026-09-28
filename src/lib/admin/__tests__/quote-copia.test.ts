import { describe, expect, it } from "vitest";
import type { QuoteFormValues } from "@/components/admin/quotes/quote-form-types";
import {
  codificarBorrador,
  decodificarBorrador,
  PARAM_BORRADOR,
  puedeCopiarCotizacion,
  RUTA_NUEVA_COTIZACION,
  TEXTO_BOTON_COPIAR,
  textoAvisoCopia,
  textoConfirmarCopiaConCambios,
  urlCopiarComoNueva,
  valoresCopiaCotizacion,
} from "@/lib/admin/quote-copia";

/**
 * «COPIAR COMO NUEVA COTIZACIÓN» (28-sep-2026). Pedido del cliente: «ya no
 * está la opción de usar de copia la cotización para una nueva; esa función
 * es muy útil, la necesitamos de nuevo» (captura de la #257: Completado,
 * editable, sin el botón). Aquí se congela QUÉ lleva la copia; que el botón
 * salga en todos los estados lo cuida
 * `components/admin/quotes/__tests__/quote-copiar-como-nueva.test.tsx`.
 */

/** Documento «como se ve en pantalla» de una cotización real de oficina. */
function original(): QuoteFormValues {
  return {
    cliente_id: "cli-1",
    tipo: "MULTIESCALA",
    fecha_vuelo: "2026-09-20T09:30",
    fecha_traslado_final: "2026-09-21T17:00",
    aeronave_id: "av-kodiak",
    ruta_id: "ruta-mid",
    escalas: [
      {
        origen_iata: "CUN",
        destino_iata: "PCE",
        millas_nauticas: 27,
        pasajeros: 0,
        pasajeros_nombres: [],
        es_ferry: true,
        requiere_pernocta: false,
        pernocta_costo_usd: null,
        tipo_parada: "NORMAL",
        servicio_notas: null,
        notas: "Cargar gasolina aquí",
        fecha_salida_plan: "2026-09-20T09:30",
        pdf_oculto: true,
        pdf_fecha: "2026-09-20",
      },
      {
        origen_iata: "PCE",
        destino_iata: "MID",
        millas_nauticas: 157.3,
        pasajeros: 4,
        pasajeros_nombres: ["Ana Peña", "José Núñez"],
        es_ferry: false,
        requiere_pernocta: true,
        pernocta_costo_usd: 350,
        tipo_parada: "SERVICIO",
        servicio_notas: "Recoger equipaje en Mérida",
        notas: null,
        fecha_salida_plan: "2026-09-20T11:00",
      },
      {
        origen_iata: "MID",
        destino_iata: "CUN",
        millas_nauticas: 170,
        pasajeros: 4,
        pasajeros_nombres: ["Ana Peña", "José Núñez"],
        es_ferry: false,
        requiere_pernocta: false,
        pernocta_costo_usd: null,
        tipo_parada: "NORMAL",
        servicio_notas: null,
        notas: null,
        fecha_salida_plan: null,
      },
    ],
    tipo_tarifa: "BROKER",
    pasajeros: 4,
    pase_abordar: true,
    sobrevuelo_hr: 0.5,
    tiempo_cobrable_override_hr: 2.33333333,
    cobrar_tuas: true,
    tuas_lineas: [{ iata: "CUN", monto_pax: 330.6, moneda: "MXN" }],
    cotizacion_abierta: false,
    pdf_mostrar_tarifa: true,
    pdf_mostrar_itinerario: true,
    es_externo: false,
    operador_externo: "",
    avion_externo_modelo: "",
    avion_externo_matricula: "",
    costo_externo_monto: null,
    costo_externo_moneda: "USD",
    total_pactado_usd: 3200,
    extras: [
      { concepto: "Handler", monto_usd: 150, moneda: "USD", aplica_iva: true },
      { concepto: "Extensión de servicios", monto_usd: 1500, moneda: "MXN", aplica_iva: false },
      {
        concepto: "Tour Chichén Itzá",
        monto_usd: 0,
        moneda: "USD",
        aplica_iva: true,
        unitario: 85,
        por_persona: true,
      },
      {
        concepto: "Comisariato",
        monto_usd: 40,
        moneda: "USD",
        aplica_iva: true,
        cantidad: 2,
        unitario: 20,
        origen: "GRUPO",
        grupo_extra_id: "gx-1",
      },
    ],
    redondeo_auto: false,
    redondeo_usd: 4.5,
    descuento_usd: 20,
    metodo_pago: "BILLPOCKET",
    metodo_pago_detalle: "",
    tc_usd_mxn: 17.35,
    comision_billpocket_pct: 3.5,
    comision_vendedor_modo: "POR_HORA",
    comision_vendedor_usd: null,
    comision_vendedor_tarifa_hr: 50,
    comision_vendedor_nombre: "Saab",
    tarifa_hora_override_usd: 989.583333,
    tuas_override_usd_pax: null,
    iva_pct_override: null,
    notas: "Incluye agua a bordo.",
    notas_internas: "Cliente frecuente, pide factura.",
    motivo: "[Pax 2→4] Cambio de pasajeros",
    tarifa_personalizada: true,
    escalas_operacion: [
      {
        origen: "CZM",
        destino: "CUN",
        ferry: true,
        pax: "",
        hora: "2026-09-20T08:00",
        nota: "",
        pernocta: false,
        servicio: false,
        servicioNotas: "",
        nombres: "",
        showNombres: false,
      },
    ],
  };
}

/** Lo que hace el ALTA al montar con `?d=`: `reset({ ...formDefaults, ...f })`. */
function restaurarEnElAlta(url: string): QuoteFormValues {
  const raw = new URL(url, "https://panel.test").searchParams.get(PARAM_BORRADOR);
  expect(raw, "la URL trae el borrador").toBeTruthy();
  const leido = decodificarBorrador(raw!);
  expect(leido, "el borrador se puede leer").not.toBeNull();
  const defaultsAlta = { ...original(), cliente_id: "", escalas: [], extras: [] };
  return { ...defaultsAlta, ...leido!.f } as QuoteFormValues;
}

describe("urlCopiarComoNueva — la copia reproduce la cotización", () => {
  const url = urlCopiarComoNueva(original(), { folio: 257, conCambios: false });

  it("apunta al alta con el borrador en ?d= (base64url, sin + / =)", () => {
    expect(url.startsWith(`${RUTA_NUEVA_COTIZACION}?${PARAM_BORRADOR}=`)).toBe(true);
    const d = url.slice(url.indexOf("=") + 1);
    expect(d).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("los TRAMOS llegan idénticos en lo que es de la cotización", () => {
    const copia = restaurarEnElAlta(url);
    const deCotizacion = (v: QuoteFormValues) =>
      v.escalas.map((e) => ({
        origen_iata: e.origen_iata,
        destino_iata: e.destino_iata,
        millas_nauticas: e.millas_nauticas,
        pasajeros: e.pasajeros,
        es_ferry: e.es_ferry,
        requiere_pernocta: e.requiere_pernocta,
        pernocta_costo_usd: e.pernocta_costo_usd,
        tipo_parada: e.tipo_parada,
        servicio_notas: e.servicio_notas,
        notas: e.notas,
        pdf_oculto: e.pdf_oculto,
      }));
    expect(copia.escalas).toHaveLength(3);
    expect(deCotizacion(copia)).toEqual(deCotizacion(original()));
    // Acentos y eñes sobreviven al base64 (Mérida, Chichén, Núñez…).
    expect(copia.escalas[1].servicio_notas).toBe("Recoger equipaje en Mérida");
  });

  it("los EXTRAS llegan completos (monto, moneda, IVA, cantidad × unitario)", () => {
    const copia = restaurarEnElAlta(url);
    expect(copia.extras.map((e) => e.concepto)).toEqual([
      "Handler",
      "Extensión de servicios",
      "Tour Chichén Itzá",
      "Comisariato",
    ]);
    expect(copia.extras[0]).toEqual({ concepto: "Handler", monto_usd: 150, moneda: "USD", aplica_iva: true });
    expect(copia.extras[1]).toMatchObject({ monto_usd: 1500, moneda: "MXN", aplica_iva: false });
    expect(copia.extras[2]).toMatchObject({ unitario: 85, por_persona: true });
    expect(copia.extras[3]).toMatchObject({ monto_usd: 40, cantidad: 2, unitario: 20 });
  });

  it("la TARIFA llega con sus 6 decimales, el segmento y el pactado", () => {
    const copia = restaurarEnElAlta(url);
    expect(copia.tipo_tarifa).toBe("BROKER");
    expect(copia.tarifa_hora_override_usd).toBe(989.583333);
    expect(copia.tarifa_personalizada).toBe(true);
    expect(copia.tiempo_cobrable_override_hr).toBe(2.33333333);
    expect(copia.sobrevuelo_hr).toBe(0.5);
  });

  it("el resto de la cotización también viaja (cliente, avión, cobro, comisión, notas)", () => {
    const copia = restaurarEnElAlta(url);
    expect(copia).toMatchObject({
      cliente_id: "cli-1",
      aeronave_id: "av-kodiak",
      ruta_id: "ruta-mid",
      pasajeros: 4,
      pase_abordar: true,
      tuas_lineas: [{ iata: "CUN", monto_pax: 330.6, moneda: "MXN" }],
      redondeo_usd: 4.5,
      descuento_usd: 20,
      metodo_pago: "BILLPOCKET",
      comision_billpocket_pct: 3.5,
      tc_usd_mxn: 17.35,
      comision_vendedor_modo: "POR_HORA",
      comision_vendedor_tarifa_hr: 50,
      comision_vendedor_nombre: "Saab",
      notas: "Incluye agua a bordo.",
      notas_internas: "Cliente frecuente, pide factura.",
      pdf_mostrar_tarifa: true,
    });
  });

  it("dice de qué folio salió (para el aviso del alta)", () => {
    const raw = new URL(url, "https://panel.test").searchParams.get(PARAM_BORRADOR)!;
    expect(decodificarBorrador(raw)?.copia).toEqual({ folio: 257, conCambios: false });
  });
});

describe("valoresCopiaCotizacion — lo que es del VIAJE se vacía", () => {
  const copia = valoresCopiaCotizacion(original());

  it("fecha vacía: vuelo, regreso, hora de cada tramo y fecha impresa por tramo", () => {
    expect(copia.fecha_vuelo).toBe("");
    expect(copia.fecha_traslado_final).toBe("");
    expect(copia.escalas.map((e) => e.fecha_salida_plan)).toEqual([null, null, null]);
    expect(copia.escalas.every((e) => !("pdf_fecha" in e))).toBe(true);
  });

  it("sin manifiesto (nombres de pasajeros por tramo)", () => {
    expect(copia.escalas.map((e) => e.pasajeros_nombres)).toEqual([[], [], []]);
    // …pero el NÚMERO de pasajeros por tramo es de la cotización y se queda.
    expect(copia.escalas.map((e) => e.pasajeros)).toEqual([0, 4, 4]);
  });

  it("sin motivo de versión, sin ruta operativa del alta y sin pactado LEGADO", () => {
    expect(copia.motivo).toBe("");
    expect(copia.escalas_operacion).toEqual([]);
    // El API lo descarta al crear: dejarlo pintaría un total que no se guarda.
    expect(copia.total_pactado_usd).toBeNull();
  });

  it("un extra de GRUPO se vuelve propio: la copia es de un solo avión", () => {
    const grupo = copia.extras[3];
    expect(grupo).toEqual({
      concepto: "Comisariato",
      monto_usd: 40,
      moneda: "USD",
      aplica_iva: true,
      cantidad: 2,
      unitario: 20,
    });
    expect("origen" in grupo).toBe(false);
    expect("grupo_extra_id" in grupo).toBe(false);
  });

  it("no toca el documento original (lo que está en pantalla sigue igual)", () => {
    const o = original();
    const antes = JSON.stringify(o);
    valoresCopiaCotizacion(o);
    expect(JSON.stringify(o)).toBe(antes);
  });
});

describe("borrador ?d= — compatibilidad", () => {
  // Formato de siempre (26-ago): lo que dejan en la URL el alta y «Recargar
  // conservando borrador». Copiado del cotizador ANTES de mudarlo aquí.
  const formatoViejo = (v: QuoteFormValues) =>
    btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, f: v }))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  it("sin copia, codificar da EXACTAMENTE el formato de siempre", () => {
    expect(codificarBorrador(original())).toBe(formatoViejo(original()));
  });

  it("un borrador viejo se sigue leyendo (sin origen de copia)", () => {
    const leido = decodificarBorrador(formatoViejo(original()));
    expect(leido?.copia).toBeNull();
    expect(leido?.f.tarifa_hora_override_usd).toBe(989.583333);
  });

  it("un parámetro corrupto u de otra versión se ignora (jamás rompe el alta)", () => {
    expect(decodificarBorrador("esto-no-es-base64!!")).toBeNull();
    expect(decodificarBorrador("")).toBeNull();
    const v2 = btoa(JSON.stringify({ v: 2, f: {} })).replace(/=+$/, "");
    expect(decodificarBorrador(v2)).toBeNull();
  });

  it("un origen de copia mal formado no inventa folio", () => {
    const raro = btoa(JSON.stringify({ v: 1, f: {}, copia: { folio: "257", conCambios: "yes" } }));
    expect(decodificarBorrador(raro)?.copia).toEqual({ folio: null, conCambios: false });
  });
});

describe("puedeCopiarCotizacion — quien puede CREAR cotizaciones", () => {
  it("ADMIN y COORDINADOR sí (sin importar mayúsculas)", () => {
    expect(puedeCopiarCotizacion("ADMIN")).toBe(true);
    expect(puedeCopiarCotizacion("COORDINADOR")).toBe(true);
    expect(puedeCopiarCotizacion("admin")).toBe(true);
  });

  it("SOCIO, FACTURACION, ANALISTA, PILOTO y MECANICO no", () => {
    for (const rol of ["SOCIO", "FACTURACION", "ANALISTA", "PILOTO", "MECANICO"]) {
      expect(puedeCopiarCotizacion(rol), rol).toBe(false);
    }
  });

  it("sin rol (falló /me) se ofrece: el gate real es el API", () => {
    expect(puedeCopiarCotizacion(null)).toBe(true);
    expect(puedeCopiarCotizacion(undefined)).toBe(true);
  });
});

describe("textos", () => {
  it("el botón dice lo que hace", () => {
    expect(TEXTO_BOTON_COPIAR).toBe("Copiar como nueva");
  });

  it("aviso del alta al abrir la copia", () => {
    expect(textoAvisoCopia({ folio: 257, conCambios: false })).toBe(
      "Copia de la cotización #257. Pon la fecha del vuelo y revisa cliente y pasajeros antes de crear la v1.",
    );
    expect(textoAvisoCopia({ folio: 257, conCambios: true })).toBe(
      "Copia de la cotización #257, con los cambios que no guardaste en ella. Pon la fecha del vuelo y revisa cliente y pasajeros antes de crear la v1.",
    );
    expect(textoAvisoCopia({ folio: null, conCambios: false })).toContain("Copia de otra cotización.");
  });

  it("confirmación con cambios sin guardar", () => {
    expect(textoConfirmarCopiaConCambios(257)).toBe(
      "La cotización nueva llevará lo que ves en pantalla, incluidos tus cambios. La #257 se queda como está: esos cambios NO se guardan en ella.",
    );
    expect(textoConfirmarCopiaConCambios(null)).toContain("Esta cotización se queda como está");
  });
});
