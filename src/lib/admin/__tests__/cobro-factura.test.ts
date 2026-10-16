/**
 * FACTURAS POR COBRO (16-oct-2026, API 0.0.82, invariante 84 del API) —
 * pedido del cliente con la captura de #332 (4 cobros, UNA «Factura A-0420»):
 * «unos pagos son con una factura y a lo mejor otro con otra».
 *
 * Congela la lógica PURA de `lib/admin/cobro-factura.ts`: textos exactos
 * (singular/plural), la preselección del selector (1 con cupo / 1 sin cupo /
 * 2+), `facturaConCupo` con la tolerancia de $1.00 y por moneda, el tono de
 * «sin factura asignada» (#332 ámbar, A-0430 gris), el prefill de las
 * casillas con la MISMA regla del backfill, `cobrosHidratados` y los errores.
 */
import { describe, expect, it } from "vitest";
import type { CobroCandidatoFactura, FacturaEmitidaMini, FacturaServicioBloque } from "@/types/facturas-emitidas";
import type { FlightCobro } from "@/types/flights";
import {
  AYUDA_FACTURA_PARCIAL,
  AYUDA_SELECTOR_FACTURA_COBRO,
  BOTON_ASIGNAR_FACTURA,
  ETIQUETA_FACTURAS_NO_CUADRAN,
  NOTA_COBROS_NO_CARGADOS,
  OPCION_SIN_FACTURA,
  TEXTO_COBRO_SIN_FACTURA,
  TITULO_REGISTRAR_FACTURA,
  TITULO_TIENE_FACTURA,
  TOLERANCIA_COBROS_FACTURA,
  asignacionDisponible,
  cobroAsignable,
  cobrosHidratados,
  esCodigoCobroFactura,
  facturaConCupo,
  facturaPreseleccionada,
  hayCobrosQueMostrar,
  mensajeErrorCobroFactura,
  opcionesFacturaDeCobro,
  prefillCobrosDeFactura,
  resumenMarcados,
  textoAmparado,
  textoChipFacturaCobro,
  textoCobroCandidato,
  textoCobroRegistradoConFactura,
  textoCobrosDeVueloRegistro,
  textoCobrosSinFactura,
  textoEliminarCobroConFactura,
  textoFacturaConCobros,
  textoSinFacturaRegistro,
  textoTieneFactura,
  textoYaTieneFactura,
  tituloAlertasDetalle,
  tituloChipFacturaCobro,
  tituloCobrosDeVuelo,
  tituloFacturaConCobros,
  tonoSinFactura,
} from "../cobro-factura";

const A0420: FacturaEmitidaMini = {
  id: "f-0420",
  serie: "A",
  folio: "0420",
  etiqueta: "A-0420",
  uuid: null,
  fecha_emision: "2026-09-21",
  total: 68208,
  moneda: "MXN",
  metodo_pago: "PUE",
  tiene_pdf: true,
  tiene_xml: false,
};
/** A-0420 tras el backfill: ampara exactamente el cobro de 68,208. */
const A0420_COMPLETA: FacturaEmitidaMini = {
  ...A0420,
  es_parcial: false,
  cobros_n: 1,
  cobros_monto: [{ moneda: "MXN", monto: 68208 }],
};
const A0430_GLOBAL: FacturaEmitidaMini = {
  ...A0420,
  id: "f-0430",
  folio: "0430",
  etiqueta: "A-0430",
  total: 334341,
  es_parcial: false,
  cobros_n: 0,
  cobros_monto: [],
};

function bloque(p: Partial<FacturaServicioBloque>): FacturaServicioBloque {
  return { solicitud: null, por_facturar: false, facturas: [], canceladas: 0, ...p };
}

const VUELO_332 = "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e";
function cobroCandidato(
  id: string,
  monto: number,
  factura: CobroCandidatoFactura["factura"] = null,
  extra: Partial<CobroCandidatoFactura> = {},
): CobroCandidatoFactura {
  return {
    id,
    vuelo_id: VUELO_332,
    vuelo_folio: 332,
    monto,
    moneda: "MXN",
    fecha_cobro: "2026-09-21T17:00:00.000Z",
    metodo_cobro: "TRANSFERENCIA",
    cuenta_destino: "Scotiabank Pesos",
    factura,
    ...extra,
  };
}
// Los 4 cobros reales de #332 (prod, 16-oct-2026).
const C_977 = cobroCandidato("d7b0890c", 977.45, null, { fecha_cobro: "2026-09-15T17:00:00.000Z" });
const C_1700A = cobroCandidato("15d97e3a", 1700);
const C_68208 = cobroCandidato("4e938868", 68208);
const C_1700B = cobroCandidato("6f2e65dd", 1700);
const LOS_4 = [C_977, C_1700A, C_68208, C_1700B];

