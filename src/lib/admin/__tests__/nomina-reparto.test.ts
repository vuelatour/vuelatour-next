/**
 * Nómina: reparto en PARTES IGUALES entre aviones (16-oct-2026, API 0.0.90).
 * Congela la fuente única PURA del diálogo y del resumen: validación del
 * cuerpo ANTES de la red, chips, llave de la vista previa, textos exactos,
 * errores por pago, toast y el resumen en CENTAVOS por moneda (jamás MXN +
 * USD). Ningún monto del reparto se calcula aquí: lo decide el API.
 */
import { describe, expect, it } from "vitest";
import {
  CHIPS_PAGOS_NOMINA,
  CODIGO_RUTA_NO_DISPONIBLE,
  CODIGO_SIN_CONEXION,
  ESPERA_VISTA_PREVIA_MS,
  ESTADO_SIN_REPARTIR,
  MSG_DEMASIADOS_AVIONES,
  MSG_DEMASIADOS_PAGOS,
  MSG_IDS_INVALIDOS,
  MSG_REPARTO_INCIERTO,
  MSG_REPARTO_RUTA_NO_DISPONIBLE,
  MSG_REPETIDOS,
  MSG_SIN_PAGOS,
  ROLES_REPARTO_NOMINA,
  RUTA_REPARTO_IGUALES,
  TOPE_AVIONES_REPARTO_IGUALES,
  TOPE_GASTOS_REPARTO_IGUALES,
  chipDeSeleccion,
  chipInicialNomina,
  claveVistaPreviaNomina,
  descripcionDialogoRepartoNomina,
  erroresDeRespuestaReparto,
  estadoPagoNomina,
  idsDeChip,
  idsDeClaveVistaPrevia,
  lineaPagoNomina,
  pagoNominaDeGasto,
  pagosYaRepartidos,
  puedeRepartirNomina,
  resultadoEsIncierto,
  resumenRepartoNomina,
  textoBotonRepartirNomina,
  textoConfirmarQuitarNomina,
  textoConfirmarReemplazoNomina,
  textoPagosSeleccionados,
  textoParteRepartoNomina,
  textoTotalRepartoNomina,
  toastResultadoRepartoNomina,
  validarCuerpoRepartoIguales,
  type GastoNominaReparto,
  type PagoNomina,
} from "@/lib/admin/nomina-reparto";
import type { GastoRepartoIguales, RespuestaRepartoIguales } from "@/types/reparto-iguales";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const G1 = uuid(1);
const G2 = uuid(2);
const G3 = uuid(3);
const A1 = uuid(101);
const A2 = uuid(102);

describe("roles y ruta (espejo del API)", () => {
  it("ADMIN, COORDINADOR y FACTURACION reparten; sin rol se ofrece (el API es el candado)", () => {
    expect([...ROLES_REPARTO_NOMINA]).toEqual(["ADMIN", "COORDINADOR", "FACTURACION"]);
    for (const rol of ROLES_REPARTO_NOMINA) expect(puedeRepartirNomina(rol), rol).toBe(true);
    for (const rol of ["SOCIO", "ANALISTA", "PILOTO", "MECANICO"]) expect(puedeRepartirNomina(rol), rol).toBe(false);
    expect(puedeRepartirNomina(null)).toBe(true);
    expect(puedeRepartirNomina(undefined)).toBe(true);
    expect(RUTA_REPARTO_IGUALES).toBe("/v1/expenses/reparto-iguales");
    expect(TOPE_GASTOS_REPARTO_IGUALES).toBe(200);
    expect(TOPE_AVIONES_REPARTO_IGUALES).toBe(20);
  });
});

