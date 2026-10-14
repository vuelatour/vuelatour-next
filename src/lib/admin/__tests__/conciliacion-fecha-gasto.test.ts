/**
 * Fecha del PAGO desde «Vincular gasto» (14-oct-2026, API 0.0.76): reglas y
 * textos PUROS de `conciliacion-fecha-gasto.ts`. Caso de la captura: el
 * boleto de ferry de Winjet (gasto 08c0632c, TAXI $321.54 MXN del 10-oct,
 * tarjeta ****0585, vuelo #436) contra el cargo 5e3178db de $345.00 del
 * 12-oct («WINJET PLAYA DEL CARME», cuenta en pesos).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_CONFIRMAR_MES_TERMINADO,
  BOTON_FECHA_FILA,
  CODIGOS_FECHA_GASTO,
  DIAS_MARGEN_CRUCE,
  MSG_DESHACER_INCIERTO,
  MSG_FECHA_API_VIEJO,
  MSG_FECHA_CONFLICTO,
  MSG_FECHA_DATOS_RECHAZADOS,
  MSG_FECHA_IGUAL,
  MSG_FECHA_INCOMPLETA,
  MSG_FECHA_MUY_ANTIGUA,
  MSG_FECHA_SIN_CAMBIO,
  MSG_FECHA_SIN_PERMISO,
  MSG_FECHA_TECNICO,
  MSG_FECHA_YA_CONCILIADO,
  MSG_GASTO_NO_EXISTE_FECHA,
  NOTA_HORA_CARGA_MOVIDA,
  NOTA_TARJETA_DESFASE,
  TEXTO_CONFIRMAR_SIN_DETALLE,
  TITULO_CONFIRMAR_CAMBIO_MES,
  TITULO_CONFIRMAR_MES_TERMINADO,
  TITULO_CORREGIR_FECHA,
  TITULO_DESHACER_INCIERTO,
  avisosFechaPago,
  bloqueoMesDelVuelo,
  bloqueoNuevaFechaGasto,
  botonUsarFechaCargo,
  conFechaCorregida,
  conFechasCorregidas,
  descripcionCorregirFecha,
  diasEntreDias,
  esDesfaseTarjetaTolerado,
  esResultadoIncierto,
  etiquetaBotonFecha,
  fechaDeCandidato,
  fechaInicialCorregirFecha,
  limitesFechaPago,
  mensajeErrorFechaGasto,
  mesTexto,
  nudgeFechaMarcado,
  puedeCorregirFechaDeCandidato,
  registrarFechaCorregida,
  resultadoCorregirFecha,
  sumarDias,
  textoFechaActual,
  toastFechaCorregida,
  toastFechaRestaurada,
  validarNuevaFechaGasto,
  type FechasCorregidas,
} from "../conciliacion-fecha-gasto";
import { motivoPendienteDe } from "../conciliacion-auto";
import { MEDIOS_BANCARIOS_CONCILIACION } from "../conciliacion-no-bancario";
import { MSG_SESION_EXPIRADA, MSG_SIN_CONEXION, TITULO_VINCULAR_GASTO } from "../conciliacion-lote";
import type { CambioFechaGasto, GastoCandidato } from "@/types/conciliacion";

const HOY = "2026-10-14";

const WINJET: GastoCandidato = {
  id: "08c0632c-5711-4f0d-affd-591d756dd9fc",
  fecha: "2026-10-10",
  monto: 321.54,
  moneda: "MXN",
  categoria: "TAXI",
  medio_pago: "TARJETA_CORP",
  tarjeta_terminacion: "0585",
  proveedor: null,
  lugar: null,
  nota: "Winjet · Boleto Adulto ferry CZM-PDC",
  vuelo_folio: 436,
  conciliado: false,
  monto_vinculado: 0,
  faltante: 321.54,
  no_bancario: false,
};

const AVISO_MONTO_WINJET =
  "Ojo: con la fecha no basta para vincularlo solo: el cargo ($345.00) es mayor que el gasto ($321.54) por $23.46. Si el ticket dice otro monto, corrígelo en Gastos; si el cargo pagó varios gastos, márcalos todos.";

const avisos = (e: Partial<Parameters<typeof avisosFechaPago>[0]> = {}) =>
  avisosFechaPago({
    candidato: WINJET,
    nueva: "2026-10-12",
    fechaActual: "2026-10-10",
    fechaCargo: "2026-10-12",
    montoCargo: "345.00",
    monedaCuenta: "MXN",
    hoy: HOY,
    dias: 30,
    ...e,
  });

const cambio = (c: Partial<CambioFechaGasto> = {}): CambioFechaGasto => ({
  id: WINJET.id,
  fecha_gasto: "2026-10-12",
  fecha_anterior: "2026-10-10",
  cambio: true,
  cambia_de_mes: false,
  fecha_hora_carga: null,
  updated_at: "2026-10-14T17:00:00.123456+00:00",
  aviso: null,
  ...c,
});

describe("¿el renglón ofrece «Fecha»?", () => {
  it("los 4 medios bancarios ⇒ sí", () => {
    expect(MEDIOS_BANCARIOS_CONCILIACION).toHaveLength(4);
    for (const medio of MEDIOS_BANCARIOS_CONCILIACION) {
      expect(puedeCorregirFechaDeCandidato({ ...WINJET, medio_pago: medio })).toBe(true);
    }
  });

  it("efectivo, personal, bodega, sin medio, no bancario, sin fecha o fecha imposible ⇒ no (falla cerrado)", () => {
    for (const medio of ["EFECTIVO", "PERSONAL_PABLO", "BODEGA", null, undefined, ""]) {
      expect(puedeCorregirFechaDeCandidato({ ...WINJET, medio_pago: medio })).toBe(false);
    }
    expect(puedeCorregirFechaDeCandidato({ ...WINJET, no_bancario: true })).toBe(false);
    expect(puedeCorregirFechaDeCandidato({ ...WINJET, fecha: null, fecha_gasto: null })).toBe(false);
    expect(puedeCorregirFechaDeCandidato({ ...WINJET, fecha: "2026-02-30" })).toBe(false);
    expect(puedeCorregirFechaDeCandidato(null)).toBe(false);
  });

  it("la fecha sale de `fecha` (candidatos) o de `fecha_gasto` (ficha de la IA)", () => {
    expect(fechaDeCandidato(WINJET)).toBe("2026-10-10");
    expect(fechaDeCandidato({ fecha: null, fecha_gasto: "2026-09-18T00:00:00" })).toBe("2026-09-18");
    expect(fechaDeCandidato({ fecha: "nada" })).toBeNull();
    expect(fechaDeCandidato(undefined)).toBeNull();
  });
});

describe("textos del renglón y del diálogo (Winjet)", () => {
  it("etiqueta del botón (dice CUÁL gasto), descripción, fecha actual y atajo", () => {
    expect(BOTON_FECHA_FILA).toBe("Fecha");
    expect(etiquetaBotonFecha(WINJET)).toBe(
      "Corregir la fecha del gasto: Taxi / estacionamiento · $321.54 MXN · 10 oct 2026 · vuelo #436 · Winjet · Boleto Adulto ferry CZM-PDC",
    );
    expect(etiquetaBotonFecha({ id: "x", monto: 0, fecha: null })).toBe(`${TITULO_CORREGIR_FECHA}: $0.00 MXN`);
    // Sin cargo a la vista (o sin fecha del cargo): la frase completa.
    expect(descripcionCorregirFecha(WINJET)).toBe(
      "Taxi / estacionamiento · $321.54 MXN · Winjet · Boleto Adulto ferry CZM-PDC. La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.",
    );
    expect(textoFechaActual("2026-10-10")).toBe("Fecha actual del gasto: 10 oct 2026");
    expect(botonUsarFechaCargo("2026-10-12")).toBe("Usar la fecha del cargo (12 oct 2026)");
  });

  it("botones de gastos iguales del MISMO día ya no se llaman igual (lector de pantalla)", () => {
    // Prod, 14-oct: dos OPERACIONES de $332.04 con tarjeta del 10-oct.
    const a = { ...WINJET, id: "a", categoria: "OPERACIONES", monto: 332.04, vuelo_folio: 436, nota: "ASUR Cozumel" };
    const b = { ...a, id: "b", vuelo_folio: 440, nota: "ASUR Cozumel" };
    const c = { ...a, id: "c", vuelo_folio: null, nota: "Aterrizaje nocturno Mérida con recargo por horario extendido" };
    expect(etiquetaBotonFecha(a)).not.toBe(etiquetaBotonFecha(b));
    expect(etiquetaBotonFecha(a)).toBe(
      "Corregir la fecha del gasto: Operaciones · $332.04 MXN · 10 oct 2026 · vuelo #436 · ASUR Cozumel",
    );
    // La nota se recorta (el nombre accesible no es un párrafo).
    expect(etiquetaBotonFecha(c)).toBe(
      "Corregir la fecha del gasto: Operaciones · $332.04 MXN · 10 oct 2026 · Aterrizaje nocturno Mérida con recargo…",
    );
    // Con proveedor, la etiqueta ya lo trae: sin la nota.
    expect(etiquetaBotonFecha({ ...a, proveedor: "VIP SAESA" })).toBe(
      "Corregir la fecha del gasto: Operaciones · $332.04 MXN · 10 oct 2026 · VIP SAESA · vuelo #436",
    );
  });

  it("tarjeta con 1 a 3 días de desfase: abre con la fecha del TICKET y la descripción no dice «la del cargo del banco»", () => {
    expect(esDesfaseTarjetaTolerado(WINJET, "2026-10-10", "2026-10-12")).toBe(true);
    expect(fechaInicialCorregirFecha(WINJET, "2026-10-12")).toBe("2026-10-10");
    expect(descripcionCorregirFecha(WINJET, "2026-10-12")).toBe(
      "Taxi / estacionamiento · $321.54 MXN · Winjet · Boleto Adulto ferry CZM-PDC. La fecha del gasto es la del PAGO, no la de la factura.",
    );
    // A más de 3 días, o por transferencia: la fecha del CARGO y la frase completa.
    for (const [c, cargo] of [
      [WINJET, "2026-10-14"],
      [{ ...WINJET, medio_pago: "TRANSFERENCIA" }, "2026-10-12"],
    ] as const) {
      expect(esDesfaseTarjetaTolerado(c, "2026-10-10", cargo)).toBe(false);
      expect(fechaInicialCorregirFecha(c, cargo)).toBe(cargo);
      expect(descripcionCorregirFecha(c, cargo)).toContain("(la del cargo del banco)");
    }
    // Sin fecha legible del gasto: la del cargo.
    expect(fechaInicialCorregirFecha({ ...WINJET, fecha: null }, "2026-10-12")).toBe("2026-10-12");
  });

  it("descripción: el proveedor manda; sin categoría ni quién no deja separadores sueltos", () => {
    expect(descripcionCorregirFecha({ ...WINJET, proveedor: "VIP SAESA", categoria: "OPERACIONES", monto: "2801.40" })).toBe(
      "Operaciones · $2,801.40 MXN · VIP SAESA. La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.",
    );
    expect(descripcionCorregirFecha({ id: "x", monto: 10, moneda: "USD", categoria: null, nota: "  " })).toBe(
      "$10.00 USD. La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.",
    );
  });
});

describe("fechas (mediodía UTC, el mismo borde que el API)", () => {
  it("límites del campo: de hace 365 días a hoy; meses en texto", () => {
    expect(limitesFechaPago(HOY)).toEqual({ min: "2025-10-14", max: "2026-10-14" });
    expect(mesTexto("2026-09")).toBe("septiembre 2026");
    expect(mesTexto("2026-10-02")).toBe("octubre 2026");
    expect(mesTexto("nada")).toBe("nada");
  });

  it("diasEntreDias y sumarDias", () => {
    expect(diasEntreDias("2025-10-14", HOY)).toBe(365);
    expect(diasEntreDias("2025-10-13", HOY)).toBe(366);
    expect(diasEntreDias("2026-07-13", HOY)).toBe(93);
    expect(diasEntreDias("2026-10-12", "2026-10-10")).toBe(-2);
    expect(sumarDias("2026-03-07", 1)).toBe("2026-03-08");
    expect(sumarDias("2026-02-30", 1)).toBe("2026-02-30");
  });

  it("validarNuevaFechaGasto: incompleta, igual, futura, de hace más de un año; si no, null", () => {
    const v = (nueva: string) => validarNuevaFechaGasto(nueva, "2026-10-10", HOY);
    expect(v("")).toBe(MSG_FECHA_INCOMPLETA);
    expect(v("2026-02-30")).toBe(MSG_FECHA_INCOMPLETA);
    expect(v("2026-10-10")).toBe(MSG_FECHA_IGUAL);
    expect(v("2026-10-15")).toBe("La fecha del pago no puede ser posterior a hoy (14 oct 2026).");
    expect(v("2025-10-13")).toBe(MSG_FECHA_MUY_ANTIGUA);
    expect(v("2025-10-14")).toBeNull();
    expect(v("2026-10-12")).toBeNull();
    expect(v(HOY)).toBeNull();
    expect(MSG_FECHA_INCOMPLETA).toBe("Escribe una fecha completa (día, mes y año).");
    expect(MSG_FECHA_IGUAL).toBe("Es la misma fecha que ya tiene el gasto.");
    expect(MSG_FECHA_MUY_ANTIGUA).toBe(
      "Es de hace más de un año: revisa el año. Una fecha tan antigua se corrige en Gastos → Verificar / editar.",
    );
  });
});

describe("avisos del diálogo", () => {
  it("Winjet: EXACTAMENTE el monto (ámbar) y la nota de tarjeta (neutro)", () => {
    expect(avisos()).toEqual([
      { clave: "monto", tono: "ambar", texto: AVISO_MONTO_WINJET },
      { clave: "tarjeta", tono: "neutro", texto: NOTA_TARJETA_DESFASE },
    ]);
    expect(NOTA_TARJETA_DESFASE).toBe(
      "Con tarjeta, el banco registra el cargo 1 a 3 días después del ticket y el cruce automático ya lo tolera: cambia la fecha solo si la del ticket está mal.",
    );
  });

  it("monto de un pago parcial: «lo que le falta al gasto»", () => {
    const parcial = { ...WINJET, monto: 500, monto_vinculado: "200.00", faltante: "300.00" };
    expect(avisos({ candidato: parcial }).find((a) => a.clave === "monto")?.texto).toBe(
      "Ojo: con la fecha no basta para vincularlo solo: el cargo ($345.00) es mayor que lo que le falta al gasto ($300.00) por $45.00. Si el ticket dice otro monto, corrígelo en Gastos; si el cargo pagó varios gastos, márcalos todos.",
    );
  });

  it("cambio de mes, fecha sospechosa, ventana y pago parcial", () => {
    const mes = avisos({ fechaActual: "2026-09-30", nueva: "2026-10-02", fechaCargo: "2026-10-02" });
    expect(mes).toContainEqual({ clave: "mes", tono: "neutro", texto: "Cambia de mes: de septiembre 2026 a octubre 2026." });

    const vieja = avisos({ fechaActual: "2026-07-20", nueva: "2026-07-13", fechaCargo: "2026-07-20" });
    expect(vieja).toContainEqual({ clave: "sospechosa", tono: "ambar", texto: "Es de hace 93 días: revisa el año." });
    const igualAlCargo = avisos({ fechaActual: "2026-07-20", nueva: "2026-07-13", fechaCargo: "2026-07-13" });
    expect(igualAlCargo.some((a) => a.clave === "sospechosa")).toBe(false);

    const ventana = avisos({ nueva: "2026-09-11", fechaCargo: "2026-10-12" });
    expect(diasEntreDias("2026-09-11", "2026-10-12")).toBe(31);
    expect(ventana).toContainEqual({
      clave: "ventana",
      tono: "neutro",
      texto: "Con esa fecha el gasto queda a más de 30 días de este cargo: dejará de salir en esta lista al volver a buscar.",
    });
    expect(avisos({ nueva: "2026-09-12", fechaCargo: "2026-10-12" }).some((a) => a.clave === "ventana")).toBe(false);

    const parcial = avisos({ candidato: { ...WINJET, monto_vinculado: "23.46", faltante: "298.08" } });
    expect(parcial).toContainEqual({
      clave: "parcial",
      tono: "neutro",
      texto: "Ya tiene $23.46 pagados con otro cargo del banco: la fecha cambia para todo el gasto.",
    });
  });

  it("cruzado en USD: sin aviso de monto; transferencia o tarjeta a 5 días: sin nota de tarjeta", () => {
    const cruzado = { ...WINJET, moneda: "USD", monto: 18.5, cruzado: true, tc_implicito: 18.65 };
    expect(avisos({ candidato: cruzado }).some((a) => a.clave === "monto")).toBe(false);
    expect(avisos({ candidato: { ...WINJET, medio_pago: "TRANSFERENCIA" } }).some((a) => a.clave === "tarjeta")).toBe(false);
    expect(avisos({ fechaActual: "2026-10-07" }).some((a) => a.clave === "tarjeta")).toBe(false);
  });

  it("los avisos que dependen de la fecha nueva se omiten si no es un día", () => {
    const sinFecha = avisos({ nueva: "", fechaActual: "2026-09-30" });
    expect(sinFecha.map((a) => a.clave)).toEqual(["monto"]);
  });

  it("orden fijo: monto, sospechosa, mes, ventana, parcial, tarjeta", () => {
    const todos = avisos({
      candidato: { ...WINJET, monto_vinculado: "10.00", faltante: "311.54" },
      fechaActual: "2026-10-12",
      nueva: "2026-07-01",
      fechaCargo: "2026-10-12",
    });
    expect(todos.map((a) => a.clave)).toEqual(["monto", "sospechosa", "mes", "ventana", "parcial", "tarjeta"]);
  });
});

describe("candado del mes del vuelo (ficha del API 0.0.76, revisión del 14-oct-2026)", () => {
  // Prod, 14-oct: TAXI 64ef1bd8 del vuelo #109 (31-jul) y el cargo del Tren Maya del 10-ago.
  const TREN = {
    ...WINJET,
    id: "64ef1bd8",
    fecha: "2026-07-31",
    monto: 521,
    vuelo_folio: 109,
    candado_mes_vuelo: { vuelo_dia: "2026-07-31", vuelo_folio: 109 },
  };
  const BLOQUEO_TREN =
    "No se puede: este gasto es del vuelo #109 (31 jul 2026). Con fecha de agosto 2026 quedaría en otro mes que su vuelo y el balance de julio 2026 lo marcaría como pendiente («fecha FUERA del periodo del libro»). Déjale una fecha de julio 2026; para vincularlo no hace falta cambiarla.";

  it("mes nuevo ≠ mes del vuelo y ≠ el que ya tiene ⇒ el texto del API; dentro del mes o de regreso al del vuelo ⇒ null", () => {
    expect(bloqueoMesDelVuelo(TREN, "2026-08-10", "2026-07-31")).toBe(BLOQUEO_TREN);
    expect(bloqueoMesDelVuelo(TREN, "2026-07-20", "2026-07-31")).toBeNull();
    // b15080c3: vuelo de agosto, fechado en septiembre: dentro de septiembre y de regreso a agosto, sí.
    const b150 = { candado_mes_vuelo: { vuelo_dia: "2026-08-25", vuelo_folio: 190 } };
    expect(bloqueoMesDelVuelo(b150, "2026-09-30", "2026-09-09")).toBeNull();
    expect(bloqueoMesDelVuelo(b150, "2026-08-25", "2026-09-09")).toBeNull();
    expect(bloqueoMesDelVuelo(b150, "2026-10-02", "2026-09-09")).toContain("No se puede: este gasto es del vuelo #190 (25 ago 2026).");
    // Sin folio, el texto no deja un «#» suelto.
    expect(bloqueoMesDelVuelo({ candado_mes_vuelo: { vuelo_dia: "2026-07-31" } }, "2026-08-10", "2026-07-31")).toContain(
      "este gasto es del vuelo (31 jul 2026).",
    );
  });

  it("sin candado en la ficha (otra categoría o API previo) el panel no adivina: decide el API", () => {
    expect(bloqueoMesDelVuelo(WINJET, "2026-08-10", "2026-07-31")).toBeNull();
    expect(bloqueoMesDelVuelo({ candado_mes_vuelo: null }, "2026-08-10", "2026-07-31")).toBeNull();
    expect(bloqueoMesDelVuelo({ candado_mes_vuelo: { vuelo_dia: "nada" } }, "2026-08-10", "2026-07-31")).toBeNull();
  });

  it("bloqueoNuevaFechaGasto: primero las reglas de siempre, luego el candado", () => {
    expect(bloqueoNuevaFechaGasto(TREN, "2026-07-31", "2026-07-31", HOY)).toBe(MSG_FECHA_IGUAL);
    expect(bloqueoNuevaFechaGasto(TREN, "2026-08-10", "2026-07-31", HOY)).toBe(BLOQUEO_TREN);
    expect(bloqueoNuevaFechaGasto(TREN, "2026-07-30", "2026-07-31", HOY)).toBeNull();
  });

  it("el aviso bajo el marcado NO invita a una fecha que el API rechaza", () => {
    expect(nudgeFechaMarcado(TREN, "2026-08-10")).toBeNull();
    // Sin candado, el mismo caso sí invita (10 días).
    expect(nudgeFechaMarcado({ ...TREN, candado_mes_vuelo: undefined }, "2026-08-10")).toContain("a 10 días");
    // Con candado pero el cargo en el MISMO mes: sí invita.
    expect(nudgeFechaMarcado({ ...TREN, fecha: "2026-07-10" }, "2026-07-31")).toContain("a 21 días");
  });
});

describe("aviso bajo un renglón MARCADO", () => {
  it("a más de 3 días del cargo ⇒ el texto exacto; a 3 o menos, o en efectivo ⇒ null", () => {
    expect(nudgeFechaMarcado({ ...WINJET, fecha: "2026-09-18" }, "2026-09-30")).toBe(
      "La fecha del gasto (18 sep 2026) está a 12 días de este cargo (30 sep 2026). Si este cargo es su pago, corrígela con «Fecha».",
    );
    expect(nudgeFechaMarcado({ ...WINJET, fecha: "2026-09-27" }, "2026-09-30")).toBeNull();
    expect(nudgeFechaMarcado({ ...WINJET, fecha: "2026-09-18", medio_pago: "EFECTIVO" }, "2026-09-30")).toBeNull();
    expect(nudgeFechaMarcado({ ...WINJET, fecha: "2026-10-05" }, "2026-09-30")).toContain("a 5 días");
    expect(nudgeFechaMarcado(WINJET, null)).toBeNull();
  });
});

describe("fechas corregidas en la lista (sin volver a pedirla)", () => {
  const A = { ...WINJET };
  const B = { ...WINJET, id: "b0000000-0000-4000-8000-000000000002", fecha: "2026-10-01" };
  const lista = [A, B] as const;
  /** A: 10-oct ⇒ 12-oct (lo que guardó «Fecha»). */
  const corregidaA = registrarFechaCorregida({}, A.id, "2026-10-12", "2026-10-10");

  it("registrarFechaCorregida: la nueva y las reemplazadas; sin cambio ⇒ el MISMO mapa", () => {
    expect(corregidaA).toEqual({ [A.id]: { fecha: "2026-10-12", reemplaza: ["2026-10-10"] } });
    expect(registrarFechaCorregida(corregidaA, A.id, "2026-10-12", "2026-10-10")).toBe(corregidaA);
    // Corregir otra vez acumula; «Deshacer» (vuelve la de antes) la saca de las reemplazadas.
    const otraVez = registrarFechaCorregida(corregidaA, A.id, "2026-10-11", "2026-10-12");
    expect(otraVez[A.id]).toEqual({ fecha: "2026-10-11", reemplaza: ["2026-10-10", "2026-10-12"] });
    const deshecha = registrarFechaCorregida(corregidaA, A.id, "2026-10-10", "2026-10-12");
    expect(deshecha[A.id]).toEqual({ fecha: "2026-10-10", reemplaza: ["2026-10-12"] });
    // Una fecha que no es día no se anota.
    expect(registrarFechaCorregida(corregidaA, A.id, "nada")).toBe(corregidaA);
  });

  it("mapa vacío o id ajeno ⇒ la MISMA referencia", () => {
    expect(conFechasCorregidas(lista, {})).toBe(lista);
    expect(
      conFechasCorregidas(lista, registrarFechaCorregida({}, "c0000000-0000-4000-8000-000000000003", "2026-10-12", "2026-10-10")),
    ).toBe(lista);
    expect(conFechasCorregidas(lista, registrarFechaCorregida({}, A.id, "2026-10-10"))).toBe(lista);
  });

  it("corrige fecha y fecha_gasto SOLO de ese id; los demás conservan su referencia", () => {
    const r = conFechasCorregidas(lista, corregidaA);
    expect(r).not.toBe(lista);
    expect(r[0]).toEqual({ ...A, fecha: "2026-10-12", fecha_gasto: "2026-10-12" });
    expect(r[1]).toBe(B);
  });

  it("una lectura NUEVA del servidor manda sobre el mapa (alguien la cambió después)", () => {
    // Revisión del 14-oct-2026: A se corrigió a 12-oct aquí; otra persona la
    // pasó al 11-oct en «Verificar / editar». La búsqueda nueva trae 11-oct:
    // el renglón pinta 11-oct (y el diálogo mandará fecha_anterior = 11-oct).
    const fresca = { ...A, fecha: "2026-10-11" };
    expect(conFechaCorregida(fresca, corregidaA)).toBe(fresca);
    // La copia guardada de un marcado (o una respuesta en camino) con la vieja SÍ se corrige.
    expect(conFechaCorregida(A, corregidaA)).toEqual({ ...A, fecha: "2026-10-12", fecha_gasto: "2026-10-12" });
    // Y el 409 FECHA_GASTO_CAMBIO del diálogo anota la VIGENTE: la copia vieja y la 12 ceden.
    const vigente = registrarFechaCorregida(corregidaA, A.id, "2026-10-11", "2026-10-12");
    expect(conFechaCorregida(A, vigente).fecha).toBe("2026-10-11");
    expect(conFechaCorregida({ ...A, fecha: "2026-10-12" }, vigente).fecha).toBe("2026-10-11");
  });

  it("conFechaCorregida devuelve el mismo objeto si no hay cambio", () => {
    const vacio: FechasCorregidas = {};
    expect(conFechaCorregida(A, vacio)).toBe(A);
    expect(conFechaCorregida(A, registrarFechaCorregida({}, A.id, "2026-10-10"))).toBe(A);
    const x = registrarFechaCorregida({}, "x", "2026-10-12", "2026-10-10");
    expect(conFechaCorregida({ id: "x", fecha_gasto: "2026-10-12" }, x)).toEqual({ id: "x", fecha_gasto: "2026-10-12" });
    expect(conFechaCorregida({ id: "x", fecha_gasto: "2026-10-10" }, x)).toEqual({
      id: "x",
      fecha: "2026-10-12",
      fecha_gasto: "2026-10-12",
    });
    expect(conFechaCorregida({ id: "constructor", fecha: "2026-10-01" }, vacio)).toEqual({
      id: "constructor",
      fecha: "2026-10-01",
    });
  });
});

