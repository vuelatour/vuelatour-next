/**
 * «Omitir la conciliación» (14-oct-2026, API 0.0.77, invariante 75): el
 * motivo (9, 10, 300 y 301 caracteres), el botón con y sin avisos, la casilla
 * desde 20, los toasts, la traducción de CADA respuesta del API, la pestaña
 * y las tarjetas, la validación de las server actions y la paridad con el
 * API (nombre canónico, topes, textos del DTO) cuando el repo hermano está al
 * lado.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_CONFIRMAR_QUITAR_OMISION,
  BOTON_DESHACER,
  CLASIFICACION_OMITIDO,
  DESCRIPCION_OMITIR,
  ETIQUETA_BADGE_OMITIDO,
  MENU_OMITIR,
  MENU_QUITAR_OMISION,
  MOTIVO_OMISION_MAX,
  MOTIVO_OMISION_MIN,
  MSG_ACEPTAR_RIESGO_INVALIDO,
  MSG_CLASIFICACIONES_NO_CARGARON,
  MSG_DESHACER_FALLO,
  MSG_ELIGE_MOVIMIENTOS,
  MSG_MOTIVO_CORTO,
  MSG_MOTIVO_LARGO,
  MSG_MOVIMIENTO_INVALIDO,
  MSG_MOVIMIENTOS_REPETIDOS,
  MSG_OPCION_NO_ACTIVA,
  NOTA_OMITIDO_NO_SE_CRUZA,
  SUGERENCIAS_MOTIVO_OMISION,
  TEXTO_FALTA_ACEPTAR_RIESGOS,
  TEXTO_OMITIDOS_NO_CARGO,
  TEXTO_OMITIDOS_NO_DISPONIBLE,
  TEXTO_QUITAR_OMISION,
  TEXTO_REVISANDO,
  TEXTO_REVISION_FALLO,
  apiConOmision,
  avisoAbonosIngresos,
  avisoFaltaRevisarMuchos,
  botonOmitir,
  botonQuitarRiesgos,
  casillaAceptarRiesgos,
  casillaRevisarMuchos,
  conteoOmitidosDeResumen,
  errorListaMovimientos,
  errorMotivoOmision,
  esClasificacionOmitida,
  esDtoSinOmision,
  esOmitido,
  estadoMotivoOmision,
  fallaListaOmitidos,
  fechaCortaMovimiento,
  lineaListaOmitir,
  lineaMovimientoAviso,
  mensajeErrorOmision,
  mensajeErrorRevision,
  partesTarjetaOmitidos,
  requiereCasillaMuchos,
  resumenOmitir,
  textoAvisoRiesgos,
  textoBusquedaOmision,
  textoMotivoFila,
  textoNoPendientesRevision,
  textoPestanaOmitidos,
  textoTarjetaOmitidos,
  textoVacioOmitidos,
  tituloOmision,
  tituloOmitir,
  tituloQuitarOmision,
  toastOmitidos,
  toastRestaurados,
} from "../conciliacion-omision";
import { MSG_SESION_EXPIRADA } from "../conciliacion-lote";
import { resumenSeleccion } from "../conciliacion-seleccion";
import type { ConciliacionResumenCuenta, MovimientoBancario } from "@/types/conciliacion";

const OMISION = { motivo: "Comisión o IVA del banco", por: "Alejandro Canales", fecha: "14-oct-2026" };
const ID1 = "e1173c41-0000-4000-8000-000000000001";
const ID2 = "e4bd3023-0000-4000-8000-000000000002";

describe("la canónica y la fila", () => {
  it("esClasificacionOmitida: espejo del API (mayúsculas, espacios dobles, acentos)", () => {
    expect(CLASIFICACION_OMITIDO).toBe("Omitido de la conciliación");
    expect(esClasificacionOmitida("Omitido de la conciliación")).toBe(true);
    expect(esClasificacionOmitida("  OMITIDO   de la CONCILIACIÓN ")).toBe(true);
    expect(esClasificacionOmitida("Omitido de la conciliacion")).toBe(false);
    expect(esClasificacionOmitida("Estacionamiento")).toBe(false);
    expect(esClasificacionOmitida(null)).toBe(false);
  });

  it("esOmitido por `omision` (nunca por el nombre) y apiConOmision por la LLAVE", () => {
    expect(esOmitido({ omision: OMISION })).toBe(true);
    expect(esOmitido({ omision: { motivo: null, por: null, fecha: null } })).toBe(true);
    expect(esOmitido({ omision: null })).toBe(false);
    expect(esOmitido({})).toBe(false);
    expect(apiConOmision([{ omision: null }])).toBe(true);
    expect(apiConOmision([{ id: "x" }, { id: "y", omision: undefined }])).toBe(true);
    expect(apiConOmision([{ id: "x" }])).toBe(false);
    expect(apiConOmision([])).toBe(false);
  });

  it("badge, tooltip, motivo de la fila y la búsqueda", () => {
    expect(ETIQUETA_BADGE_OMITIDO).toBe("Omitido");
    expect(tituloOmision(OMISION)).toBe("Omitido por Alejandro Canales el 14-oct-2026: Comisión o IVA del banco");
    expect(tituloOmision({ motivo: null, por: null, fecha: null })).toBe("Omitido de la conciliación");
    expect(tituloOmision(null)).toBe("Omitido de la conciliación");
    expect(textoMotivoFila(OMISION)).toBe("Comisión o IVA del banco");
    expect(textoMotivoFila({ motivo: null, por: null, fecha: null })).toBe("Sin motivo legible");
    expect(textoBusquedaOmision({ omision: OMISION })).toBe("Omitido Comisión o IVA del banco Alejandro Canales");
    expect(textoBusquedaOmision({ omision: null })).toBe("");
  });
});

describe("el motivo (recortado, 10..300)", () => {
  it("9 ⇒ falta (ámbar); 10 y 300 ⇒ válido con el contador; 301 ⇒ sobra (rojo)", () => {
    expect(estadoMotivoOmision("123456789")).toEqual({
      valido: false,
      texto: "Escribe por qué no se concilia (mínimo 10 caracteres).",
      tono: "aviso",
    });
    expect(estadoMotivoOmision("  1234567890  ")).toEqual({
      valido: true,
      texto: "10/300 · Se guarda en las notas con tu nombre y la fecha.",
      tono: "ok",
    });
    expect(estadoMotivoOmision("x".repeat(300)).valido).toBe(true);
    expect(estadoMotivoOmision("x".repeat(301))).toEqual({ valido: false, texto: "Máximo 300 caracteres.", tono: "error" });
    expect(estadoMotivoOmision("Comisión o IVA del banco").texto).toBe(
      "24/300 · Se guarda en las notas con tu nombre y la fecha.",
    );
    expect(estadoMotivoOmision(null).valido).toBe(false);
  });

  it("los motivos rápidos (el más frecuente primero: 19 movimientos reales)", () => {
    expect(SUGERENCIAS_MOTIVO_OMISION).toEqual([
      "Comisión o IVA del banco",
      "Traspaso entre cuentas propias",
      "Movimiento personal (no es de la empresa)",
      "Anterior al uso del sistema (no se concilia)",
      "Duplicado en el estado de cuenta",
    ]);
    for (const s of SUGERENCIAS_MOTIVO_OMISION) expect(estadoMotivoOmision(s).valido, s).toBe(true);
  });

  it("validación de las server actions (antes de la red, textos del DTO)", () => {
    expect(errorMotivoOmision("123456789")).toBe(MSG_MOTIVO_CORTO);
    expect(errorMotivoOmision(" " + "x".repeat(10) + " ")).toBeNull();
    expect(errorMotivoOmision("x".repeat(301))).toBe(MSG_MOTIVO_LARGO);
    expect(errorMotivoOmision(42)).toBe(MSG_MOTIVO_CORTO);
    expect(MSG_MOTIVO_CORTO).toBe("El motivo debe tener al menos 10 caracteres.");
    expect(MSG_MOTIVO_LARGO).toBe("El motivo admite hasta 300 caracteres.");
    expect(errorListaMovimientos([], 200)).toBe(MSG_ELIGE_MOVIMIENTOS);
    expect(errorListaMovimientos("x", 200)).toBe(MSG_ELIGE_MOVIMIENTOS);
    expect(errorListaMovimientos([ID1, "nada"], 200)).toBe(MSG_MOVIMIENTO_INVALIDO);
    expect(errorListaMovimientos([ID1, ID1.toUpperCase()], 200)).toBe(MSG_MOVIMIENTOS_REPETIDOS);
    expect(errorListaMovimientos([ID1, ID2], 1)).toBe("Se pueden seleccionar hasta 1 movimientos por lote.");
    expect(errorListaMovimientos([ID1, ID2], 200)).toBeNull();
  });
});

describe("el diálogo «Omitir la conciliación»", () => {
  it("título, descripción y la lista", () => {
    expect(tituloOmitir(14)).toBe("Omitir la conciliación de 14 movimientos");
    expect(tituloOmitir(1)).toBe("Omitir la conciliación de este movimiento");
    expect(DESCRIPCION_OMITIR).toBe(
      "Dejan de contar como pendientes («Faltan …») sin ligarse a ningún gasto, cobro ni ingreso. Quedan como «Omitido» con tu motivo, tu nombre y la fecha, y se regresan a Pendientes desde la pestaña «Omitidos».",
    );
    const m = { fecha: "2026-09-24", descripcion: "IVA - COMISIONES", monto: "1.12", tipo: "CARGO" as const };
    expect(lineaListaOmitir(m, "GASTOS GNRAL", "MXN")).toBe("24 sep · GASTOS GNRAL · IVA - COMISIONES · $1.12 (cargo)");
    expect(lineaListaOmitir({ ...m, tipo: "ABONO", monto: "825.13" }, null)).toBe("24 sep · IVA - COMISIONES · $825.13 (abono)");
    expect(lineaListaOmitir({ ...m, monto: "17.00" }, "HSBC USD", "USD")).toBe("24 sep · HSBC USD · IVA - COMISIONES · $17.00 USD (cargo)");
    expect(fechaCortaMovimiento("2026-08-10")).toBe("10 ago");
    expect(fechaCortaMovimiento(null)).toBe("sin fecha");
    expect(lineaMovimientoAviso({ fecha: "2026-08-10", descripcion: "ASA CANCUN", monto: 3216.27, moneda: "MXN" })).toBe(
      "10 ago · ASA CANCUN $3,216.27",
    );
  });

  it("el resumen del diálogo: «14 movimientos · 14 cargos $56.84 MXN»", () => {
    const cuenta = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
    const movs = Array.from({ length: 7 }, () => ["7.00", "1.12"])
      .flat()
      .map((monto, i) => ({ id: String(i), cuenta_bancaria_id: cuenta, tipo: "CARGO", monto }) as MovimientoBancario);
    expect(resumenOmitir(resumenSeleccion(movs, { [cuenta]: "MXN" }))).toBe("14 movimientos · 14 cargos $56.84 MXN");
    expect(resumenOmitir(resumenSeleccion(movs.slice(0, 1), { [cuenta]: "MXN" }))).toBe("1 movimiento · 1 cargo $7.00 MXN");
  });

  it("revisión y avisos", () => {
    expect(TEXTO_REVISANDO).toBe("Revisando si alguno tiene un gasto o un cobro que cuadre…");
    expect(TEXTO_REVISION_FALLO).toBe("No se pudo revisar si alguno tiene un gasto o un cobro que cuadre.");
    expect(textoAvisoRiesgos(2)).toBe("Ojo: 2 podrían conciliarse de verdad");
    expect(textoAvisoRiesgos(1)).toBe("Ojo: 1 podría conciliarse de verdad");
    expect(botonQuitarRiesgos(2)).toBe("Quitar esos 2 de la selección");
    expect(botonQuitarRiesgos(1)).toBe("Quitar ese movimiento de la selección");
    expect(casillaAceptarRiesgos(2)).toBe("También omitir estos 2 (revisé que no son el pago de un gasto o un cobro)");
    expect(casillaAceptarRiesgos(1)).toBe("También omitir este (revisé que no es el pago de un gasto o un cobro)");
    expect(avisoAbonosIngresos(2)).toBe(
      "2 abonos: si es el pago de un cliente, concílialo en Ingresos → «Por conciliar» en vez de omitirlo.",
    );
    expect(avisoAbonosIngresos(1)).toBe(
      "1 abono: si es el pago de un cliente, concílialo en Ingresos → «Por conciliar» en vez de omitirlo.",
    );
    expect(avisoAbonosIngresos(0)).toBeNull();
    expect(textoNoPendientesRevision(1)).toBe("1 ya no está pendiente:");
    expect(textoNoPendientesRevision(2)).toBe("2 ya no están pendientes:");
    expect(NOTA_OMITIDO_NO_SE_CRUZA).toBe(
      "Un movimiento omitido ya no se cruza solo: si después capturas su gasto, deshaz la omisión y vincúlalo.",
    );
    expect(TEXTO_FALTA_ACEPTAR_RIESGOS).toContain("«También omitir…»");
  });

  it("la casilla «Revisé la lista» desde 20", () => {
    expect(requiereCasillaMuchos(19)).toBe(false);
    expect(requiereCasillaMuchos(20)).toBe(true);
    expect(casillaRevisarMuchos(24)).toBe("Revisé la lista: omitir los 24 movimientos.");
    expect(avisoFaltaRevisarMuchos(24)).toBe("Marca «Revisé la lista: omitir los 24 movimientos.» para continuar.");
  });

  it("el botón con y sin avisos", () => {
    expect(botonOmitir({ n: 14, nSinRiesgo: 14, aceptaRiesgos: false })).toBe("Omitir 14 movimientos");
    expect(botonOmitir({ n: 14, nSinRiesgo: 12, aceptaRiesgos: false })).toBe("Omitir 12 (sin los 2 con aviso)");
    expect(botonOmitir({ n: 3, nSinRiesgo: 2, aceptaRiesgos: false })).toBe("Omitir 2 (sin el 1 con aviso)");
    expect(botonOmitir({ n: 14, nSinRiesgo: 12, aceptaRiesgos: true })).toBe("Omitir 14 movimientos");
    expect(botonOmitir({ n: 1, nSinRiesgo: 1, aceptaRiesgos: false })).toBe("Omitir este movimiento");
    // Todos con aviso y sin aceptarlos: el botón dice el total (el clic explica qué falta).
    expect(botonOmitir({ n: 2, nSinRiesgo: 0, aceptaRiesgos: false })).toBe("Omitir 2 movimientos");
  });

  it("toasts y «Deshacer»", () => {
    expect(toastOmitidos(14)).toEqual({
      titulo: "14 movimientos omitidos de la conciliación",
      descripcion: "Ya no cuentan en «Faltan». Se deshacen en la pestaña «Omitidos».",
    });
    expect(toastOmitidos(1).titulo).toBe("1 movimiento omitido de la conciliación");
    expect(toastRestaurados(3)).toBe("Omisión deshecha: 3 movimientos vuelven a Pendientes.");
    expect(toastRestaurados(1)).toBe("Omisión deshecha: 1 movimiento vuelve a Pendientes.");
    expect(BOTON_DESHACER).toBe("Deshacer");
    expect(MSG_DESHACER_FALLO).toBe("No se pudo deshacer: hazlo desde la pestaña «Omitidos».");
  });

  it("«¿Deshacer la omisión…?» y el menú ⋯", () => {
    expect(tituloQuitarOmision(3)).toBe("¿Deshacer la omisión de 3 movimientos?");
    expect(tituloQuitarOmision(1)).toBe("¿Deshacer la omisión de este movimiento?");
    expect(TEXTO_QUITAR_OMISION).toBe(
      "Vuelven a «Pendientes» y a contar en «Faltan». De sus notas se quita solo la línea «Omitido de la conciliación…»; lo demás no cambia.",
    );
    expect(BOTON_CONFIRMAR_QUITAR_OMISION).toBe("Deshacer la omisión");
    expect(MENU_OMITIR).toBe("Omitir la conciliación…");
    expect(MENU_QUITAR_OMISION).toBe("Deshacer la omisión…");
    expect(MSG_CLASIFICACIONES_NO_CARGARON).toBe("No se pudieron cargar las clasificaciones: cierra y vuelve a abrir.");
  });
});

describe("mensajeErrorOmision: cada respuesta del API en palabras del operador", () => {
  it("sin conexión, red o 5xx ⇒ INCIERTO (refrescar), jamás «no se omitió»", () => {
    for (const r of [
      { ok: false, code: "SIN_CONEXION", error: "x" },
      { ok: false, error: "fetch failed" },
      { ok: false, status: 500, code: "INTERNAL_ERROR", error: "Internal server error" },
      { ok: false, status: 502, code: "PARSE_ERROR", error: "Bad Gateway" },
      { ok: false, status: 503, code: "PARSE_ERROR", error: "Service Unavailable" },
    ]) {
      expect(mensajeErrorOmision(r, "omitir"), JSON.stringify(r)).toEqual({
        titulo: "No se pudo confirmar si se omitieron: revisa la lista antes de reintentar.",
        incierto: true,
        refrescar: true,
      });
    }
    expect(mensajeErrorOmision({ ok: false, status: 500 }, "deshacer").titulo).toBe(
      "No se pudo confirmar si se deshizo: revisa la lista antes de reintentar.",
    );
  });

  it("ruta inexistente, DTO previo o el 503 de la migración ⇒ «todavía no está activa»", () => {
    const casos = [
      { ok: false, status: 404, code: "RUTA_NO_DISPONIBLE", error: MSG_OPCION_NO_ACTIVA },
      { ok: false, status: 404, code: "NOTFOUNDEXCEPTION", error: "Cannot POST /v1/conciliacion/movimientos/omitir" },
      { ok: false, status: 503, code: "CONCILIACION_OMITIR_NO_DISPONIBLE", error: MSG_OPCION_NO_ACTIVA },
      { ok: false, status: 400, code: "BAD_REQUEST", error: "property movimiento_ids should not exist" },
    ];
    for (const r of casos) {
      expect(mensajeErrorOmision(r, "omitir"), JSON.stringify(r)).toEqual({
        titulo: "Esta opción todavía no está activa: avisa a sistemas.",
        incierto: false,
        refrescar: false,
      });
    }
    expect(esDtoSinOmision({ status: 400, error: "property aceptar_riesgo_ids should not exist" })).toBe(true);
    expect(esDtoSinOmision({ status: 400, error: "El motivo debe tener al menos 10 caracteres." })).toBe(false);
  });

  it("401 y 403", () => {
    expect(mensajeErrorOmision({ ok: false, status: 401, error: "Invalid or expired token" }, "omitir").titulo).toBe(
      MSG_SESION_EXPIRADA,
    );
    expect(mensajeErrorOmision({ ok: false, status: 403, error: "Forbidden resource" }, "omitir").titulo).toBe(
      "Tu usuario no puede conciliar movimientos del banco.",
    );
  });

  it("409 MOVIMIENTO_NO_PENDIENTE: el texto del API, los ids para quitarlos y refrescar al cerrar", () => {
    const texto =
      "No se omitió ninguno: 1 de los 2 movimientos ya no está pendiente — 12 oct · ASA CANCUN $8,468.91 (ya está vinculado a un gasto). Recarga la lista y vuelve a seleccionar.";
    expect(
      mensajeErrorOmision(
        {
          ok: false,
          status: 409,
          code: "MOVIMIENTO_NO_PENDIENTE",
          error: texto,
          details: { movimientos: [{ id: ID1, estado: "CON_GASTO" }] },
        },
        "omitir",
      ),
    ).toEqual({ titulo: texto, incierto: false, refrescar: true, quitarIds: [ID1] });
  });

  it("404 MOVIMIENTO_NO_EXISTE: los `faltan`", () => {
    expect(
      mensajeErrorOmision(
        { ok: false, status: 404, code: "MOVIMIENTO_NO_EXISTE", error: "Uno de los movimientos ya no existe: recarga la página.", details: { faltan: [ID2] } },
        "omitir",
      ),
    ).toEqual({ titulo: "Uno de los movimientos ya no existe: recarga la página.", incierto: false, refrescar: true, quitarIds: [ID2] });
  });

  it("409 OMITIR_CON_RIESGO: los avisos del API para pintarlos (sin refrescar)", () => {
    const riesgo = {
      id: ID1,
      fecha: "2026-08-10",
      tipo: "CARGO",
      monto: 3216.27,
      moneda: "MXN",
      descripcion: "ASA CANCUN",
      riesgo: "GASTO_QUE_CUADRA",
      texto: "hay un gasto que cuadra: «Cruzar pendientes» o «Vincular gasto» lo resuelven",
    };
    const e = mensajeErrorOmision(
      { ok: false, status: 409, code: "OMITIR_CON_RIESGO", error: "1 de los 2 movimientos podría conciliarse de verdad: …", details: { movimientos: [riesgo, null, { sinId: true }] } },
      "omitir",
    );
    expect(e.riesgos).toEqual([riesgo]);
    expect(e.refrescar).toBe(false);
    expect(e.incierto).toBe(false);
  });

  it("409 MOVIMIENTO_NO_OMITIDO (deshacer) y un 4xx sin texto útil (nada se escribió)", () => {
    const texto = "No se restauró ninguno: 1 de los 3 ya no está omitido (24 sep · IVA - COMISIONES $1.12). Recarga la lista.";
    expect(
      mensajeErrorOmision({ ok: false, status: 409, code: "MOVIMIENTO_NO_OMITIDO", error: texto, details: { movimientos: [{ id: ID2 }] } }, "deshacer"),
    ).toEqual({ titulo: texto, incierto: false, refrescar: true, quitarIds: [ID2] });
    expect(mensajeErrorOmision({ ok: false, status: 409, code: "CONFLICT", error: "Conflict" }, "omitir").titulo).toBe(
      "No se omitió ningún movimiento: vuelve a intentarlo; si sigue igual, avisa a sistemas.",
    );
    expect(mensajeErrorOmision({ ok: false, status: 400, code: "MOTIVO_INVALIDO", error: MSG_MOTIVO_CORTO }, "omitir").titulo).toBe(
      MSG_MOTIVO_CORTO,
    );
    expect(
      mensajeErrorOmision({ ok: false, status: 400, code: "ACEPTAR_RIESGO_INVALIDO", error: MSG_ACEPTAR_RIESGO_INVALIDO }, "omitir").titulo,
    ).toBe("Los movimientos con aviso que confirmas deben estar en la selección.");
  });

  it("la revisión (solo lectura): no activa, sesión, el 400 del DTO o «no se pudo revisar»", () => {
    expect(mensajeErrorRevision({ status: 404, error: "Cannot POST /v1/conciliacion/movimientos/omitir/revisar" })).toBe(
      MSG_OPCION_NO_ACTIVA,
    );
    expect(mensajeErrorRevision({ status: 401 })).toBe(MSG_SESION_EXPIRADA);
    expect(mensajeErrorRevision({ status: 400, error: "Hay movimientos repetidos en la selección." })).toBe(
      "Hay movimientos repetidos en la selección.",
    );
    expect(mensajeErrorRevision({ code: "SIN_CONEXION", error: "x" })).toBe(TEXTO_REVISION_FALLO);
    expect(mensajeErrorRevision({ status: 500, error: "Internal server error" })).toBe(TEXTO_REVISION_FALLO);
  });
});

describe("página: pestaña «Omitidos (N)» y tarjetas", () => {
  const cuenta = (id: string, omitidos?: number | null): ConciliacionResumenCuenta => ({
    cuenta_bancaria_id: id,
    alias: id,
    banco: null,
    moneda: "MXN",
    total: 10,
    conciliados: 5,
    pendientes: 5,
    monto_pendiente: 1,
    ...(omitidos === undefined ? {} : { omitidos }),
  });

  it("conteo: suma de las cuentas o la filtrada; sin dato (resumen caído, API previo o null) ⇒ null", () => {
    expect(conteoOmitidosDeResumen([cuenta("a", 14), cuenta("b", 2)])).toBe(16);
    expect(conteoOmitidosDeResumen([cuenta("a", 14), cuenta("b", 2)], "b")).toBe(2);
    expect(conteoOmitidosDeResumen([cuenta("a", 14)], "otra")).toBe(0);
    expect(conteoOmitidosDeResumen([])).toBe(0);
    expect(conteoOmitidosDeResumen(null)).toBeNull();
    expect(conteoOmitidosDeResumen([cuenta("a")])).toBeNull();
    expect(conteoOmitidosDeResumen([cuenta("a", null), cuenta("b", 2)])).toBeNull();
    // API previo en OTRA cuenta: no se inventa el 0 de la filtrada.
    expect(conteoOmitidosDeResumen([cuenta("a"), cuenta("b", 2)], "b")).toBeNull();
  });

  it("textos de la pestaña, la tarjeta y los estados", () => {
    expect(textoPestanaOmitidos(14)).toBe("Omitidos (14)");
    expect(textoPestanaOmitidos(0)).toBe("Omitidos (0)");
    expect(textoPestanaOmitidos(null)).toBe("Omitidos");
    expect(textoTarjetaOmitidos(1)).toBe("incluye 1 omitido");
    expect(textoTarjetaOmitidos(14)).toBe("incluye 14 omitidos");
    expect(textoTarjetaOmitidos(0)).toBeNull();
    expect(textoTarjetaOmitidos(null)).toBeNull();
    expect(partesTarjetaOmitidos(14)).toEqual({ antes: "incluye ", enlace: "14 omitidos" });
    expect(TEXTO_OMITIDOS_NO_DISPONIBLE).toBe("Esta pestaña todavía no está activa: avisa a sistemas.");
    expect(TEXTO_OMITIDOS_NO_CARGO).toBe("No se pudo consultar la lista de omitidos: recarga la página.");
    expect(textoVacioOmitidos(null)).toBe("No hay movimientos omitidos.");
    expect(textoVacioOmitidos("del 01 oct 2026 al 12 oct 2026", true)).toBe(
      "No hay movimientos omitidos del 01 oct 2026 al 12 oct 2026 en esta cuenta.",
    );
  });

  it("falla de la lista: el 400 de la llave en un API previo ⇒ no activa; lo demás ⇒ no se pudo consultar", () => {
    expect(fallaListaOmitidos({ status: 400, message: "property solo_omitidos should not exist" })).toBe("NO_ACTIVA");
    expect(fallaListaOmitidos({ status: 503, message: "No se pudo consultar la lista de omitidos: recarga la página." })).toBe(
      "NO_CARGO",
    );
    expect(fallaListaOmitidos(new TypeError("fetch failed"))).toBe("NO_CARGO");
    expect(fallaListaOmitidos(null)).toBe("NO_CARGO");
  });
});

describe("paridad con el API (si el repo hermano está al lado)", () => {
  const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
  const leerApi = (rel: string): string | null => {
    const p = path.join(API, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };

  it("nombre canónico, topes del motivo, «todavía no está activa» y los textos del DTO", () => {
    const omision = leerApi("modules/conciliacion/omision.util.ts");
    const sonda = leerApi("common/omision-cargos-disponible.util.ts");
    const dto = leerApi("modules/conciliacion/dto/conciliacion.dto.ts");
    if (!omision || !sonda || !dto) return;
    expect(omision).toContain(`export const CLASIFICACION_OMITIDO = '${CLASIFICACION_OMITIDO}';`);
    expect(omision).toContain(`export const MOTIVO_OMISION_MIN = ${MOTIVO_OMISION_MIN};`);
    expect(omision).toContain(`export const MOTIVO_OMISION_MAX = ${MOTIVO_OMISION_MAX};`);
    expect(omision).toContain(`'${MSG_ACEPTAR_RIESGO_INVALIDO}'`);
    expect(sonda).toContain(`'${MSG_OPCION_NO_ACTIVA}'`);
    expect(dto).toContain(`'${MSG_ELIGE_MOVIMIENTOS}'`);
    expect(dto).toContain(`'${MSG_MOVIMIENTOS_REPETIDOS}'`);
    expect(dto).toContain(`'${MSG_MOVIMIENTO_INVALIDO}'`);
    expect(dto).toContain("`El motivo debe tener al menos ${MOTIVO_OMISION_MIN} caracteres.`");
    expect(dto).toContain("`El motivo admite hasta ${MOTIVO_OMISION_MAX} caracteres.`");
    // La lista de omitidos con un API sin la canónica legible: su texto es el del panel.
    expect(leerApi("modules/conciliacion/conciliacion.service.ts") ?? "").toContain(`'${TEXTO_OMITIDOS_NO_CARGO}'`);
  });
});