describe("validarCuerpoRepartoIguales (ANTES de la red)", () => {
  it("arma el cuerpo EXACTO: ids en minúsculas, `simular` solo con true", () => {
    expect(
      validarCuerpoRepartoIguales({ gasto_ids: [G1.toUpperCase(), G2], aeronave_ids: [A1], simular: true }),
    ).toEqual({ ok: true, cuerpo: { gasto_ids: [G1, G2], aeronave_ids: [A1], simular: true } });
    const aplicar = validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: [A1, A2] });
    expect(aplicar).toEqual({ ok: true, cuerpo: { gasto_ids: [G1], aeronave_ids: [A1, A2] } });
    // `simular: false` no viaja (ausente = aplicar).
    const r = validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: [A1], simular: false });
    expect(r.ok && "simular" in r.cuerpo).toBe(false);
  });

  it("`aeronave_ids: []` es válido (= QUITAR el reparto)", () => {
    expect(validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: [] })).toEqual({
      ok: true,
      cuerpo: { gasto_ids: [G1], aeronave_ids: [] },
    });
  });

  it("rechaza sin pagos, topes, repetidos, no-uuid y `simular` que no es booleano", () => {
    expect(validarCuerpoRepartoIguales({ gasto_ids: [], aeronave_ids: [A1] })).toEqual({ ok: false, error: MSG_SIN_PAGOS });
    const muchos = Array.from({ length: 201 }, (_, i) => uuid(i + 1));
    expect(validarCuerpoRepartoIguales({ gasto_ids: muchos, aeronave_ids: [A1] })).toEqual({
      ok: false,
      error: MSG_DEMASIADOS_PAGOS,
    });
    const aviones = Array.from({ length: 21 }, (_, i) => uuid(500 + i));
    expect(validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: aviones })).toEqual({
      ok: false,
      error: MSG_DEMASIADOS_AVIONES,
    });
    expect(validarCuerpoRepartoIguales({ gasto_ids: [G1, G1.toUpperCase()], aeronave_ids: [] })).toEqual({
      ok: false,
      error: MSG_REPETIDOS,
    });
    expect(validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: [A1, A1] })).toEqual({
      ok: false,
      error: MSG_REPETIDOS,
    });
    for (const malo of [null, "x", { gasto_ids: ["no-uuid"], aeronave_ids: [] }, { gasto_ids: [G1] }]) {
      expect(validarCuerpoRepartoIguales(malo)).toEqual({ ok: false, error: MSG_IDS_INVALIDOS });
    }
    expect(validarCuerpoRepartoIguales({ gasto_ids: [G1], aeronave_ids: [], simular: "true" })).toEqual({
      ok: false,
      error: MSG_IDS_INVALIDOS,
    });
    expect(MSG_DEMASIADOS_PAGOS).toBe("Elige a lo más 200 pagos por reparto.");
    expect(MSG_DEMASIADOS_AVIONES).toBe("Elige a lo más 20 aviones.");
  });
});

const gasto = (over: Partial<GastoNominaReparto> & { id: string }): GastoNominaReparto => ({
  fecha_gasto: "2026-10-15",
  notas: "Luis · 1a oct\nProveedor: X",
  monto: "5000.00",
  moneda: "MXN",
  vuelo_id: null,
  repartos: [],
  ...over,
});

describe("pagos del mes", () => {
  it("pagoNominaDeGasto: primera línea de las notas, monto, repartible solo sin vuelo, matrículas guardadas", () => {
    const p = pagoNominaDeGasto(
      gasto({
        id: G1,
        repartos: [
          { aeronave_id: A1, monto: "2500.00", aeronave: { matricula: "N4142R" } },
          { aeronave_id: A2, monto: "2500.00", aeronave: null },
        ],
      }),
    );
    expect(p).toEqual({
      id: G1,
      fecha: "2026-10-15",
      nota: "Luis · 1a oct",
      monto: 5000,
      moneda: "MXN",
      repartible: true,
      aviones: ["N4142R", "¿?"],
    });
    expect(estadoPagoNomina(p)).toBe("Repartido: N4142R, ¿?");
    expect(pagoNominaDeGasto(gasto({ id: G2, vuelo_id: "v" })).repartible).toBe(false);
    expect(estadoPagoNomina(pagoNominaDeGasto(gasto({ id: G3 })))).toBe(ESTADO_SIN_REPARTIR);
    expect(lineaPagoNomina(pagoNominaDeGasto(gasto({ id: G3 })))).toBe("15 oct 2026 · Luis · 1a oct · $5,000 MXN");
    expect(lineaPagoNomina(pagoNominaDeGasto(gasto({ id: G3, notas: null })))).toBe("15 oct 2026 · Sin notas · $5,000 MXN");
  });
});

