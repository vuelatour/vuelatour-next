/**
 * 1 abono ↔ N cobros (12-oct-2026): la liga leída de `cobros_n`, la
 * selección del diálogo (varios cobros; sobre/ingreso solos), la suma guía,
 * los textos y los errores del API.
 */
import { describe, expect, it } from "vitest";
import type {
  AlVincularCobro,
  CandidatoCobroVuelo,
  CandidatoSobreGrupo,
  CobroLiberado,
  MovimientoBancario,
  MovimientoCobroParte,
} from "@/types/conciliacion";
import type { CandidatoIngresoAbono } from "@/types/ingresos";
import {
  AVISO_COMISION_MAYOR_15,
  BOTON_VINCULAR_PARCIAL,
  MAX_COBROS_LOTE,
  MENU_DESVINCULAR_ESTE_ABONO,
  MSG_API_SIN_CORREGIR_COMISION,
  MSG_LOTE_COBROS_API_VIEJO,
  MSG_LOTE_COBROS_SIN_MIGRACION,
  MSG_VINCULO_INCIERTO,
  NOTA_VARIOS_COBROS,
  NOTA_VARIOS_COBROS_SIN_PARCIALES,
  PISTA_DIALOGO_LEGADO,
  RAZON_BLOQUEO_COMISION,
  RAZON_BLOQUEO_EXCEDE,
  TITULO_DESVINCULAR_ESTE_ABONO,
  abonoConOtrosAbonosDelCobro,
  accionToastVinculo,
  alternarSeleccion,
  botonVincularAbono,
  guiaAlVincular,
  lineaCobroUnicoBandeja,
  lineaCortaAlVincular,
  notaVariosCobros,
  pasoAlPulsarVincular,
  pistaDialogoLegado,
  textoConfirmarCorregirComision,
  textoConfirmarParcial,
  textoCuadraExactoCandidato,
  textoExtraDesvincularLote,
  textoPaywiseEnLote,
  textoYaConciliadoCandidato,
  toastDesvinculoCobros,
  claveOpcion,
  coincideOpcion,
  esAbonoConLote,
  estadoLoteAbono,
  mensajeErrorVincularCobros,
  menuDesvincularCobros,
  numeroCobrosDe,
  resumenLoteCobrosFila,
  seleccionInicial,
  textoBusquedaCobros,
  textoConfirmarDesvincularCobros,
  textoSumaLoteAbono,
  tieneCobroLigado,
  tituloDesvincularCobros,
  toastVinculoCobros,
  type OpcionAbono,
} from "../conciliacion-cobros-lote";

const cobro = (id: string, folio: number, monto: number, extra: Partial<CandidatoCobroVuelo> = {}): OpcionAbono => ({
  tipo: "COBRO",
  c: {
    tipo: "COBRO_VUELO",
    id,
    cobro_id: id,
    vuelo_id: `v${folio}`,
    folio,
    fecha_vuelo: "2026-10-04T14:00:00Z",
    cliente: "Maqar",
    fecha_cobro: "2026-10-06T15:00:00Z",
    monto,
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    referencia: null,
    comision_banco_monto: null,
    neto: monto,
    dif_monto: Math.abs(monto - 3500),
    ...extra,
  },
});
const sobre: OpcionAbono = {
  tipo: "COBRO",
  c: {
    tipo: "SOBRE_GRUPO",
    id: "s1",
    cobro_grupo_id: "s1",
    grupo_id: "g1",
    grupo_folio: 12,
    grupo_nombre: "Familia Pérez",
    monto: 3500,
    moneda: "MXN",
    metodo: "TRANSFERENCIA",
    metodo_cobro: "TRANSFERENCIA",
    fecha: "2026-10-06T15:00:00Z",
    fecha_cobro: "2026-10-06T15:00:00Z",
    referencia: null,
    comision_banco_monto: null,
    neto: 3500,
    aviones_n: 2,
    cliente: "Pérez",
    dif_monto: 0,
  } as CandidatoSobreGrupo,
};
const ingreso: OpcionAbono = {
  tipo: "INGRESO",
  c: {
    tipo: "INGRESO",
    id: "i1",
    etiqueta: "ING-7",
    categoria: "OTRO_INGRESO",
    categoria_etiqueta: "Otros ingresos",
    es_anticipo: false,
    fecha: "2026-10-06",
    monto: 3500,
    comision_monto: null,
    neto: 3500,
    moneda: "MXN",
    cliente: null,
    descripcion: "Venta de aceite",
    cuenta_bancaria_id: "cta",
    cuenta_alias: "Scotia",
    otra_cuenta: false,
    dif_monto: 0,
  } as CandidatoIngresoAbono,
};
const c379 = cobro("c379", 379, 1000);
const c380 = cobro("c380", 380, 2600, { comision_banco_monto: 100, neto: 2500 });
const c381 = cobro("c381", 381, 500);
const OPCIONES = [c379, c380, c381, sobre, ingreso];

const MOV: MovimientoBancario = {
  id: "m1",
  cuenta_bancaria_id: "cta",
  fecha: "2026-10-06",
  tipo: "ABONO",
  monto: "3500.00",
  descripcion: "SPEI MAQAR",
  referencia: null,
  conciliado: true,
  gasto_id: null,
  cobro_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-10-07T12:00:00Z",
  cobros_n: 2,
  cobros: [
    { cobro_id: "c379", monto_parte: 1000, vuelo_id: "v379", folio: 379, cliente: "Maqar", fecha_cobro: "2026-10-06T15:00:00Z", fecha_vuelo: "2026-10-04T14:00:00Z", moneda: "MXN", neto: 1000 },
    { cobro_id: "c380", monto_parte: 2500, vuelo_id: "v380", folio: 380, cliente: "Maqar", fecha_cobro: "2026-10-06T15:00:00Z", moneda: "MXN", neto: 2500 },
  ],
  cobros_suma: 3500,
  cobros_diferencia: 0,
};

describe("la liga de un movimiento", () => {
  it("numeroCobrosDe / tieneCobroLigado / esAbonoConLote leen cobros_n (ausente = 0)", () => {
    expect(numeroCobrosDe({ cobros_n: "2" })).toBe(2);
    expect(numeroCobrosDe({})).toBe(0);
    expect(tieneCobroLigado({ cobro_id: null, cobro_grupo_id: null, cobros_n: 2 })).toBe(true);
    expect(tieneCobroLigado({ cobro_id: null, cobro_grupo_id: null })).toBe(false);
    expect(esAbonoConLote(MOV)).toBe(true);
    expect(esAbonoConLote({ tipo: "ABONO", cobros_n: 1 })).toBe(false);
    expect(esAbonoConLote({ tipo: "CARGO", cobros_n: 2 })).toBe(false);
  });
});