describe("respuesta de la action ⇒ qué hace el diálogo", () => {
  const CONFIRMAR = {
    ok: false,
    code: "FECHA_GASTO_CONFIRMAR",
    status: 409,
    error: "Este gasto pasa de septiembre 2026 a octubre 2026. …",
  };

  it("ok ⇒ ok", () => {
    const data = cambio();
    expect(resultadoCorregirFecha({ ok: true, data })).toEqual({ tipo: "ok", data });
  });

  it("FECHA_GASTO_CONFIRMAR: cambio de mes o mes terminado, con el texto DEL API", () => {
    expect(
      resultadoCorregirFecha({
        ...CONFIRMAR,
        details: { cambia_de_mes: true, mes_antes: "2026-09", mes_despues: "2026-10", etiqueta_mes_despues: "octubre 2026", meses_terminados: ["2026-09"] },
      }),
    ).toEqual({ tipo: "confirmar", titulo: "¿Cambiar el gasto de mes?", texto: CONFIRMAR.error, boton: "Sí, pasarlo a octubre 2026" });
    expect(
      resultadoCorregirFecha({ ...CONFIRMAR, details: { cambia_de_mes: false, meses_terminados: ["2026-09"] } }),
    ).toEqual({
      tipo: "confirmar",
      titulo: "¿Cambiar la fecha en un mes que ya terminó?",
      texto: CONFIRMAR.error,
      boton: "Sí, cambiar la fecha",
    });
    expect(TITULO_CONFIRMAR_CAMBIO_MES).toBe("¿Cambiar el gasto de mes?");
    expect(TITULO_CONFIRMAR_MES_TERMINADO).toBe("¿Cambiar la fecha en un mes que ya terminó?");
  });

  it("confirmación sin texto (o técnico) ⇒ TEXTO_CONFIRMAR_SIN_DETALLE; sin etiqueta ⇒ «Sí, cambiar la fecha»", () => {
    const sin = resultadoCorregirFecha({ ...CONFIRMAR, error: "", details: { cambia_de_mes: true } });
    expect(sin).toEqual({
      tipo: "confirmar",
      titulo: TITULO_CONFIRMAR_CAMBIO_MES,
      texto: TEXTO_CONFIRMAR_SIN_DETALLE,
      boton: BOTON_CONFIRMAR_MES_TERMINADO,
    });
    expect(TEXTO_CONFIRMAR_SIN_DETALLE).toBe("Este cambio mueve dinero entre meses en los libros: confírmalo.");
    expect(resultadoCorregirFecha({ ...CONFIRMAR, error: "Conflict" })).toMatchObject({ texto: TEXTO_CONFIRMAR_SIN_DETALLE });
  });

  it("FUERA_DEL_MES_DEL_VUELO y SOLO_BANCARIOS ⇒ bloqueo con el texto del API", () => {
    const fuera = "El gasto es del vuelo #201 (27 ago 2026): su fecha no puede salir de agosto 2026. …";
    expect(
      resultadoCorregirFecha({ ok: false, status: 409, code: "FECHA_GASTO_FUERA_DEL_MES_DEL_VUELO", error: fuera }),
    ).toEqual({ tipo: "bloqueo", texto: fuera });
    const efectivo = "Este gasto se pagó en efectivo: …";
    expect(resultadoCorregirFecha({ ok: false, status: 409, code: "FECHA_GASTO_SOLO_BANCARIOS", error: efectivo })).toEqual({
      tipo: "bloqueo",
      texto: efectivo,
    });
  });

  it("FECHA_GASTO_CAMBIO con la fecha vigente ⇒ fecha_vigente; sin details ⇒ error con el texto del API", () => {
    expect(
      resultadoCorregirFecha({
        ok: false,
        status: 409,
        code: "FECHA_GASTO_CAMBIO",
        error: "La fecha del gasto cambió…",
        details: { fecha_actual: "2026-10-11" },
      }),
    ).toEqual({
      tipo: "fecha_vigente",
      fecha: "2026-10-11",
      texto: "Alguien cambió la fecha de este gasto mientras tanto: ahora dice 11 oct 2026. Revisa y vuelve a guardar.",
    });
    expect(
      resultadoCorregirFecha({ ok: false, status: 409, code: "FECHA_GASTO_CAMBIO", error: "La fecha del gasto cambió…" }),
    ).toEqual({ tipo: "error", texto: "La fecha del gasto cambió…" });
  });

  it("GASTO_NO_EXISTE o un 404 que no es ruta inexistente ⇒ no_existe; el API viejo NO", () => {
    expect(resultadoCorregirFecha({ ok: false, status: 404, code: "GASTO_NO_EXISTE", error: "Ese gasto ya no existe: recarga la página." })).toEqual({
      tipo: "no_existe",
      texto: MSG_GASTO_NO_EXISTE_FECHA,
    });
    expect(resultadoCorregirFecha({ ok: false, status: 404, code: "NOT_FOUND", error: "No existe" })).toMatchObject({
      tipo: "no_existe",
    });
    expect(
      resultadoCorregirFecha({ ok: false, status: 404, code: "RUTA_NO_DISPONIBLE", error: MSG_FECHA_API_VIEJO }),
    ).toEqual({ tipo: "error", texto: MSG_FECHA_API_VIEJO });
    expect(
      resultadoCorregirFecha({ ok: false, status: 404, code: "NOT_FOUND", error: "Cannot PATCH /v1/expenses/x/fecha" }),
    ).toEqual({ tipo: "error", texto: MSG_FECHA_API_VIEJO });
    expect(MSG_GASTO_NO_EXISTE_FECHA).toBe("Ese gasto ya no existe: la lista se actualizó.");
  });

  it("FECHA_GASTO_YA_CONCILIADO (se ligó a otro cargo mientras tanto) ⇒ sale de la lista como un gasto borrado", () => {
    expect(
      resultadoCorregirFecha({
        ok: false,
        status: 409,
        code: "FECHA_GASTO_YA_CONCILIADO",
        error: "Este gasto ya quedó conciliado con un cargo del banco: …",
      }),
    ).toEqual({ tipo: "no_existe", texto: MSG_FECHA_YA_CONCILIADO });
    expect(MSG_FECHA_YA_CONCILIADO).toBe(
      "Este gasto ya quedó conciliado con un cargo del banco mientras tanto: su fecha es la de ese pago. La lista se actualizó.",
    );
  });

  it("sin respuesta, ok sin datos, red, 5xx o HTML ⇒ INCIERTO: no se sabe si se guardó", () => {
    for (const r of [
      undefined,
      { ok: true },
      { ok: false, error: "fetch failed" },
      { ok: false, error: "Failed to fetch" },
      { ok: false, error: "Load failed" },
      { ok: false, error: "An unexpected response was received from the server." },
      { ok: false, error: MSG_SIN_CONEXION },
      { ok: false, status: 502, code: "BAD_GATEWAY", error: "Bad Gateway" },
      { ok: false, status: 500, code: "INTERNAL_ERROR", error: "Algo en español que no sirve" },
      { ok: false, code: "PARSE_ERROR", error: "Unexpected token <" },
    ]) {
      expect(resultadoCorregirFecha(r)).toEqual({ tipo: "incierto", texto: MSG_FECHA_TECNICO });
      expect(esResultadoIncierto(r)).toBe(true);
    }
    // Un 4xx es determinista (el API contestó y no escribió): nunca incierto.
    for (const r of [
      { ok: false, status: 409, code: "CONFLICTO_VERSION", error: "Alguien modificó…" },
      { ok: false, status: 400, code: "BAD_REQUEST", error: "Bad Request" },
      { ok: false, status: 401, code: "UNAUTHORIZED", error: "Invalid or expired token" },
    ]) {
      expect(esResultadoIncierto(r)).toBe(false);
    }
    expect(esResultadoIncierto({ ok: true, data: cambio() } as never)).toBe(false);
  });

  it("401 (sesión vencida, cuenta dada de baja, JWKS que no contestó) ⇒ error con «Tu sesión expiró», nunca el inglés", () => {
    for (const error of ["Invalid or expired token", "User account is INACTIVO", "User not provisioned in application", "Missing Bearer token"]) {
      expect(resultadoCorregirFecha({ ok: false, status: 401, code: "UNAUTHORIZED", error })).toEqual({
        tipo: "error",
        texto: MSG_SESION_EXPIRADA,
      });
    }
  });
});