const pago = (id: string, fecha: string, aviones: string[] = [], repartible = true): PagoNomina => ({
  id,
  fecha,
  nota: "",
  monto: 100,
  moneda: "MXN",
  repartible,
  aviones,
});

describe("chips del paso 1", () => {
  const PAGOS = [
    pago(G1, "2026-10-07"),
    pago(G2, "2026-10-20", ["N4142R"]),
    pago(G3, "2026-10-15", [], false), // ligado a un vuelo: nunca entra
  ];

  it("los 4 chips en su orden", () => {
    expect(CHIPS_PAGOS_NOMINA.map((c) => c.etiqueta)).toEqual([
      "Todo el mes",
      "1ª quincena",
      "2ª quincena",
      "Solo sin repartir",
    ]);
  });

  it("idsDeChip: solo repartibles, por quincena y sin repartir", () => {
    expect(idsDeChip(PAGOS, "mes")).toEqual([G1, G2]);
    expect(idsDeChip(PAGOS, "q1")).toEqual([G1]);
    expect(idsDeChip(PAGOS, "q2")).toEqual([G2]);
    expect(idsDeChip(PAGOS, "sin_repartir")).toEqual([G1]);
  });

  it("chip inicial: «Solo sin repartir» si hay alguno; si no, «Todo el mes»", () => {
    expect(chipInicialNomina(PAGOS)).toBe("sin_repartir");
    expect(chipInicialNomina([pago(G2, "2026-10-20", ["N4142R"])])).toBe("mes");
  });

  it("chipDeSeleccion: el primero que coincide; una selección vacía no es ningún chip", () => {
    expect(chipDeSeleccion(PAGOS, new Set([G1, G2]))).toBe("mes");
    expect(chipDeSeleccion(PAGOS, new Set([G1]))).toBe("q1");
    expect(chipDeSeleccion(PAGOS, new Set([G2]))).toBe("q2");
    expect(chipDeSeleccion(PAGOS, new Set())).toBeNull();
    expect(chipDeSeleccion([pago(G1, "2026-10-07", ["N4142R"])], new Set())).toBeNull();
  });
});

describe("vista previa: llave, turno e incierto", () => {
  it("espera de 400 ms y la llave ignora el orden de los clics", () => {
    expect(ESPERA_VISTA_PREVIA_MS).toBe(400);
    const a = claveVistaPreviaNomina([G2, G1], [A2, A1], 0);
    const b = claveVistaPreviaNomina([G1, G2], [A1, A2], 0);
    expect(a).toBe(b);
    expect(claveVistaPreviaNomina([G1], [A1], 1)).not.toBe(claveVistaPreviaNomina([G1], [A1], 0));
    expect(idsDeClaveVistaPrevia(a)).toEqual({ gasto_ids: [G1, G2], aeronave_ids: [A1, A2] });
    expect(idsDeClaveVistaPrevia(claveVistaPreviaNomina([G1], [], 3))).toEqual({ gasto_ids: [G1], aeronave_ids: [] });
  });

  it("resultadoEsIncierto: sin respuesta o 5xx (pudo escribir); un 4xx o un éxito, no", () => {
    expect(resultadoEsIncierto({ ok: true })).toBe(false);
    expect(resultadoEsIncierto({ ok: false, code: CODIGO_SIN_CONEXION })).toBe(true);
    expect(resultadoEsIncierto({ ok: false, status: 502 })).toBe(true);
    expect(resultadoEsIncierto({ ok: false, status: 500, code: "ERROR" })).toBe(true);
    expect(resultadoEsIncierto({ ok: false, status: 400, code: "ENTRADA_INVALIDA" })).toBe(false);
    expect(resultadoEsIncierto({ ok: false, status: 404, code: CODIGO_RUTA_NO_DISPONIBLE })).toBe(false);
    expect(MSG_REPARTO_INCIERTO).toBe("No se pudo confirmar si se repartió: revisa la lista.");
    expect(MSG_REPARTO_RUTA_NO_DISPONIBLE).toBe(
      "Falta actualizar el servidor: el reparto de la nómina todavía no está disponible.",
    );
  });
});

