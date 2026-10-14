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
  MSG_FECHA_API_VIEJO,
  MSG_FECHA_CONFLICTO,
  MSG_FECHA_DATOS_RECHAZADOS,
  MSG_FECHA_IGUAL,
  MSG_FECHA_INCOMPLETA,
  MSG_FECHA_MUY_ANTIGUA,
  MSG_FECHA_SIN_CAMBIO,
  MSG_FECHA_SIN_PERMISO,
  MSG_FECHA_TECNICO,
  MSG_GASTO_NO_EXISTE_FECHA,
  NOTA_HORA_CARGA_MOVIDA,
  NOTA_TARJETA_DESFASE,
  TEXTO_CONFIRMAR_SIN_DETALLE,
  TITULO_CONFIRMAR_CAMBIO_MES,
  TITULO_CONFIRMAR_MES_TERMINADO,
  TITULO_CORREGIR_FECHA,
  avisosFechaPago,
  botonUsarFechaCargo,
  conFechaCorregida,
  conFechasCorregidas,
  descripcionCorregirFecha,
  diasEntreDias,
  etiquetaBotonFecha,
  fechaDeCandidato,
  limitesFechaPago,
  mensajeErrorFechaGasto,
  mesTexto,
  nudgeFechaMarcado,
  puedeCorregirFechaDeCandidato,
  resultadoCorregirFecha,
  sumarDias,
  textoFechaActual,
  toastFechaCorregida,
  toastFechaRestaurada,
  validarNuevaFechaGasto,
} from "../conciliacion-fecha-gasto";
import { motivoPendienteDe } from "../conciliacion-auto";
import { MEDIOS_BANCARIOS_CONCILIACION } from "../conciliacion-no-bancario";
import { MSG_SIN_CONEXION, TITULO_VINCULAR_GASTO } from "../conciliacion-lote";
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
  it("etiqueta del botón, descripción, fecha actual y atajo", () => {
    expect(BOTON_FECHA_FILA).toBe("Fecha");
    expect(etiquetaBotonFecha(WINJET)).toBe("Corregir la fecha del gasto (10 oct 2026)");
    expect(etiquetaBotonFecha({ fecha: null })).toBe(TITULO_CORREGIR_FECHA);
    expect(descripcionCorregirFecha(WINJET)).toBe(
      "Taxi / estacionamiento · $321.54 MXN · Winjet · Boleto Adulto ferry CZM-PDC. La fecha del gasto es la del PAGO (la del cargo del banco), no la de la factura.",
    );
    expect(textoFechaActual("2026-10-10")).toBe("Fecha actual del gasto: 10 oct 2026");
    expect(botonUsarFechaCargo("2026-10-12")).toBe("Usar la fecha del cargo (12 oct 2026)");
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

  it("mapa vacío o id ajeno ⇒ la MISMA referencia", () => {
    expect(conFechasCorregidas(lista, {})).toBe(lista);
    expect(conFechasCorregidas(lista, { "c0000000-0000-4000-8000-000000000003": "2026-10-12" })).toBe(lista);
    expect(conFechasCorregidas(lista, { [A.id]: "2026-10-10" })).toBe(lista);
  });

  it("corrige fecha y fecha_gasto SOLO de ese id; los demás conservan su referencia", () => {
    const r = conFechasCorregidas(lista, { [A.id]: "2026-10-12" });
    expect(r).not.toBe(lista);
    expect(r[0]).toEqual({ ...A, fecha: "2026-10-12", fecha_gasto: "2026-10-12" });
    expect(r[1]).toBe(B);
  });

  it("conFechaCorregida devuelve el mismo objeto si no hay cambio", () => {
    expect(conFechaCorregida(A, {})).toBe(A);
    expect(conFechaCorregida(A, { [A.id]: "2026-10-10" })).toBe(A);
    expect(conFechaCorregida({ id: "x", fecha_gasto: "2026-10-12" }, { x: "2026-10-12" })).toEqual({
      id: "x",
      fecha_gasto: "2026-10-12",
    });
    expect(conFechaCorregida({ id: "constructor", fecha: "2026-10-01" }, {})).toEqual({
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

  it("sin respuesta, o ok sin datos ⇒ error técnico", () => {
    expect(resultadoCorregirFecha(undefined)).toEqual({ tipo: "error", texto: MSG_FECHA_TECNICO });
    expect(resultadoCorregirFecha({ ok: true })).toEqual({ tipo: "error", texto: MSG_FECHA_TECNICO });
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
    expect(mensajeErrorFechaGasto({ error: MSG_SIN_CONEXION })).toBe(MSG_SIN_CONEXION);
    expect(mensajeErrorFechaGasto(null)).toBe(MSG_FECHA_TECNICO);
  });

  it("los textos exactos", () => {
    expect(MSG_FECHA_TECNICO).toBe(
      "La fecha no se cambió. El servidor no respondió. Vuelve a intentarlo en un minuto; si sigue igual, avisa a sistemas.",
    );
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
    expect(toastFechaCorregida(cambio({ aviso, fecha_hora_carga: "2026-10-12T15:30:00+00:00" }))).toEqual({
      titulo: "Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026",
      descripcion: `${aviso} La hora de la carga de combustible pasó al mismo día.`,
    });
    expect(toastFechaCorregida(cambio({ fecha_hora_carga: "2026-10-12T15:30:00+00:00" }))).toEqual({
      titulo: "Fecha del gasto corregida: 10 oct 2026 → 12 oct 2026",
      descripcion: NOTA_HORA_CARGA_MOVIDA,
    });
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

  it.skipIf(!util)("los 7 códigos FECHA_GASTO_* existen en cambio-fecha-gasto.util.ts", () => {
    expect(CODIGOS_FECHA_GASTO).toHaveLength(7);
    for (const code of CODIGOS_FECHA_GASTO) expect(util).toContain(`'${code}'`);
  });

  it.skipIf(!util)("el borde de 365 días del API es el del panel", () => {
    expect(util).toMatch(/CAMBIO_FECHA_DIAS_ATRAS_MAX = 365;/);
    expect(limitesFechaPago(HOY).min).toBe(sumarDias(HOY, -365));
  });
});