describe("mensajeErrorFechaGasto (diálogo y «Deshacer»)", () => {
  it("cada fallo con su texto, en orden", () => {
    expect(mensajeErrorFechaGasto({ code: "CONFLICTO_VERSION", status: 409, error: "Alguien modificó este gasto…" })).toBe(
      MSG_FECHA_CONFLICTO,
    );
    expect(mensajeErrorFechaGasto({ code: "RUTA_NO_DISPONIBLE", status: 404, error: MSG_FECHA_API_VIEJO })).toBe(MSG_FECHA_API_VIEJO);
    expect(mensajeErrorFechaGasto({ code: "FORBIDDEN", status: 403, error: "Required role: ADMIN | FACTURACION" })).toBe(
      MSG_FECHA_SIN_PERMISO,
    );
    expect(mensajeErrorFechaGasto({ code: "GASTO_NO_EXISTE", status: 404, error: "Ese gasto ya no existe: recarga la página." })).toBe(
      MSG_GASTO_NO_EXISTE_FECHA,
    );
    // El 404 en inglés de update() (carrera de borrado) también se traduce.
    expect(
      mensajeErrorFechaGasto({ code: "NOT_FOUND", status: 404, error: "Gasto 08c0632c-5711-4f0d-affd-591d756dd9fc not found" }),
    ).toBe(MSG_GASTO_NO_EXISTE_FECHA);
    expect(mensajeErrorFechaGasto({ code: "FECHA_GASTO_YA_CONCILIADO", status: 409, error: "Este gasto ya quedó…" })).toBe(
      MSG_FECHA_YA_CONCILIADO,
    );
    // 401: el texto del AuthGuard (inglés) jamás llega al operador.
    for (const error of ["Invalid or expired token", "User account is INACTIVO", "User not provisioned in application"]) {
      expect(mensajeErrorFechaGasto({ code: "UNAUTHORIZED", status: 401, error })).toBe(MSG_SESION_EXPIRADA);
    }
    // Un 4xx con texto técnico: el API contestó y no aceptó (no «no respondió»).
    expect(mensajeErrorFechaGasto({ code: "CONFLICT", status: 409, error: "Conflict" })).toBe(MSG_FECHA_DATOS_RECHAZADOS);
    expect(mensajeErrorFechaGasto({ code: "PARSE_ERROR", status: 502, error: "Unexpected token <" })).toBe(MSG_FECHA_TECNICO);
    expect(mensajeErrorFechaGasto({ error: "fetch failed" })).toBe(MSG_FECHA_TECNICO);
    expect(mensajeErrorFechaGasto({ code: "BAD_GATEWAY", status: 502, error: "Algo raro" })).toBe(MSG_FECHA_TECNICO);
    expect(mensajeErrorFechaGasto({ code: "BAD_REQUEST", status: 400, error: "property x should not exist" })).toBe(
      MSG_FECHA_DATOS_RECHAZADOS,
    );
    expect(mensajeErrorFechaGasto({ code: "BAD_REQUEST", status: 400, error: "fecha_gasto debe ser AAAA-MM-DD" })).toBe(
      MSG_FECHA_DATOS_RECHAZADOS,
    );
    const futura = "La fecha del pago (15 oct 2026) es posterior a hoy (14 oct 2026): el banco no cobra en días que no han pasado.";
    expect(mensajeErrorFechaGasto({ code: "FECHA_GASTO_FUTURA", status: 400, error: futura })).toBe(futura);
    // La action ni contestó: tampoco se sabe si el PATCH llegó.
    expect(mensajeErrorFechaGasto({ error: MSG_SIN_CONEXION })).toBe(MSG_FECHA_TECNICO);
    expect(mensajeErrorFechaGasto(null)).toBe(MSG_FECHA_TECNICO);
  });

  it("los textos exactos", () => {
    // Revisión del 14-oct-2026: con la red o un 5xx NO se sabe si se guardó.
    expect(MSG_FECHA_TECNICO).toBe(
      "No se pudo confirmar si la fecha se guardó: el servidor no respondió. La lista se volvió a pedir: revisa la fecha del gasto antes de intentarlo otra vez.",
    );
    expect(MSG_FECHA_TECNICO).not.toContain("no se cambió");
    expect(TITULO_DESHACER_INCIERTO).toBe("No se pudo confirmar si se deshizo el cambio de fecha");
    expect(MSG_DESHACER_INCIERTO).toBe(
      "El servidor no respondió: revisa la fecha del gasto en la lista antes de volver a cambiarla.",
    );
    expect(MSG_SESION_EXPIRADA).toBe("Tu sesión expiró. Recarga la página e inicia sesión.");
    expect(MSG_FECHA_CONFLICTO).toBe("Alguien modificó este gasto en este momento: no se cambió la fecha. Vuelve a intentarlo.");
    expect(MSG_FECHA_API_VIEJO).toBe(
      "El servidor todavía no corrige fechas desde Conciliación (falta actualizar el API). Corrígela en Gastos → Verificar / editar.",
    );
    expect(MSG_FECHA_SIN_PERMISO).toBe("Tu usuario no puede corregir la fecha de un gasto desde Conciliación.");
    expect(MSG_FECHA_DATOS_RECHAZADOS).toBe(
      "La fecha no se cambió: el servidor no aceptó los datos. Recarga la página y vuelve a intentarlo.",
    );
  });
});

