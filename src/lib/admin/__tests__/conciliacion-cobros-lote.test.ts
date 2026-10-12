/**
 * 1 abono ↔ N cobros (12-oct-2026): la liga leída de `cobros_n`, la
 * selección del diálogo (varios cobros; sobre/ingreso solos), la suma guía,
 * los textos y los errores del API.
 */
import { describe, expect, it } from "vitest";
import type { CandidatoCobroVuelo, CandidatoSobreGrupo, MovimientoBancario } from "@/types/conciliacion";
import type { CandidatoIngresoAbono } from "@/types/ingresos";
import {
  MAX_COBROS_LOTE,
  MSG_LOTE_COBROS_API_VIEJO,
  MSG_LOTE_COBROS_SIN_MIGRACION,
  alternarSeleccion,
  botonVincularAbono,
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