const COBRO: FlightCobro = {
  id: "4e938868",
  vuelo_id: VUELO_332,
  monto: "68208",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17.4",
  referencia: null,
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-09-21T17:00:00.000Z",
  foto_voucher_url: null,
  registrado_por: null,
  notas: null,
  created_at: "2026-09-21T17:00:00.000Z",
  updated_at: "2026-09-21T17:00:00.000Z",
};

describe("¿se puede asignar? (la sonda del API) y qué cobro lleva factura", () => {
  it("solo con `asignacion_disponible: true`; sin la llave o en false, nada", () => {
    expect(asignacionDisponible(bloque({ asignacion_disponible: true }))).toBe(true);
    expect(asignacionDisponible(bloque({ asignacion_disponible: false }))).toBe(false);
    expect(asignacionDisponible(bloque({}))).toBe(false);
    expect(asignacionDisponible(null)).toBe(false);
    expect(asignacionDisponible(undefined)).toBe(false);
  });

  it("asignable = positivo y sin sobre de grupo", () => {
    expect(cobroAsignable(COBRO)).toBe(true);
    expect(cobroAsignable({ ...COBRO, monto: "-500" })).toBe(false);
    expect(cobroAsignable({ ...COBRO, cobro_grupo_id: "cg-1" })).toBe(false);
    expect(
      cobroAsignable({
        ...COBRO,
        cobro_grupo: { id: "cg-1", grupo_id: "g-1", grupo_folio: 12, monto_total: 1, moneda: "USD" },
      }),
    ).toBe(false);
  });
});

describe("cupo de una factura y preselección del selector (revisión #3)", () => {
  it("con cupo: no ampara todo su total (tolerancia $1.00, en SU moneda)", () => {
    expect(TOLERANCIA_COBROS_FACTURA).toBe(1);
    expect(facturaConCupo(A0420)).toBe(true); // sin la llave: nada amparado
    expect(facturaConCupo(A0420_COMPLETA)).toBe(false);
    expect(facturaConCupo({ ...A0420, cobros_monto: [{ moneda: "MXN", monto: 68207.5 }] })).toBe(false);
    expect(facturaConCupo({ ...A0420, cobros_monto: [{ moneda: "MXN", monto: 68206 }] })).toBe(true);
    // Lo amparado en OTRA moneda no cuenta contra el total.
    expect(facturaConCupo({ ...A0420, cobros_monto: [{ moneda: "USD", monto: 99999 }] })).toBe(true);
  });

  it("alta: UNA vigente con cupo ⇒ esa; una ya completa o 2+ ⇒ «Sin factura todavía»", () => {
    expect(facturaPreseleccionada([A0420], "alta")).toBe("f-0420");
    // FA-A-0434 ya ampara sus 38,589: la camioneta de $1,700 NO se liga sola.
    expect(facturaPreseleccionada([A0420_COMPLETA], "alta")).toBe("");
    expect(facturaPreseleccionada([A0420, A0430_GLOBAL], "alta")).toBe("");
    expect(facturaPreseleccionada([], "alta")).toBe("");
    expect(facturaPreseleccionada(null, "alta")).toBe("");
  });

  it("edición: la del cobro (o vacío)", () => {
    expect(facturaPreseleccionada([A0420], "edicion", { ...COBRO, factura_emitida: { id: "f-0420", etiqueta: "A-0420" } })).toBe(
      "f-0420",
    );
    expect(facturaPreseleccionada([A0420], "edicion", { ...COBRO, factura_emitida: null })).toBe("");
    expect(facturaPreseleccionada([A0420], "edicion", COBRO)).toBe("");
  });

  it("opciones: «Sin factura todavía» + «A-0420 · $68,208 MXN · 21 sep 2026» con lo que ampara", () => {
    const ops = opcionesFacturaDeCobro([A0420_COMPLETA, A0430_GLOBAL]);
    expect(ops[0]).toEqual(OPCION_SIN_FACTURA);
    expect(ops[0].label).toBe("Sin factura todavía");
    expect(ops[1]).toEqual({
      value: "f-0420",
      label: "A-0420 · $68,208 MXN · 21 sep 2026",
      description: "Ampara $68,208 MXN",
    });
    expect(ops[2].description).toBe("No ampara ningún cobro todavía");
    expect(textoAmparado({ cobros_n: 2, cobros_monto: [{ moneda: "USD", monto: 600 }, { moneda: "MXN", monto: 860.47 }] })).toBe(
      "Ampara $600 USD + $860.47 MXN",
    );
    expect(opcionesFacturaDeCobro(null)).toEqual([OPCION_SIN_FACTURA]);
    expect(AYUDA_SELECTOR_FACTURA_COBRO).toBe(
      "Qué factura ampara este cobro. Si todavía no se emite, déjalo en «Sin factura todavía» y asígnala después.",
    );
    expect(textoCobroRegistradoConFactura("A-0420")).toBe("Cobro registrado · amparado por A-0420");
    expect(textoCobroRegistradoConFactura(null)).toBe("Cobro registrado");
  });
});