describe("avisos (toasts)", () => {
  it("corregida: título con las dos fechas y, sin aviso ni hora de carga, sin descripción", () => {
    expect(toastFechaCorregida(cambio())).toEqual({ titulo: "Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026" });
  });

  it("con la línea del API y la hora de carga movida ⇒ las dos, unidas con un espacio", () => {
    const aviso = "Septiembre 2026 ya terminó: si ya se cerró, regenera sus libros.";
    expect(
      toastFechaCorregida(
        cambio({ aviso, fecha_hora_carga: "2026-10-12T15:30:00+00:00", fecha_hora_carga_movida: true }),
      ),
    ).toEqual({
      titulo: "Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026",
      descripcion: `${aviso} La hora de la carga de combustible pasó al mismo día.`,
    });
    expect(
      toastFechaCorregida(cambio({ fecha_hora_carga: "2026-10-12T15:30:00+00:00", fecha_hora_carga_movida: true })),
    ).toEqual({
      titulo: "Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026",
      descripcion: NOTA_HORA_CARGA_MOVIDA,
    });
  });

  it("la hora de carga que YA caía en el día nuevo (no se movió) NO se anuncia; un API sin la bandera tampoco", () => {
    // 21:00 Cancún del 12-oct (02:00Z del 13-oct) con fecha_gasto 13-oct → 12-oct.
    const r = cambio({ fecha_anterior: "2026-10-13", fecha_hora_carga: "2026-10-13T02:00:00+00:00", fecha_hora_carga_movida: false });
    expect(toastFechaCorregida(r)).toEqual({ titulo: "Fecha del gasto corregida: 13 oct 2026 → 12 oct 2026" });
    expect(toastFechaCorregida(cambio({ fecha_hora_carga: "2026-10-12T15:30:00+00:00" })).descripcion).toBeUndefined();
  });

  it("ya tenía esa fecha ⇒ «no se cambió nada»; restaurada ⇒ su fecha", () => {
    expect(toastFechaCorregida(cambio({ cambio: false, fecha_anterior: "2026-10-12" }))).toEqual({ titulo: MSG_FECHA_SIN_CAMBIO });
    expect(MSG_FECHA_SIN_CAMBIO).toBe("El gasto ya tenía esa fecha: no se cambió nada.");
    expect(toastFechaRestaurada({ fecha_gasto: "2026-10-10" })).toBe("Fecha restaurada: 10 oct 2026");
  });
});