describe("selección del diálogo", () => {
  it("varios cobros de vuelo se acumulan; marcar de nuevo desmarca", () => {
    let s = alternarSeleccion([], c379, OPCIONES);
    expect(s).toEqual({ seleccion: ["COBRO_VUELO:c379"], aviso: null });
    s = alternarSeleccion(s.seleccion, c380, OPCIONES);
    expect(s.seleccion).toEqual(["COBRO_VUELO:c379", "COBRO_VUELO:c380"]);
    s = alternarSeleccion(s.seleccion, c379, OPCIONES);
    expect(s.seleccion).toEqual(["COBRO_VUELO:c380"]);
  });

  it("un sobre o un ingreso van SOLOS: desplazan lo marcado y lo dicen; un cobro sobre ellos también", () => {
    const conSobre = alternarSeleccion(["COBRO_VUELO:c379"], sobre, OPCIONES);
    expect(conSobre.seleccion).toEqual(["SOBRE_GRUPO:s1"]);
    expect(conSobre.aviso).toContain("se vincula solo");
    const vuelta = alternarSeleccion(conSobre.seleccion, c380, OPCIONES);
    expect(vuelta.seleccion).toEqual(["COBRO_VUELO:c380"]);
    expect(vuelta.aviso).toContain("no se combinan");
    const conIngreso = alternarSeleccion([], ingreso, OPCIONES);
    expect(conIngreso).toEqual({ seleccion: ["INGRESO:i1"], aviso: null });
    expect(claveOpcion(ingreso)).toBe("INGRESO:i1");
  });

  it("tope de cobros por abono", () => {
    const muchos = Array.from({ length: MAX_COBROS_LOTE }, (_, i) => `COBRO_VUELO:x${i}`);
    const opciones = muchos.map((k) => cobro(k.split(":")[1], 1, 1));
    const r = alternarSeleccion(muchos, c379, [...opciones, c379]);
    expect(r.seleccion).toEqual(muchos);
    expect(r.aviso).toContain(String(MAX_COBROS_LOTE));
  });

  it("seleccionInicial marca los cobros que el abono ya paga (y solo los que están en la lista)", () => {
    expect(seleccionInicial(["c379", "c999"], OPCIONES)).toEqual(["COBRO_VUELO:c379"]);
    expect(seleccionInicial(undefined, OPCIONES)).toEqual([]);
  });

  it("coincideOpcion busca por folio, cliente, grupo, ING-n o monto, sin acentos", () => {
    expect(coincideOpcion(c379, "379")).toBe(true);
    expect(coincideOpcion(c379, "maqar")).toBe(true);
    expect(coincideOpcion(c379, "1000")).toBe(true);
    expect(coincideOpcion(c379, "380")).toBe(false);
    expect(coincideOpcion(sobre, "perez")).toBe(true);
    expect(coincideOpcion(ingreso, "ing-7")).toBe(true);
    expect(coincideOpcion(ingreso, "aceite")).toBe(true);
  });
});

describe("la suma guía contra el abono", () => {
  it("dos cobros que cuadran (por su NETO) ⇒ verde", () => {
    const e = estadoLoteAbono({ montoAbono: "3500", monedaCuenta: "MXN", cobros: [c379.c, c380.c] });
    expect(e).toMatchObject({ n: 2, suma: 3500, diferencia: 0, tolerancia: 0.02, cuadra: true });
    expect(textoSumaLoteAbono(e)).toEqual({
      texto: "2 cobros suman $3,500 MXN · cuadra con el abono de $3,500 MXN",
      tono: "verde",
    });
  });

  it("faltan / se pasan / otra moneda / un solo cobro", () => {
    const faltan = textoSumaLoteAbono(estadoLoteAbono({ montoAbono: 3500, monedaCuenta: "MXN", cobros: [c379.c, c381.c] }));
    expect(faltan?.tono).toBe("ambar");
    expect(faltan?.texto).toContain("faltan $2,000 MXN");
    const sePasan = textoSumaLoteAbono(
      estadoLoteAbono({ montoAbono: 3000, monedaCuenta: "MXN", cobros: [c379.c, c380.c] }),
    );
    expect(sePasan?.tono).toBe("rojo");
    expect(sePasan?.texto).toContain("se pasan $500 MXN");
    const usd = textoSumaLoteAbono(
      estadoLoteAbono({ montoAbono: 3500, monedaCuenta: "MXN", cobros: [c379.c, { ...c380.c, moneda: "USD" }] }),
    );
    expect(usd?.tono).toBe("rojo");
    expect(usd?.texto).toContain("todos estén en MXN");
    const uno = textoSumaLoteAbono(estadoLoteAbono({ montoAbono: 3500, monedaCuenta: "MXN", cobros: [c379.c] }));
    expect(uno?.tono).toBe("ambar");
    expect(uno?.texto).toContain("1 cobro: $1,000 MXN");
    expect(textoSumaLoteAbono(estadoLoteAbono({ montoAbono: 1, monedaCuenta: null, cobros: [] }))).toBeNull();
  });
});