describe("tono de «sin factura asignada» (revisión #11)", () => {
  it("#332 tras el backfill: 1 vigente CON cobro y 3 que exigen ⇒ ámbar", () => {
    expect(tonoSinFactura(bloque({ facturas: [A0420_COMPLETA], cobros_sin_factura: 3, cobros_sin_factura_exigen: 3, asignacion_disponible: true }))).toBe("ambar");
  });

  it("A-0430 (global, 6 vuelos): 1 vigente sin cobro clasificado y cobros que no exigen ⇒ gris", () => {
    expect(tonoSinFactura(bloque({ facturas: [A0430_GLOBAL], cobros_sin_factura: 2, cobros_sin_factura_exigen: 0, asignacion_disponible: true }))).toBe("gris");
  });

  it("2+ vigentes ⇒ ámbar; una vigente que ya ampara algo ⇒ ámbar; cobros que exigen ⇒ ámbar", () => {
    expect(tonoSinFactura(bloque({ facturas: [A0430_GLOBAL, { ...A0430_GLOBAL, id: "x" }], cobros_sin_factura_exigen: 0 }))).toBe("ambar");
    expect(tonoSinFactura(bloque({ facturas: [A0420_COMPLETA], cobros_sin_factura_exigen: 0 }))).toBe("ambar");
    expect(tonoSinFactura(bloque({ facturas: [A0430_GLOBAL], cobros_sin_factura_exigen: 1 }))).toBe("ambar");
    expect(tonoSinFactura(null)).toBe("gris");
  });
});