describe("los motivos del cargo pendiente mandan a «Fecha»", () => {
  it("SIN_CANDIDATOS y FUERA_DE_VENTANA citan los 3 días del cruce y el botón real", () => {
    const sin = motivoPendienteDe({ conciliado: false, motivo_pendiente: "SIN_CANDIDATOS" })?.detalle ?? "";
    const fuera = motivoPendienteDe({ conciliado: false, motivo_pendiente: "FUERA_DE_VENTANA" })?.detalle ?? "";
    expect(sin).toBe(
      "No hay ningún gasto sin conciliar que cuadre con este movimiento a 3 días o menos. Si el gasto ya está capturado con la fecha de la factura, ábrelo en «Vincular gasto» y corrige su fecha con «Fecha» (la fecha del gasto es la del pago); si no existe, créalo ahí mismo; si no es de un vuelo, clasifícalo.",
    );
    expect(fuera).toBe(
      "Hay un gasto igual pero con una fecha a más de 3 días de este cargo. En «Vincular gasto» corrige su fecha a la del pago con «Fecha», o vincúlalo a mano.",
    );
    for (const t of [sin, fuera]) {
      expect(t).toContain(`${DIAS_MARGEN_CRUCE} días`);
      expect(t).toContain(`«${BOTON_FECHA_FILA}»`);
      expect(t).toContain(`«${TITULO_VINCULAR_GASTO}»`);
    }
    // Las etiquetas no cambian.
    expect(motivoPendienteDe({ conciliado: false, motivo_pendiente: "SIN_CANDIDATOS" })?.etiqueta).toBe("Sin candidato");
    expect(motivoPendienteDe({ conciliado: false, motivo_pendiente: "FUERA_DE_VENTANA" })?.etiqueta).toBe("Fuera de la ventana");
  });
});