describe("textos", () => {
  it("botón y toast según lo marcado", () => {
    expect(botonVincularAbono([])).toBe("Vincular");
    expect(botonVincularAbono([c379])).toBe("Vincular el cobro");
    expect(botonVincularAbono([sobre])).toBe("Vincular el pago del grupo");
    expect(botonVincularAbono([ingreso])).toBe("Vincular el ingreso");
    expect(botonVincularAbono([c379, c380])).toBe("Vincular 2 cobros");
    expect(toastVinculoCobros([c379, c380])).toBe("Abono conciliado con 2 cobros: vuelos #379 y #380");
    expect(toastVinculoCobros([c379, c380, c381])).toBe("Abono conciliado con 3 cobros: vuelos #379, #380 y #381");
    expect(toastVinculoCobros([c379])).toBe("Abono conciliado con el cobro del vuelo #379");
    expect(toastVinculoCobros([sobre])).toBe("Abono conciliado con el pago del grupo G-12");
    expect(toastVinculoCobros([ingreso])).toBe("Abono conciliado con ING-7");
  });

  it("menú y confirmación de desvincular", () => {
    expect(menuDesvincularCobros(2)).toBe("Desvincular los 2 cobros");
    expect(tituloDesvincularCobros(2)).toBe("¿Desvincular los 2 cobros?");
    expect(textoConfirmarDesvincularCobros(2)).toContain("2 cobros vuelven a «Cobros sin banco»");
    expect(textoConfirmarDesvincularCobros(2)).toContain("No se borra ningún cobro");
  });

  it("resumen de la fila y texto de búsqueda", () => {
    const r = resumenLoteCobrosFila(MOV);
    expect(r?.titulo).toBe("2 cobros · $3,500 MXN");
    expect(r?.lineas.map((l) => [l.href, l.principal])).toEqual([
      ["/admin/flights/v379", "Vuelo #379 · Maqar"],
      ["/admin/flights/v380", "Vuelo #380 · Maqar"],
    ]);
    expect(r?.lineas[0].secundaria).toContain("vuelo 04 oct 2026");
    expect(r?.lineas[0].secundaria).toContain("$1,000 MXN");
    expect(r?.diferencia).toBeNull();
    expect(resumenLoteCobrosFila({ ...MOV, cobros_diferencia: 0.01 })?.diferencia).toBe("diferencia $0.01 MXN");
    expect(resumenLoteCobrosFila({ ...MOV, cobros: undefined })).toBeNull();
    expect(textoBusquedaCobros(MOV)).toContain("#379 Maqar 1000");
    expect(textoBusquedaCobros({ ...MOV, cobros: null })).toBe("");
  });

  it("errores del API en es-MX y qué hacer", () => {
    expect(mensajeErrorVincularCobros({ code: "API_SIN_LOTE_COBROS" })).toEqual({
      titulo: MSG_LOTE_COBROS_API_VIEJO,
      recargar: false,
      apiSinLote: true,
    });
    expect(mensajeErrorVincularCobros({ code: "CONCILIACION_COBROS_NO_DISPONIBLE" }).titulo).toBe(
      MSG_LOTE_COBROS_SIN_MIGRACION,
    );
    expect(mensajeErrorVincularCobros({ code: "ABONO_NO_CUADRA", error: "Los 2 cobros suman…" })).toMatchObject({
      titulo: "Los 2 cobros suman…",
      recargar: false,
    });
    expect(mensajeErrorVincularCobros({ code: "COBRO_YA_CONCILIADO", error: "ya está" })).toMatchObject({
      recargar: true,
    });
    expect(mensajeErrorVincularCobros({ code: "COBRO_DE_GRUPO", error: "parte" }).descripcion).toContain("Grupo");
    expect(mensajeErrorVincularCobros({ status: 404 }).recargar).toBe(true);
    expect(mensajeErrorVincularCobros({ error: "Bad Gateway", status: 502 }).titulo).not.toContain("Bad Gateway");
    expect(mensajeErrorVincularCobros({ error: "Otro texto del API", status: 409 })).toEqual({
      titulo: "Otro texto del API",
      recargar: true,
      apiSinLote: false,
    });
  });
});

// ═══════════ UN COBRO, VARIOS ABONOS (14-oct-2026, API 0.0.78, invariante 77) ═══════════
// Casos reales: las dos camionetas de $1,700 contra el cobro de $3,400 de la
// #315; el depósito de $69,183 = $68,205.55 (#315) + $977.45 (#332); el link
// HSBC del #293 con la comisión mal provisionada. Todos los números son del
// API (`al_vincular`, `cobros_estado`, `cobros_liberados`): aquí solo se redactan.

const C315 = "c3150000-0000-4000-8000-000000000315";
const C332 = "c3320000-0000-4000-8000-000000000332";
const C293 = "c2930000-0000-4000-8000-000000000293";
const MOV_A = "a1700000-0000-4000-8000-00000000000a";

const al = (over: Partial<AlVincularCobro> = {}): AlVincularCobro => ({
  estado: "CONCILIADO",
  faltante_antes: 0,
  faltante_despues: 0,
  sobrante: 0,
  comision_real: null,
  tc_implicito: null,
  tc_referencia: null,
  desvio_pct: null,
  motivo: null,
  un_solo: false,
  ...over,
});
const cand = (id: string, folio: number, monto: number, over: Partial<CandidatoCobroVuelo> = {}): OpcionAbono => ({
  tipo: "COBRO",
  c: {
    tipo: "COBRO_VUELO",
    id,
    cobro_id: id,
    vuelo_id: `v${folio}`,
    folio,
    fecha_vuelo: "2026-09-14T14:00:00Z",
    cliente: "Beh Kay",
    fecha_cobro: "2026-09-15T17:00:00Z",
    monto,
    moneda: "MXN",
    metodo_cobro: "TRANSFERENCIA",
    referencia: null,
    comision_banco_monto: null,
    neto: monto,
    dif_monto: 0,
    ...over,
  },
});
const ABONO_1700 = { monto: 1700, moneda: "MXN", fecha: "2026-09-15" };

/** Primer abono de $1,700 contra el cobro de $3,400: queda PARCIAL. */
const PARCIAL_315 = cand(C315, 315, 3400, {
  dif_monto: 1700,
  al_vincular: al({ estado: "PARCIAL", faltante_antes: 3400, faltante_despues: 1700 }),
});
/** Segundo abono de $1,700: completa el cobro (ya tenía uno). */
const COMPLETA_315 = cand(C315, 315, 3400, {
  parcial: true,
  monto_vinculado: 1700,
  faltante: 1700,
  abonos_n: 1,
  abonos: [{ movimiento_id: MOV_A, fecha: "2026-09-15", monto_parte: 1700 }],
  al_vincular: al({ faltante_antes: 1700 }),
});
/** $69,183 contra lo que le falta a la #315 ($68,205.55): sobran $977.45, que le faltan a la #332. */
const SUGERIDO_332 = {
  cobro_id: C332,
  vuelo_id: "v332",
  folio: 332,
  cliente: "Beh Kay",
  fecha_cobro: "2026-09-15T17:00:00Z",
  monto: 977.45,
  moneda: "MXN",
  faltante: 977.45,
};
const EXCEDE_315 = cand(C315, 315, 68205.55, {
  dif_monto: 977.45,
  al_vincular: al({
    estado: "EXCEDE",
    faltante_antes: 68205.55,
    faltante_despues: 68205.55,
    sobrante: 977.45,
    sugeridos: [SUGERIDO_332],
  }),
});
const C332_LIBRE = cand(C332, 332, 977.45, { dif_monto: 68205.55, al_vincular: al({ estado: "EXCEDE", sobrante: 68205.55 }) });
/** Link HSBC del #293: $13,000 con $1,129.76 de comisión registrada; el banco depositó $11,800. */
const COMISION_293 = cand(C293, 293, 13000, {
  metodo_cobro: "HSBC_LINK",
  comision_banco_monto: 1129.76,
  neto: 11870.24,
  dif_monto: 70.24,
  al_vincular: al({
    estado: "COMISION_NO_CUADRA",
    faltante_antes: 11870.24,
    faltante_despues: 11870.24,
    comision_real: 1200,
    motivo: "COMISION",
    un_solo: true,
  }),
});
const ABONO_11800 = { monto: 11800, moneda: "MXN" };