describe("textos de los chips (card y burbuja)", () => {
  it("chip por cobro: «Factura A-0420» y su tooltip; null sin factura", () => {
    expect(textoChipFacturaCobro({ factura_emitida: { id: "f", etiqueta: "A-0420" } })).toBe("Factura A-0420");
    expect(textoChipFacturaCobro({ factura_emitida: null })).toBeNull();
    expect(textoChipFacturaCobro({})).toBeNull();
    expect(tituloChipFacturaCobro("A-0420")).toBe("Este cobro está amparado por la factura A-0420");
    expect(TEXTO_COBRO_SIN_FACTURA).toBe("Sin factura asignada");
    expect(BOTON_ASIGNAR_FACTURA).toBe("Asignar factura");
  });

  it("sufijo del chip de la burbuja: singular, plural y «sin cobro asignado»", () => {
    expect(textoFacturaConCobros({ cobros_n: 1 })).toBe("· 1 cobro");
    expect(textoFacturaConCobros({ cobros_n: 3 })).toBe("· 3 cobros");
    expect(textoFacturaConCobros({ cobros_n: 0 })).toBe("· sin cobro asignado");
    expect(textoFacturaConCobros({})).toBe("· sin cobro asignado");
    expect(tituloFacturaConCobros(A0420_COMPLETA)).toBe("Ampara 1 cobro de este vuelo: $68,208 MXN");
    expect(tituloFacturaConCobros({ cobros_n: 2, cobros_monto: [{ moneda: "MXN", monto: 65123 }] })).toBe(
      "Ampara 2 cobros de este vuelo: $65,123 MXN",
    );
    expect(tituloFacturaConCobros(A0430_GLOBAL)).toBe("No ampara ningún cobro de este vuelo todavía");
  });

  it("«3 cobros sin factura asignada» / «1 cobro sin factura asignada»", () => {
    expect(textoCobrosSinFactura(3)).toBe("3 cobros sin factura asignada");
    expect(textoCobrosSinFactura(1)).toBe("1 cobro sin factura asignada");
    expect(TITULO_REGISTRAR_FACTURA).toBe(
      "Registra una factura del cliente (con su PDF). Un vuelo puede llevar varias: cada una ampara sus cobros.",
    );
  });

  it("«Eliminar» un cobro amparado lo dice (revisión #15)", () => {
    expect(textoEliminarCobroConFactura({ factura_emitida: { id: "f", etiqueta: "A-0420" } })).toBe(
      "Está amparado por la factura A-0420: al eliminarlo, la factura deja de amparar este cobro.",
    );
    expect(textoEliminarCobroConFactura({ factura_emitida: null })).toBeNull();
    expect(textoEliminarCobroConFactura(null)).toBeNull();
  });

  it("selector de vuelos: «Tiene A-0420» (informativo) y la ayuda del switch parcial", () => {
    expect(textoTieneFactura(["A-0420"])).toBe("Tiene A-0420");
    expect(textoTieneFactura(["A-0420", "A-0455"])).toBe("Tiene A-0420, A-0455");
    expect(TITULO_TIENE_FACTURA).toBe(
      "El vuelo ya tiene esta factura vigente; puedes agregarle otra si ampara otros cobros.",
    );
    expect(AYUDA_FACTURA_PARCIAL).toBe(
      "Márcala si esta factura cubre solo una parte del vuelo. Para registrar varias facturas ya no hace falta: a cada una se le marcan sus cobros.",
    );
  });
});