describe("textos exactos del diálogo", () => {
  it("descripción, conteos, botón y confirmaciones", () => {
    expect(descripcionDialogoRepartoNomina("octubre 2026")).toBe(
      "Pagos de octubre 2026. Cada pago se reparte por separado en partes iguales entre los aviones elegidos (los centavos que sobran los reparte el servidor). Solo lo repartido entra al balance de cada avión.",
    );
    expect(textoPagosSeleccionados(1)).toBe("1 pago seleccionado");
    expect(textoPagosSeleccionados(12)).toBe("12 pagos seleccionados");
    expect(textoBotonRepartirNomina(12, 4)).toBe("Repartir 12 pagos entre 4 aviones");
    expect(textoBotonRepartirNomina(1, 1)).toBe("Repartir 1 pago entre 1 avión");
    expect(textoConfirmarQuitarNomina(1)).toBe(
      "El pago elegido queda sin repartir: ningún avión los carga y no entran a ningún balance hasta volver a repartirlos. El pre-cierre del mes lo marcará.",
    );
    expect(textoConfirmarQuitarNomina(3)).toContain("Los 3 pagos elegidos quedan sin repartir");
    expect(textoConfirmarReemplazoNomina(2, 4)).toBe(
      "Se reemplaza el reparto de 2 pagos que ya estaban repartidos: quedarán en partes iguales entre los 4 aviones elegidos.",
    );
    expect(textoConfirmarReemplazoNomina(1, 1)).toBe(
      "Se reemplaza el reparto de 1 pago que ya estaba repartido: quedarán en partes iguales entre el avión elegido.",
    );
  });

  it("parte y total con los montos del API (octubre real: 4 aviones, el centavo rota)", () => {
    expect(textoParteRepartoNomina("N4142R", "27480.37", "MXN")).toBe("N4142R $27,480.37 MXN");
    expect(textoParteRepartoNomina(null, 27480.36, "MXN")).toBe("¿? $27,480.36 MXN");
    expect(textoTotalRepartoNomina(12, "109921.46", "MXN")).toBe("12 pagos · $109,921.46 MXN");
    expect(textoTotalRepartoNomina(1, "6830.00", "MXN")).toBe("1 pago · $6,830 MXN");
  });
});

const fila = (over: Partial<GastoRepartoIguales> & { gasto_id: string }): GastoRepartoIguales => ({
  fecha_gasto: "2026-10-15",
  monto: "6830.00",
  moneda: "MXN",
  ok: true,
  ya_repartido: false,
  partes: [],
  error: null,
  ...over,
});

describe("errores por pago y reemplazo", () => {
  it("lista los rechazados con su renglón y el texto del API (MES_CERRADO incluido)", () => {
    const pagos = [pagoNominaDeGasto(gasto({ id: G1 }))];
    const errores = erroresDeRespuestaReparto(
      {
        gastos: [
          fila({ gasto_id: G1, ok: false, error: { code: "MES_CERRADO", message: "Septiembre 2026 ya está cerrado." } }),
          fila({ gasto_id: G2, ok: false, error: { code: "GASTO_CON_VUELO", message: "  " } }),
          fila({ gasto_id: G3 }),
        ],
      },
      pagos,
    );
    expect(errores).toEqual([
      {
        gasto_id: G1,
        pago: "15 oct 2026 · Luis · 1a oct · $5,000 MXN",
        code: "MES_CERRADO",
        mensaje: "Septiembre 2026 ya está cerrado.",
      },
      { gasto_id: G2, pago: "15 oct 2026 · $6,830 MXN", code: "GASTO_CON_VUELO", mensaje: "No se pudo repartir este pago." },
    ]);
    expect(erroresDeRespuestaReparto(null, pagos)).toEqual([]);
  });

  it("pagosYaRepartidos cuenta solo los OK que ya tenían reparto", () => {
    expect(
      pagosYaRepartidos({
        gastos: [
          fila({ gasto_id: G1, ya_repartido: true }),
          fila({ gasto_id: G2, ya_repartido: true, ok: false, error: { code: "X", message: "x" } }),
          fila({ gasto_id: G3 }),
        ],
      }),
    ).toBe(1);
    expect(pagosYaRepartidos(undefined)).toBe(0);
  });
});