describe("guiaAlVincular: el veredicto del API con UN cobro marcado (D18)", () => {
  it("PARCIAL: ámbar, no apaga, pide confirmación (textos.dialogo_vincular.guia_PARCIAL)", () => {
    expect(guiaAlVincular(PARCIAL_315, ABONO_1700)).toEqual({
      texto:
        "Este abono ($1,700 MXN) es menor que lo que falta del cobro del vuelo #315 ($3,400 MXN): el cobro quedará conciliado parcial y faltarán $1,700 MXN. Cuando llegue el resto, vincúlalo a este mismo cobro.",
      tono: "ambar",
      bloquea: false,
      razon: null,
      parcial: true,
      acciones: [],
    });
  });

  it("CONCILIADO: un abono que cuadra y el que COMPLETA un cobro con otro abono", () => {
    const uno = guiaAlVincular(cand(C315, 315, 3400, { al_vincular: al() }), { monto: 3400, moneda: "MXN" });
    expect(uno?.texto).toBe("1 cobro: cuadra con el abono · el cobro del vuelo #315 queda conciliado.");
    expect(uno).toMatchObject({ tono: "verde", bloquea: false, parcial: false });
    expect(guiaAlVincular(COMPLETA_315, ABONO_1700)?.texto).toBe(
      "Con este abono el cobro del vuelo #315 queda completo ($3,400 MXN con 2 abonos).",
    );
    // Dentro de la tolerancia del API ($1.00): lo dice sin «cuadra».
    const casi = guiaAlVincular(cand(C315, 315, 3400, { dif_monto: 0.5, al_vincular: al() }), { monto: 3399.5, moneda: "MXN" });
    expect(casi?.texto).toBe(
      "1 cobro: $3,400 MXN (diferencia $0.50 MXN contra el abono, dentro de la tolerancia) · el cobro del vuelo #315 queda conciliado.",
    );
  });

  it("EXCEDE: apaga con la razón y ofrece «Agregar el cobro del vuelo #332» y «Buscar $977.45»", () => {
    const g = guiaAlVincular(EXCEDE_315, { monto: 69183, moneda: "MXN" }, { enLista: new Set([C315, C332]) });
    expect(g?.texto).toBe(
      "Este abono ($69,183 MXN) es mayor que lo que falta del cobro del vuelo #315 ($68,205.55 MXN): sobran $977.45 MXN. Si el depósito pagó también otro vuelo, márcalo también (la suma debe cuadrar con el abono). Si el cobro está mal capturado, corrígelo antes de vincular. Si el otro cobro todavía no está registrado, regístralo en su vuelo por $977.45 MXN y vuelve a «Vincular».",
    );
    expect(g).toMatchObject({ tono: "rojo", bloquea: true, razon: RAZON_BLOQUEO_EXCEDE, parcial: false });
    expect(g?.razon).toBe("El abono rebasa este cobro: marca también el otro vuelo");
    expect(g?.acciones).toEqual([
      { tipo: "MARCAR_SUGERIDO", etiqueta: "Agregar el cobro del vuelo #332", cobro_id: C332 },
      { tipo: "BUSCAR", etiqueta: "Buscar $977.45", buscar: "977.45" },
    ]);
    // Un sugerido que no está en la lista no se ofrece (solo «Buscar»).
    expect(
      guiaAlVincular(EXCEDE_315, { monto: 69183, moneda: "MXN" }, { enLista: new Set([C315]) })?.acciones.map((a) => a.tipo),
    ).toEqual(["BUSCAR"]);
    // El diálogo legado de UN cobro: sin salidas de un clic, con la pista de dónde están.
    expect(guiaAlVincular(EXCEDE_315, { monto: 69183, moneda: "MXN" }, { conAcciones: false })?.acciones).toEqual([]);
    expect(pistaDialogoLegado(EXCEDE_315)).toBe(PISTA_DIALOGO_LEGADO);
    expect(pistaDialogoLegado(COMISION_293)).toBe(PISTA_DIALOGO_LEGADO);
    expect(pistaDialogoLegado(PARCIAL_315)).toBeNull();
    expect(pistaDialogoLegado(ingreso)).toBeNull();
  });

  it("EXCEDE de un cobro «de un solo abono» (comisión o pasarela): su texto propio", () => {
    const g = guiaAlVincular(
      cand(C293, 293, 13000, {
        comision_banco_monto: 1129.76,
        neto: 11870.24,
        al_vincular: al({ estado: "EXCEDE", sobrante: 1229.76, un_solo: true, faltante_antes: 11870.24 }),
      }),
      { monto: 13100, moneda: "MXN" },
    );
    expect(g?.texto).toContain("es mayor que el cobro del vuelo #293 ($13,000 MXN), que se concilia con un solo depósito");
    expect(g?.bloquea).toBe(true);
  });

  it("COMISION_NO_CUADRA: la comisión real del API y «Corregir la comisión a $1,200 y vincular» SOLO con la capacidad", () => {
    const con = guiaAlVincular(COMISION_293, ABONO_11800, { corregirComision: true });
    expect(con?.texto).toBe(
      "El cobro del vuelo #293 espera $11,870.24 MXN después de la comisión registrada ($1,129.76) y el depósito es de $11,800 MXN: la comisión real fue $1,200 (9.23 %).",
    );
    expect(con).toMatchObject({ tono: "rojo", bloquea: true, razon: RAZON_BLOQUEO_COMISION });
    expect(con?.acciones).toEqual([
      { tipo: "CORREGIR_COMISION", etiqueta: "Corregir la comisión a $1,200 y vincular", comision: 1200 },
    ]);
    // Un API previo (sin `corregir_comision`): ni el botón ni la promesa.
    const sin = guiaAlVincular(COMISION_293, ABONO_11800);
    expect(sin?.acciones).toEqual([]);
    expect(sin?.texto).toContain("Corrige la comisión del cobro en el vuelo y vuelve a «Vincular».");
    // El banco depositó MÁS que el cobro: no hay comisión que corregir hacia arriba.
    const mas = guiaAlVincular(
      cand(C293, 293, 13000, {
        comision_banco_monto: 1129.76,
        neto: 11870.24,
        al_vincular: al({ estado: "COMISION_NO_CUADRA", comision_real: 0, motivo: "COMISION", un_solo: true }),
      }),
      { monto: 13000.5, moneda: "MXN" },
      { corregirComision: true },
    );
    expect(mas?.texto).toContain("más que el cobro: revisa la comisión registrada");
    expect(mas?.acciones).toEqual([]);
    // Sin la comisión real del API: el panel no la resta por su cuenta ni ofrece corregir.
    const sinReal = guiaAlVincular(
      cand(C293, 293, 13000, {
        comision_banco_monto: 1129.76,
        neto: 11870.24,
        al_vincular: al({ estado: "COMISION_NO_CUADRA", comision_real: null, motivo: "COMISION", un_solo: true }),
      }),
      ABONO_11800,
      { corregirComision: true },
    );
    expect(sinReal?.texto).toContain("la comisión registrada no cuadra con el depósito.");
    expect(sinReal?.texto).not.toContain("la comisión real fue");
    expect(sinReal?.acciones).toEqual([]);
  });

  it("YA_CUBIERTO, UN_SOLO_ABONO, MONEDA_DISTINTA y SOBRE_NO_CUADRA apagan con su texto", () => {
    const cubierto = guiaAlVincular(
      cand(C315, 315, 3400, { parcial: false, abonos_n: 2, al_vincular: al({ estado: "YA_CUBIERTO", motivo: "CUBIERTO" }) }),
      ABONO_1700,
    );
    expect(cubierto?.texto).toBe(
      "El cobro del vuelo #315 ya está conciliado completo ($3,400 MXN con 2 abonos): si este abono es otro pago, regístralo como un cobro nuevo.",
    );
    expect(cubierto?.bloquea).toBe(true);
    expect(cubierto?.razon).toBe(cubierto?.texto);
    const unSolo = guiaAlVincular(
      cand(C293, 293, 13000, { abonos_n: 1, al_vincular: al({ estado: "UN_SOLO_ABONO", motivo: "PASARELA", un_solo: true }) }),
      ABONO_11800,
    );
    expect(unSolo?.texto).toMatch(/^El cobro del vuelo #293 se concilia con un solo depósito \(link de pago o pasarela\) y ya tiene uno\./);
    const lejos = guiaAlVincular(
      cand(C315, 315, 200, {
        moneda: "USD",
        al_vincular: al({ estado: "MONEDA_DISTINTA", motivo: "TC_LEJOS", tc_implicito: 20.4, tc_referencia: 17.15, desvio_pct: 19 }),
      }),
      { monto: 4080, moneda: "MXN" },
    );
    expect(lejos?.texto).toContain("da un tipo de cambio de 20.4, lejos del T.C. de referencia (17.15, +19.0 %)");
    expect(lejos?.bloquea).toBe(true);
    const sobre: OpcionAbono = {
      tipo: "COBRO",
      c: {
        tipo: "SOBRE_GRUPO",
        id: "s12",
        cobro_grupo_id: "s12",
        grupo_id: "g12",
        grupo_folio: 12,
        grupo_nombre: "Familia Pérez",
        monto: 11000,
        moneda: "MXN",
        metodo: "TRANSFERENCIA",
        metodo_cobro: "TRANSFERENCIA",
        fecha: "2026-09-15T17:00:00Z",
        fecha_cobro: "2026-09-15T17:00:00Z",
        referencia: null,
        comision_banco_monto: 199.24,
        neto: 10800.76,
        aviones_n: 2,
        cliente: "Pérez",
        dif_monto: 800.76,
        al_vincular: { estado: "SOBRE_NO_CUADRA", diferencia: -800.76 },
      },
    };
    const g = guiaAlVincular(sobre, { monto: 10000, moneda: "MXN" });
    expect(g?.texto).toBe(
      "El abono ($10,000 MXN) no cuadra con el sobre del grupo G-12 ($10,800.76 MXN después de la comisión): faltan $800.76 MXN. Revisa que sea el depósito del grupo o corrige el sobre antes de vincular.",
    );
    expect(g?.bloquea).toBe(true);
    // El sobre que cuadra: sin guía (la de siempre).
    expect(guiaAlVincular({ ...sobre, c: { ...sobre.c, al_vincular: { estado: "CONCILIADO", diferencia: 0 } } } as OpcionAbono, { monto: 10800.76 })).toBeNull();
  });

  it("API previo (sin `al_vincular`) o un ingreso: null ⇒ la suma guía de siempre", () => {
    expect(guiaAlVincular(c379, { monto: 3500, moneda: "MXN" })).toBeNull();
    expect(guiaAlVincular(ingreso, { monto: 3500, moneda: "MXN" })).toBeNull();
  });

  it("botón «Vincular como parcial…» y qué hace el clic (el API no se llama sin confirmar el parcial)", () => {
    expect(botonVincularAbono([PARCIAL_315])).toBe(BOTON_VINCULAR_PARCIAL);
    expect(BOTON_VINCULAR_PARCIAL).toBe("Vincular como parcial…");
    expect(botonVincularAbono([COMPLETA_315])).toBe("Vincular el cobro");
    expect(pasoAlPulsarVincular(0, null)).toBe("ELEGIR");
    expect(pasoAlPulsarVincular(1, guiaAlVincular(PARCIAL_315, ABONO_1700))).toBe("CONFIRMAR_PARCIAL");
    expect(pasoAlPulsarVincular(1, guiaAlVincular(EXCEDE_315, { monto: 69183, moneda: "MXN" }))).toBe("BLOQUEADO");
    expect(pasoAlPulsarVincular(1, guiaAlVincular(COMPLETA_315, ABONO_1700))).toBe("LIGAR");
    // 2+ cobros: no hay guía de UN cobro y la suma nunca apaga (manda el 409 ABONO_NO_CUADRA).
    expect(pasoAlPulsarVincular(2, null)).toBe("LIGAR");
  });

  it("línea corta de cada candidato y lo que ya tiene un cobro PARCIAL", () => {
    expect(lineaCortaAlVincular(PARCIAL_315)).toEqual({ texto: "si lo vinculas, queda parcial: faltarían $1,700 MXN", tono: "ambar" });
    expect(lineaCortaAlVincular(EXCEDE_315)).toEqual({ texto: "el abono rebasa este cobro por $977.45 MXN", tono: "rojo" });
    expect(lineaCortaAlVincular(COMISION_293)?.tono).toBe("rojo");
    expect(lineaCortaAlVincular(COMPLETA_315)).toBeNull();
    expect(lineaCortaAlVincular(c379)).toBeNull();
    expect(textoYaConciliadoCandidato(COMPLETA_315.c as CandidatoCobroVuelo)).toBe(
      "ya conciliado $1,700 de $3,400 (1 abono) · falta $1,700",
    );
    expect(textoYaConciliadoCandidato(PARCIAL_315.c as CandidatoCobroVuelo)).toBeNull();
    expect(textoCuadraExactoCandidato({ parcial: true })).toBe("cuadra exacto con lo que falta");
    expect(textoCuadraExactoCandidato({})).toBe("cuadra exacto con el abono");
    // «Buscar $977.45» encuentra al cobro por lo que le FALTA y por «parcial».
    const parcial332 = cand(C332, 332, 1954.9, { parcial: true, monto_vinculado: 977.45, faltante: 977.45, abonos_n: 1 });
    expect(coincideOpcion(parcial332, "977.45")).toBe(true);
    expect(coincideOpcion(parcial332, "parcial")).toBe(true);
    expect(coincideOpcion(C332_LIBRE, "parcial")).toBe(false);
  });

  it("confirmaciones: «¿Vincular como pago parcial?» y «¿Corregir la comisión y vincular?» (aviso arriba de 15 %)", () => {
    expect(textoConfirmarParcial(PARCIAL_315, ABONO_1700)).toEqual({
      titulo: "¿Vincular como pago parcial?",
      cuerpo:
        "El abono de $1,700 MXN del 15 sep 2026 cubre solo una parte del cobro del vuelo #315 ($3,400 MXN). El cobro quedará «Conciliado parcial · faltan $1,700 MXN» y seguirá en «Cobros sin banco» hasta que vincules el resto. Úsalo cuando el cliente pagó el cobro en varias transferencias. Si en realidad son dos cobros distintos, mejor regístralos por separado.",
      aviso: null,
      boton: "Sí, vincular como parcial",
    });
    // Un segundo parcial (el cobro ya tenía un abono): dice lo que le falta.
    const segundo = cand(C315, 315, 5100, {
      parcial: true,
      monto_vinculado: 1700,
      faltante: 3400,
      abonos_n: 1,
      al_vincular: al({ estado: "PARCIAL", faltante_antes: 3400, faltante_despues: 1700 }),
    });
    expect(textoConfirmarParcial(segundo, ABONO_1700)?.cuerpo).toContain(
      "cubre solo una parte de lo que le falta al cobro del vuelo #315 ($3,400 MXN de $5,100 MXN)",
    );
    expect(textoConfirmarParcial(COMPLETA_315, ABONO_1700)).toBeNull();
    const comision = textoConfirmarCorregirComision(COMISION_293, ABONO_11800);
    expect(comision).toEqual({
      titulo: "¿Corregir la comisión y vincular?",
      cuerpo:
        "El cobro del vuelo #293 tiene registrada una comisión de $1,129.76 MXN y el banco depositó $11,800 MXN de $13,000 MXN: la comisión real fue $1,200 MXN (9.23 %). Se guardará $1,200 como comisión del cobro y después se vinculará el depósito.",
      aviso: null,
      boton: "Sí, corregir y vincular",
    });
    const alta = cand(C293, 293, 10000, {
      comision_banco_monto: 300,
      neto: 9700,
      al_vincular: al({ estado: "COMISION_NO_CUADRA", comision_real: 2000, motivo: "COMISION", un_solo: true }),
    });
    expect(textoConfirmarCorregirComision(alta, { monto: 8000, moneda: "MXN" })?.aviso).toBe(AVISO_COMISION_MAYOR_15);
    expect(AVISO_COMISION_MAYOR_15).toBe(
      "Ojo: la comisión real es mayor que 15 % del cobro. Revisa que sea el depósito correcto antes de seguir.",
    );
    expect(textoConfirmarCorregirComision(PARCIAL_315, ABONO_1700)).toBeNull();
  });
});

describe("la suma guía de un LOTE va por lo que le FALTA a cada cobro (API 0.0.78)", () => {
  it("#278 ya tenía $10,000: entra por sus $18,001 y el texto lo dice; nunca apaga", () => {
    const c278 = cand("c278", 278, 28001, { parcial: true, monto_vinculado: 10000, faltante: 18001, abonos_n: 1 });
    const c279 = cand("c279", 279, 50999, { faltante: 50999 });
    const e = estadoLoteAbono({
      montoAbono: 69000,
      monedaCuenta: "MXN",
      cobros: [c278.c as CandidatoCobroVuelo, c279.c as CandidatoCobroVuelo],
    });
    expect(e).toMatchObject({ n: 2, suma: 69000, diferencia: 0, cuadra: true, porFaltante: true });
    expect(textoSumaLoteAbono(e)).toEqual({
      texto: "2 cobros suman $69,000 MXN (lo que le falta a cada uno) · cuadra con el abono de $69,000 MXN",
      tono: "verde",
    });
  });

  it("la nota bajo la lista según la capacidad `cobros_parciales`", () => {
    expect(notaVariosCobros(true)).toBe(NOTA_VARIOS_COBROS);
    expect(NOTA_VARIOS_COBROS).toContain("vincula cada transferencia al mismo cobro: queda «Conciliado parcial» hasta completarlo.");
    expect(notaVariosCobros(false)).toBe(NOTA_VARIOS_COBROS_SIN_PARCIALES);
    expect(notaVariosCobros(undefined)).toBe(NOTA_VARIOS_COBROS_SIN_PARCIALES);
  });
});

describe("toasts tras vincular con `cobros_estado[]` / `comision_corregida` (textos.toasts)", () => {
  const parte = (over: Partial<MovimientoCobroParte> = {}): MovimientoCobroParte => ({
    cobro_id: C315,
    monto_parte: 1700,
    vuelo_id: "v315",
    folio: 315,
    moneda: "MXN",
    fecha_cobro: "2026-09-15T17:00:00Z",
    ...over,
  });

  it("PARCIAL con «Buscar el abono que falta»; completo con 2 abonos; comisión corregida", () => {
    const parcial = { cobros_estado: [parte({ cobro_estado: "PARCIAL", cobro_faltante: 1700, cobro_abonos_n: 1 })] };
    expect(toastVinculoCobros([PARCIAL_315], parcial)).toBe(
      "Abono vinculado: el cobro del vuelo #315 queda conciliado PARCIAL (faltan $1,700 MXN).",
    );
    expect(accionToastVinculo([PARCIAL_315], parcial)).toEqual({
      etiqueta: "Buscar el abono que falta",
      href: "/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700",
    });
    const completo = { cobros_estado: [parte({ cobro_estado: "CONCILIADO", cobro_faltante: 0, cobro_abonos_n: 2 })] };
    expect(toastVinculoCobros([COMPLETA_315], completo)).toBe(
      "Abono vinculado: el cobro del vuelo #315 quedó conciliado completo con 2 abonos.",
    );
    expect(accionToastVinculo([COMPLETA_315], completo)).toBeNull();
    const corregida = {
      cobros_estado: [parte({ cobro_id: C293, folio: 293, cobro_estado: "CONCILIADO", cobro_faltante: 0, cobro_abonos_n: 1 })],
      comision_corregida: { cobro_id: C293, antes: 1129.76, despues: 1200 },
    };
    expect(toastVinculoCobros([COMISION_293], corregida)).toBe(
      "Comisión corregida a $1,200 y abono vinculado: el cobro del vuelo #293 quedó conciliado.",
    );
    // Sin cambio de comisión (ya era esa) ⇒ el texto de un cobro conciliado de siempre.
    expect(
      toastVinculoCobros([COMISION_293], { ...corregida, comision_corregida: { cobro_id: C293, antes: 1200, despues: 1200 } }),
    ).toBe("Abono conciliado con el cobro del vuelo #293");
  });

  it("API previo (sin `cobros_estado`) o un lote: el texto de siempre", () => {
    expect(toastVinculoCobros([PARCIAL_315], {})).toBe("Abono conciliado con el cobro del vuelo #315");
    expect(toastVinculoCobros([PARCIAL_315])).toBe("Abono conciliado con el cobro del vuelo #315");
    expect(toastVinculoCobros([c379, c380], { cobros_estado: [] })).toBe("Abono conciliado con 2 cobros: vuelos #379 y #380");
    expect(accionToastVinculo([c379, c380], null)).toBeNull();
  });
});

describe("errores NUEVOS del API 0.0.78 (al final; el título es el texto del API)", () => {
  it("ABONO_EXCEDE_COBRO: «Marca … (busca $977.45)», sin soltar lo marcado", () => {
    const e = mensajeErrorVincularCobros({
      code: "ABONO_EXCEDE_COBRO",
      status: 409,
      error: "Este abono ($69,183.00 MXN) es mayor que lo que falta del cobro del vuelo #315…",
      details: { excedente: 977.45, sugeridos: [SUGERIDO_332] },
    });
    expect(e).toEqual({
      titulo: "Este abono ($69,183.00 MXN) es mayor que lo que falta del cobro del vuelo #315…",
      descripcion: "Marca también el cobro del vuelo #332 en la lista (busca $977.45).",
      recargar: false,
      apiSinLote: false,
    });
    expect(
      mensajeErrorVincularCobros({ code: "ABONO_EXCEDE_COBRO", status: 409, error: "x", details: { excedente: 977.45, sugeridos: [] } })
        .descripcion,
    ).toBe("Marca el otro vuelo en la lista (busca $977.45).");
  });

  it("COMISION_NO_CUADRA (y la comisión que YA quedó corregida si la liga falló después)", () => {
    expect(mensajeErrorVincularCobros({ code: "COMISION_NO_CUADRA", status: 409, error: "El cobro del vuelo #293…" })).toEqual({
      titulo: "El cobro del vuelo #293…",
      descripcion: "Usa «Corregir la comisión y vincular» o corrígela en el vuelo.",
      recargar: false,
      apiSinLote: false,
    });
    expect(
      mensajeErrorVincularCobros({ code: "COMISION_NO_CUADRA", status: 409, error: "x", details: { corregible: false } }).descripcion,
    ).toBeUndefined();
    expect(
      mensajeErrorVincularCobros({
        code: "ABONO_EXCEDE_COBRO",
        status: 409,
        error: "x",
        details: { comision_corregida: { cobro_id: C293, antes: 1129.76, despues: 1200 } },
      }).comisionCorregida,
    ).toBe(true);
    // Con CUALQUIER código (una carrera con otra liga): la comisión ya cambió y el diálogo lo sabe.
    expect(
      mensajeErrorVincularCobros({
        code: "COBRO_YA_CONCILIADO",
        status: 409,
        error: "ya está",
        details: { comision_corregida: { cobro_id: C293, antes: 1129.76, despues: 1200 } },
      }),
    ).toMatchObject({ recargar: true, comisionCorregida: true });
    expect(mensajeErrorVincularCobros({ code: "COBRO_YA_CONCILIADO", error: "ya está" }).comisionCorregida).toBeUndefined();
  });

  it("los demás: moneda, sobre, corregir no aplica (recarga), sin migración, API previo y sin respuesta (incierto)", () => {
    expect(mensajeErrorVincularCobros({ code: "COBRO_MONEDA_DISTINTA", status: 409, error: "T.C." })).toMatchObject({
      titulo: "T.C.",
      recargar: false,
    });
    expect(mensajeErrorVincularCobros({ code: "SOBRE_NO_CUADRA", status: 409, error: "sobre" })).toMatchObject({
      titulo: "sobre",
      recargar: false,
    });
    expect(mensajeErrorVincularCobros({ code: "CORREGIR_COMISION_NO_APLICA", status: 400, error: "no aplica" })).toMatchObject({
      titulo: "no aplica",
      recargar: true,
    });
    expect(
      mensajeErrorVincularCobros({ code: "CONCILIACION_COBROS_PARCIALES_NO_DISPONIBLE", status: 503, error: "falta la migración" }),
    ).toMatchObject({ titulo: "falta la migración", recargar: false });
    expect(mensajeErrorVincularCobros({ code: "API_SIN_CORREGIR_COMISION", status: 400 })).toEqual({
      titulo: MSG_API_SIN_CORREGIR_COMISION,
      recargar: false,
      apiSinLote: false,
    });
    expect(MSG_API_SIN_CORREGIR_COMISION).toBe(
      "Corregir la comisión desde aquí necesita la versión nueva del servidor: corrígela en el vuelo y vuelve a vincular.",
    );
    expect(mensajeErrorVincularCobros({ code: "SIN_CONEXION", error: "No hubo conexión" })).toEqual({
      titulo: MSG_VINCULO_INCIERTO,
      recargar: true,
      apiSinLote: false,
      incierto: true,
    });
  });
});

describe("la bandeja: estado del cobro de cada abono (textos.bandeja)", () => {
  const abonoUnico = (over: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
    ...MOV,
    id: MOV_A,
    monto: "1700.00",
    cobros_n: 1,
    cobros: undefined,
    cobro_id: C315,
    cobro: { monto: "3400", moneda: "MXN", metodo_cobro: "TRANSFERENCIA", fecha_cobro: "2026-09-15T17:00:00Z", vuelo_id: "v315", vuelo: { folio: 315 } },
    cobro_conciliacion: {
      cobro_id: C315,
      folio: 315,
      estado: "PARCIAL",
      neto: 3400,
      monto_vinculado: 1700,
      faltante: 1700,
      sobrante: 0,
      abonos_n: 1,
      faltante_sin_este: 3400,
      abonos: [{ movimiento_id: MOV_A, fecha: "2026-09-15", monto_parte: 1700 }],
    },
    ...over,
  });

  it("UN cobro: «Pago parcial: este abono $1,700 de $3,400 · faltan $1,700 MXN» / «Completa el cobro junto con 1 abono más»", () => {
    expect(lineaCobroUnicoBandeja(abonoUnico())).toEqual({
      texto: "Pago parcial: este abono $1,700 de $3,400 · faltan $1,700 MXN",
      tono: "aviso",
    });
    const completo = abonoUnico({
      cobro_conciliacion: { ...abonoUnico().cobro_conciliacion!, estado: "CONCILIADO", monto_vinculado: 3400, faltante: 0, abonos_n: 2, faltante_sin_este: 1700 },
    });
    expect(lineaCobroUnicoBandeja(completo)).toEqual({ texto: "Completa el cobro junto con 1 abono más", tono: "neutro" });
    // Un abono que cubre su cobro él solo, o API previo: nada.
    expect(lineaCobroUnicoBandeja(abonoUnico({ cobro_conciliacion: { ...abonoUnico().cobro_conciliacion!, estado: "CONCILIADO", abonos_n: 1 } }))).toBeNull();
    expect(lineaCobroUnicoBandeja(abonoUnico({ cobro_conciliacion: undefined }))).toBeNull();
    // La búsqueda rápida lo encuentra por «parcial» y por el folio del cobro.
    expect(textoBusquedaCobros(abonoUnico())).toBe("#315 parcial");
  });

  it("lote: cada línea con «· parcial: faltan $X» (ámbar) o «· completa el cobro (2 abonos)»; sin el dato, como hoy", () => {
    const lote = resumenLoteCobrosFila({
      ...MOV,
      cobros: [
        { ...MOV.cobros![0], cobro_estado: "CONCILIADO", cobro_faltante: 0, cobro_abonos_n: 2 },
        { ...MOV.cobros![1], cobro_estado: "PARCIAL", cobro_faltante: 10000, cobro_abonos_n: 1 },
      ],
    });
    expect(lote?.lineas.map((l) => l.sufijo)).toEqual([
      { texto: " · completa el cobro (2 abonos)", tono: "neutro" },
      { texto: " · parcial: faltan $10,000 MXN", tono: "aviso" },
    ]);
    expect(resumenLoteCobrosFila(MOV)?.lineas.map((l) => l.sufijo)).toEqual([null, null]);
    expect(
      textoBusquedaCobros({ ...MOV, cobros: [{ ...MOV.cobros![1], cobro_estado: "PARCIAL", cobro_faltante: 10000 }] }),
    ).toContain("parcial");
  });
});