describe("casillas «¿Qué cobros cubre esta factura?»", () => {
  it("encabezado y texto de cada casilla", () => {
    expect(tituloCobrosDeVuelo(332)).toBe("¿Qué cobros cubre esta factura? — Vuelo #332");
    expect(textoCobroCandidato(C_68208)).toBe("21 sep 2026 · $68,208 MXN · Transferencia → Scotiabank Pesos");
    expect(textoCobroCandidato({ ...C_977, cuenta_destino: null, metodo_cobro: "EFECTIVO" })).toBe(
      "15 sep 2026 · $977.45 MXN · Efectivo",
    );
    expect(textoYaTieneFactura("A-0420")).toBe("· ya tiene A-0420");
    expect(NOTA_COBROS_NO_CARGADOS).toBe(
      "No se pudieron cargar los cobros: guarda la factura y asígnala desde cada cobro.",
    );
  });

  it("prefill del ALTA = la regla del backfill (revisión #4): los 4 de #332 contra 68,208 ⇒ solo ese", () => {
    expect(prefillCobrosDeFactura(LOS_4, null, { monto: 68208, moneda: "MXN" })).toEqual(["4e938868"]);
  });

  it("contra 4,377.45 con el de 68,208 ya amparado por A-0420 ⇒ los 3 libres (Σ cuadra)", () => {
    const conA0420 = [C_977, C_1700A, { ...C_68208, factura: { id: "f-0420", etiqueta: "A-0420" } }, C_1700B];
    expect(prefillCobrosDeFactura(conA0420, null, { monto: 4377.45, moneda: "MXN" })).toEqual([
      "d7b0890c",
      "15d97e3a",
      "6f2e65dd",
    ]);
    // Tolerancia $1.00 también en la suma.
    expect(prefillCobrosDeFactura(conA0420, null, { monto: 4378.4, moneda: "MXN" })).toHaveLength(3);
  });

  it("dos de 1,700 contra 1,700 (ambiguo) ⇒ todos los libres (y el resumen sale ámbar)", () => {
    expect(prefillCobrosDeFactura([C_1700A, C_1700B], null, { monto: 1700, moneda: "MXN" })).toEqual([
      "15d97e3a",
      "6f2e65dd",
    ]);
  });

  it("sin total tecleado ⇒ todos los libres; otra moneda ⇒ todos los libres; nada que cuadre ⇒ todos los libres", () => {
    expect(prefillCobrosDeFactura(LOS_4, null)).toHaveLength(4);
    expect(prefillCobrosDeFactura(LOS_4, null, { monto: 4000, moneda: "USD" })).toHaveLength(4);
    expect(prefillCobrosDeFactura(LOS_4, null, { monto: 10000, moneda: "MXN" })).toHaveLength(4);
    // Los ya amparados por OTRA factura nunca entran al prefill del alta.
    expect(prefillCobrosDeFactura([{ ...C_977, factura: { id: "x", etiqueta: "FA-A-0413" } }], null)).toEqual([]);
  });

  it("EDICIÓN: los que ya ampara ESTA factura, sin mirar el total", () => {
    const conA0420 = [C_977, { ...C_68208, factura: { id: "f-0420", etiqueta: "A-0420" } }, { ...C_1700A, factura: { id: "otra", etiqueta: "A-0455" } }];
    expect(prefillCobrosDeFactura(conA0420, "f-0420", { monto: 1, moneda: "MXN" })).toEqual(["4e938868"]);
  });

  it("hidratación: casillas solo si todos los elegidos traen `cobros` (revisión #5)", () => {
    expect(cobrosHidratados([{ id: "a", cobros: [] }, { id: "b", cobros: LOS_4 }])).toBe(true);
    expect(cobrosHidratados([{ id: "a", cobros: LOS_4 }, { id: "b" }])).toBe(false);
    expect(cobrosHidratados([{ id: "a", cobros: LOS_4 }, { id: "b", cobros: null }])).toBe(false);
    expect(cobrosHidratados([])).toBe(false);
    expect(hayCobrosQueMostrar([{ id: "a", cobros: LOS_4 }, { id: "b" }])).toBe(true);
    // API previo: hidratado SIN la llave (null) ⇒ no hay casillas que pintar.
    expect(hayCobrosQueMostrar([{ id: "a", cobros: null }, { id: "b" }])).toBe(false);
  });

  it("resumen: ok, ámbar (difieren, no bloquea), monedas mezcladas y sin total", () => {
    const tres = new Set(["d7b0890c", "15d97e3a", "6f2e65dd"]);
    expect(resumenMarcados(LOS_4, tres, 4377.45, "MXN")).toEqual({
      texto: "Marcados: $4,377.45 MXN · Factura: $4,377.45 MXN",
      tono: "ok",
    });
    expect(resumenMarcados(LOS_4, tres, 4500, "MXN")).toEqual({
      texto: "Marcados: $4,377.45 MXN · Factura: $4,500 MXN (difieren $122.55 MXN)",
      tono: "ambar",
    });
    // Todo marcado contra A-0420 de 68,208: el caso que ligaba los 4 sin querer.
    expect(resumenMarcados(LOS_4, LOS_4.map((c) => c.id), 68208, "MXN").tono).toBe("ambar");
    const mixto = [C_977, { ...C_1700A, moneda: "USD" as const }];
    expect(resumenMarcados(mixto, ["d7b0890c", "15d97e3a"], 1000, "MXN")).toEqual({
      texto: "Marcados: 2 cobros (MXN y USD)",
      tono: "neutro",
    });
    expect(resumenMarcados(LOS_4, tres, null, "MXN")).toEqual({ texto: "Marcados: $4,377.45 MXN", tono: "neutro" });
    expect(resumenMarcados(LOS_4, tres, 250, "USD")).toEqual({
      texto: "Marcados: $4,377.45 MXN · Factura: $250 USD",
      tono: "neutro",
    });
    expect(resumenMarcados(LOS_4, [], 68208, "MXN").tono).toBe("neutro");
  });
});