describe("toast del resultado", () => {
  const res = (over: Partial<RespuestaRepartoIguales>): RespuestaRepartoIguales => ({
    simulado: false,
    quitar: false,
    aeronaves: [
      { id: A1, matricula: "N4142R" },
      { id: A2, matricula: "N621TX" },
    ],
    gastos: [],
    totales: [],
    aplicados: 12,
    errores: 0,
    ...over,
  });

  it("éxito, parcial, nada y quitar", () => {
    expect(toastResultadoRepartoNomina(res({}))).toEqual({
      tipo: "success",
      texto: "12 pagos repartidos entre 2 aviones",
    });
    expect(toastResultadoRepartoNomina(res({ aplicados: 1, errores: 2, aeronaves: [{ id: A1, matricula: "N4142R" }] }))).toEqual({
      tipo: "warning",
      texto: "1 pago repartido entre 1 avión · 2 con error",
    });
    expect(toastResultadoRepartoNomina(res({ aplicados: 0, errores: 3 }))).toEqual({
      tipo: "error",
      texto: "Ningún pago se repartió: revisa los errores.",
    });
    expect(toastResultadoRepartoNomina(res({ quitar: true, aplicados: 3, aeronaves: [] }))).toEqual({
      tipo: "success",
      texto: "Reparto quitado de 3 pagos",
    });
    expect(toastResultadoRepartoNomina(res({ quitar: true, aplicados: 0, errores: 1, aeronaves: [] }))).toEqual({
      tipo: "error",
      texto: "No se quitó el reparto de ningún pago: revisa los errores.",
    });
  });
});

describe("resumen Repartido / Sin repartir / Por avión (centavos, por moneda)", () => {
  it("suma las partes GUARDADAS por matrícula; MXN y USD jamás se mezclan", () => {
    const r = resumenRepartoNomina([
      gasto({
        id: G1,
        monto: "109921.46",
        repartos: [
          { aeronave_id: A1, monto: "27480.37", aeronave: { matricula: "N4142R" } },
          { aeronave_id: A2, monto: "27480.37", aeronave: { matricula: "N621TX" } },
          { aeronave_id: uuid(103), monto: "27480.36", aeronave: { matricula: "N990GG" } },
          { aeronave_id: uuid(104), monto: "27480.36", aeronave: { matricula: "XA-VGV" } },
        ],
      }),
      gasto({ id: G2, monto: "0.10" }),
      gasto({ id: G3, monto: "0.20" }),
      gasto({
        id: uuid(4),
        monto: "100.00",
        moneda: "USD",
        repartos: [{ aeronave_id: A1, monto: "60.00", aeronave: { matricula: "N4142R" } }],
      }),
    ]);
    expect(r.pagosRepartidos).toBe(2);
    expect(r.pagosSinRepartir).toBe(2);
    expect(r.repartido).toEqual([
      { moneda: "MXN", total: 109921.46 },
      { moneda: "USD", total: 60 },
    ]);
    // 0.1 + 0.2 = 0.30 exacto (centavos enteros).
    expect(r.sinRepartir).toEqual([{ moneda: "MXN", total: 0.3 }]);
    // Un reparto manual que dejó $40 USD sin asignar.
    expect(r.remanente).toEqual([{ moneda: "USD", total: 40 }]);
    expect(r.porAvion.map((a) => a.matricula)).toEqual(["N4142R", "N621TX", "N990GG", "XA-VGV"]);
    expect(r.porAvion[0]).toEqual({
      matricula: "N4142R",
      total: [
        { moneda: "MXN", total: 27480.37 },
        { moneda: "USD", total: 60 },
      ],
    });
  });

  it("sin pagos: todo vacío; una parte sin matrícula va al final como «¿?»", () => {
    expect(resumenRepartoNomina([])).toEqual({
      repartido: [],
      sinRepartir: [],
      remanente: [],
      pagosRepartidos: 0,
      pagosSinRepartir: 0,
      porAvion: [],
    });
    const r = resumenRepartoNomina([
      gasto({
        id: G1,
        monto: "200.00",
        repartos: [
          { aeronave_id: A1, monto: "100.00", aeronave: null },
          { aeronave_id: A2, monto: "100.00", aeronave: { matricula: "N621TX" } },
        ],
      }),
    ]);
    expect(r.porAvion.map((a) => a.matricula)).toEqual(["N621TX", "¿?"]);
  });
});