describe("desvincular un abono (D22) y Paywise (D6)", () => {
  it("menú y título para un abono cuyo cobro tiene OTROS abonos (no en un lote)", () => {
    expect(MENU_DESVINCULAR_ESTE_ABONO).toBe("Desvincular este abono del cobro");
    expect(TITULO_DESVINCULAR_ESTE_ABONO).toBe("¿Desvincular este abono del cobro?");
    const conc = { cobro_id: C315, folio: 315, estado: "CONCILIADO" as const, neto: 3400, monto_vinculado: 3400, faltante: 0, sobrante: 0, abonos_n: 2, faltante_sin_este: 1700, abonos: [] };
    expect(abonoConOtrosAbonosDelCobro({ cobros_n: 1, cobro_conciliacion: conc })).toBe(true);
    expect(abonoConOtrosAbonosDelCobro({ cobros_n: 1, cobro_conciliacion: { ...conc, abonos_n: 1 } })).toBe(false);
    expect(abonoConOtrosAbonosDelCobro({ cobros_n: 2, cobro_conciliacion: conc })).toBe(false);
    expect(abonoConOtrosAbonosDelCobro({ cobros_n: 1 })).toBe(false);
  });

  it("lote: la frase extra si algún cobro tiene otros abonos", () => {
    expect(textoExtraDesvincularLote(MOV)).toBeNull();
    expect(textoExtraDesvincularLote({ cobros: [{ ...MOV.cobros![0], cobro_abonos_n: 2 }] })).toBe(
      "Los cobros que tienen otros abonos quedan como «Conciliado parcial».",
    );
  });

  it("toast con `cobros_liberados` (el estado DESPUÉS); sin la llave, null (el texto de siempre)", () => {
    const m = { cobro_id: C315, cobro: { moneda: "MXN", vuelo_id: "v315" }, cobros: null };
    expect(toastDesvinculoCobros([{ cobro_id: C315, folio: 315, estado: "PARCIAL", faltante: 1700, abonos_n: 1 }], m)).toBe(
      "Cobro desvinculado: el vuelo #315 queda con pago parcial (faltan $1,700 MXN).",
    );
    expect(toastDesvinculoCobros([{ cobro_id: C315, folio: 315, estado: "SIN_CONCILIAR", faltante: 3400, abonos_n: 0 }], m)).toBe(
      "Cobro desvinculado: el cobro del vuelo #315 vuelve a «Cobros sin banco».",
    );
    expect(toastDesvinculoCobros([{ cobro_id: C315, folio: 315, estado: "CONCILIADO", faltante: 0, abonos_n: 2 }], m)).toBe(
      "Abono desvinculado: el cobro del vuelo #315 sigue conciliado con sus otros abonos.",
    );
    expect(
      toastDesvinculoCobros(
        [
          { cobro_id: "c379", folio: 379, estado: "SIN_CONCILIAR", faltante: 1000, abonos_n: 0 },
          { cobro_id: "c380", folio: 380, estado: "PARCIAL", faltante: 2500, abonos_n: 1 },
        ],
        MOV,
      ),
    ).toBe("Los 2 cobros desvinculados; el vuelo #380 queda con pago parcial (faltan $2,500 MXN).");
    const dos = (e1: CobroLiberado["estado"], e2: CobroLiberado["estado"]) =>
      toastDesvinculoCobros(
        [
          { cobro_id: "c379", folio: 379, estado: e1, faltante: 0, abonos_n: 0 },
          { cobro_id: "c380", folio: 380, estado: e2, faltante: 0, abonos_n: 0 },
        ],
        MOV,
      );
    expect(dos("SIN_CONCILIAR", "SIN_CONCILIAR")).toBe("Los 2 cobros desvinculados: vuelven a «Cobros sin banco».");
    // Uno sigue cubierto por sus otros abonos: no se promete «Cobros sin banco».
    expect(dos("SIN_CONCILIAR", "CONCILIADO")).toBe("Los 2 cobros desvinculados.");
    expect(toastDesvinculoCobros(undefined, m)).toBeNull();
    expect(toastDesvinculoCobros([], m)).toBeNull();
  });

  it("Paywise: los depósitos en lote quedan fuera del cruce automático", () => {
    expect(textoPaywiseEnLote(0)).toBeNull();
    expect(textoPaywiseEnLote(undefined)).toBeNull();
    expect(textoPaywiseEnLote(1)).toBe(
      "1 depósito de Paywise paga varios cobros (lote): queda fuera del cruce automático; revísalo en la bandeja.",
    );
    expect(textoPaywiseEnLote(2)).toBe(
      "2 depósitos de Paywise pagan varios cobros (lote): quedan fuera del cruce automático; revísalos en la bandeja.",
    );
  });
});