// Paridad con el repo hermano (si está al lado): el margen del cruce y los
// códigos de la ruta salen del API, no se adivinan.
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const servicio = leerApi("modules/conciliacion/conciliacion.service.ts");
const util = leerApi("modules/expenses/cambio-fecha-gasto.util.ts");

describe("paridad con vuelatour-api", () => {
  it.skipIf(!servicio)("DIAS_MARGEN_CRUCE = MATCH_DAYS del auto-cruce", () => {
    const m = /const MATCH_DAYS = (\d+);/.exec(servicio ?? "");
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(DIAS_MARGEN_CRUCE);
  });

  it.skipIf(!util)("los 8 códigos FECHA_GASTO_* existen en cambio-fecha-gasto.util.ts", () => {
    expect(CODIGOS_FECHA_GASTO).toHaveLength(8);
    for (const code of CODIGOS_FECHA_GASTO) expect(util).toContain(`'${code}'`);
  });

  it.skipIf(!util)("el texto del bloqueo por el mes del vuelo es el del API", () => {
    // El panel lo dice ANTES de guardar: mismas frases que textoFueraDelMesDelVuelo.
    for (const frase of [
      "No se puede: este gasto es del vuelo ",
      " quedaría en otro mes que su vuelo y el balance de ",
      " lo marcaría como pendiente («fecha FUERA del periodo del libro»). Déjale una fecha de ",
      "; para vincularlo no hace falta cambiarla.",
    ]) {
      expect(util).toContain(frase);
    }
    expect(bloqueoMesDelVuelo({ candado_mes_vuelo: { vuelo_dia: "2026-08-27", vuelo_folio: 201 } }, "2026-09-07", "2026-08-27")).toBe(
      "No se puede: este gasto es del vuelo #201 (27 ago 2026). Con fecha de septiembre 2026 quedaría en otro mes que su vuelo y el balance de agosto 2026 lo marcaría como pendiente («fecha FUERA del periodo del libro»). Déjale una fecha de agosto 2026; para vincularlo no hace falta cambiarla.",
    );
  });

  it.skipIf(!util)("el borde de 365 días del API es el del panel", () => {
    expect(util).toMatch(/CAMBIO_FECHA_DIAS_ATRAS_MAX = 365;/);
    expect(limitesFechaPago(HOY).min).toBe(sumarDias(HOY, -365));
  });
});