describe("registro: «Facturas que no cuadran» y la columna de vuelos", () => {
  it("rótulo y tooltip con el detalle del API (« · » entre mensajes)", () => {
    expect(ETIQUETA_FACTURAS_NO_CUADRAN).toBe("Facturas que no cuadran");
    expect(
      tituloAlertasDetalle([
        { code: "DUPLICADO_VUELO", motivo: "SUMA_SUPERA", vuelo_folio: 332, mensaje: "El vuelo #332 tiene 2 facturas vigentes que suman $80,000 MXN y el vuelo cobró $72,585.45 MXN." },
        { code: "DUPLICADO_VUELO", motivo: "SIN_COBRO_ASIGNADO", vuelo_folio: 332, mensaje: "El vuelo #332 tiene 2 facturas vigentes y A-0420 no ampara ningún cobro: asígnale los suyos o cancélala si es una re-emisión." },
      ]),
    ).toBe(
      "El vuelo #332 tiene 2 facturas vigentes que suman $80,000 MXN y el vuelo cobró $72,585.45 MXN. · El vuelo #332 tiene 2 facturas vigentes y A-0420 no ampara ningún cobro: asígnale los suyos o cancélala si es una re-emisión.",
    );
    // Sin detalle (API previo): la ayuda general.
    expect(tituloAlertasDetalle(undefined)).toContain("Asígnale a cada factura sus cobros");
    expect(tituloAlertasDetalle([])).toContain("Asígnale a cada factura sus cobros");
  });

  it("bajo cada folio: «· 1 cobro» / «· 3 cobros» y «· 3 sin factura»; null con 0", () => {
    expect(textoCobrosDeVueloRegistro(1)).toBe("· 1 cobro");
    expect(textoCobrosDeVueloRegistro(3)).toBe("· 3 cobros");
    expect(textoCobrosDeVueloRegistro(0)).toBeNull();
    expect(textoCobrosDeVueloRegistro(undefined)).toBeNull();
    expect(textoSinFacturaRegistro(3)).toBe("· 3 sin factura");
    expect(textoSinFacturaRegistro(0)).toBeNull();
  });
});

describe("errores del API en es-MX", () => {
  it("el texto del API (es-MX) se respeta; vacío o técnico ⇒ respaldo por código", () => {
    expect(mensajeErrorCobroFactura("FACTURA_NO_VIGENTE", null, "La factura A-0420 ya no está vigente (o no existe): recarga la página y elige otra.")).toBe(
      "La factura A-0420 ya no está vigente (o no existe): recarga la página y elige otra.",
    );
    expect(mensajeErrorCobroFactura("COBRO_FACTURA_NO_DISPONIBLE")).toContain("falta aplicar la migración 20261016000001");
    expect(mensajeErrorCobroFactura("REEMBOLSO_SIN_FACTURA")).toBe("Un reembolso no se liga a una factura.");
    expect(mensajeErrorCobroFactura("FACTURA_NO_LIGADA_AL_VUELO", { folio: 332 })).toBe(
      "La factura no está ligada al vuelo #332. Agrégale el vuelo en Facturas emitidas → Editar → Vuelos y vuelve a intentar.",
    );
    expect(mensajeErrorCobroFactura("COBRO_CON_OTRA_FACTURA", { cobro_id: "x", factura: { id: "f", etiqueta: "A-0420" } }, "Service Unavailable")).toBe(
      "Un cobro marcado ya tiene la factura A-0420. Quítaselo desde esa factura (Editar → ¿Qué cobros cubre?) o cámbialo desde el cobro en el vuelo.",
    );
    expect(mensajeErrorCobroFactura("COBROS_DE_OTRO_VUELO")).toContain("Agrega ese vuelo en «Vuelos»");
    expect(mensajeErrorCobroFactura("COBROS_NO_EXISTEN")).toContain("ya no existe");
    expect(mensajeErrorCobroFactura("COBRO_DE_GRUPO")).toContain("sobre de grupo");
    expect(mensajeErrorCobroFactura("OTRO", null, "")).toBe("No se pudo asignar la factura al cobro. Vuelve a intentarlo.");
  });

  it("esCodigoCobroFactura reconoce solo los códigos de la liga", () => {
    expect(esCodigoCobroFactura("COBRO_CON_OTRA_FACTURA")).toBe(true);
    expect(esCodigoCobroFactura("COBRO_FACTURA_NO_DISPONIBLE")).toBe(true);
    expect(esCodigoCobroFactura("FACTURA_DUPLICADA")).toBe(false);
    expect(esCodigoCobroFactura(null)).toBe(false);
  });
});
