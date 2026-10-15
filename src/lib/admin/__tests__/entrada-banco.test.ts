/**
 * «Conciliación al revés» de una ENTRADA de dinero (15-oct-2026, API 0.0.78,
 * invariante 78): el módulo PURO `lib/admin/entrada-banco.ts` con las
 * respuestas REALES de la spec (ING-3, #293, #358, el SPEI de $69,183.00
 * desde #332 y #315, #223, #163, #379, #323, #383, #349, #375) y las
 * SINTÉTICAS rotuladas (parcial, sobre, anticipo, espejo). Ningún número se
 * calcula: los textos pintan lo que manda el API.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import {
  BOTON_BUSCAR_ABONO,
  BOTON_BUSCAR_ABONO_QUE_FALTA,
  BOTON_VER_ABONOS_CONCILIADOS,
  INTRO_COBRO_SIN_CONCILIAR,
  INTRO_PARCIAL_ENTRADA,
  MARGEN_CRUCE_ABONO_DIAS,
  MARGEN_CRUCE_PAYWISE_DIAS,
  MSG_COBRO_YA_NO_EXISTE,
  MSG_ENTRADA_INVALIDA,
  MSG_INGRESO_YA_NO_EXISTE,
  NOTA_COBRO_PAYWISE,
  NOTA_COBRO_USD,
  NOTA_ESPEJO_ENTRADA,
  TEXTO_LIGA_COBRO_ANTERIOR,
  TEXTO_LOTE_ENTRADA_SIN_DETALLE,
  abreDetalleEntrada,
  accionesPendienteEntrada,
  avisoCruceNoCorrio,
  claveEntradaControlada,
  contextoEntrada,
  descripcionHojaEntrada,
  estadoCambioEntrada,
  estadoFilaDeCobroVuelo,
  fichaAbonoEntrada,
  filaBancoDeCobroVuelo,
  filaBancoDeEntrada,
  filaBancoDeIngreso,
  hrefAnticipoEnIngresos,
  hrefBuscarAbonoEnConciliacion,
  hrefBuscarDesdeFila,
  hrefConciliacionCruzarPendientes,
  lineaComisionEntrada,
  lineaPagoEntrada,
  lineaRegistroEntrada,
  mensajeErrorDetalleEntrada,
  nombreAccesibleEntrada,
  nombreParaBuscar,
  notaDestinoPasarela,
  notasEntrada,
  resumenEstadoEntrada,
  textoAlertaConciliacionEntrada,
  textoCoberturaEntrada,
  textoDePiezas,
  textoMismoDiaCliente,
} from "@/lib/admin/entrada-banco";
import { MSG_DETALLE_BANCO_API_VIEJO, MSG_DETALLE_BANCO_FALLO, MSG_DETALLE_BANCO_SIN_PERMISO, MSG_SESION_EXPIRO } from "@/lib/admin/hoja-banco";
import { hrefBuscarAbonoQueFalta } from "@/lib/admin/cobro-banco";
import type { ConciliacionDeEntrada } from "@/types/conciliacion-entrada";
import type { EntradaDinero, Ingreso } from "@/types/ingresos";
import type { FlightCobro } from "@/types/flights";
import {
  ABONO_1700_A,
  ABONO_69183,
  ANTICIPO_ID,
  C315,
  C332,
  CUENTA_COMBUSTIBLE,
  CUENTA_EJE,
  CUENTA_PAYWISE,
  ING3_ABONO,
  ULTIMOS_PROD,
  VUELO_315,
  respuesta163,
  respuesta223,
  respuesta293,
  respuesta315,
  respuesta323,
  respuesta332,
  respuesta349,
  respuesta358,
  respuesta375,
  respuesta379,
  respuesta383,
  respuestaAnticipo,
  respuestaAnticipoSinConciliar,
  respuestaDosAbonos,
  respuestaEspejo,
  respuestaIng3,
  respuestaParcial,
  respuestaSobre,
  respuestaSobreSinConciliar,
} from "./entrada-banco.fixtures";

const HOY = "2026-10-15";

describe("la frase del estado (todas las ramas)", () => {
  it("conciliados: 1 abono, lote, 2 abonos (con y sin cobertura), anticipo como fila, vía anticipo, sobre", () => {
    expect(resumenEstadoEntrada(respuestaIng3())).toEqual({ texto: "Conciliado con 1 abono del banco.", tono: "ok" });
    expect(resumenEstadoEntrada(respuesta332())).toEqual({
      texto: "Conciliado: lo paga un abono del banco junto con 1 cobro más.",
      tono: "ok",
    });
    expect(resumenEstadoEntrada(respuestaDosAbonos())).toEqual({
      texto: "Conciliado con 2 abonos del banco: suman $3,400.00 de $3,400.00.",
      tono: "ok",
    });
    expect(resumenEstadoEntrada({ ...respuestaDosAbonos(), cobertura: null }).texto).toBe("Conciliado con 2 abonos del banco.");
    const anticipoComoFila = respuestaIng3();
    anticipoComoFila.entrada = { ...anticipoComoFila.entrada, categoria: "ANTICIPO_CLIENTE" };
    expect(resumenEstadoEntrada(anticipoComoFila).texto).toBe("Conciliado con 1 abono del banco: respalda el anticipo completo.");
    expect(resumenEstadoEntrada(respuestaAnticipo())).toEqual({
      texto: "Conciliado vía anticipo: este cobro salió del anticipo ING-12, que está conciliado con un abono del banco.",
      tono: "ok",
    });
    expect(resumenEstadoEntrada(respuestaSobre()).texto).toBe(
      "Conciliado vía el sobre G-4: el abono del banco pagó el sobre completo del grupo.",
    );
  });

  it("parte cruzada (USD pagado en MXN), conciliado sin abonos y estado desconocido", () => {
    const r = respuesta223();
    const cruzada: ConciliacionDeEntrada = {
      ...r,
      estado: "CONCILIADO",
      via: "DIRECTO",
      abonos: [{ ...respuesta332().abonos[0], monto: 14000, lote: null, liga: { ...respuesta332().abonos[0].liga, cruzada: true, monto_parte: 14000 } }],
    };
    expect(resumenEstadoEntrada(cruzada).texto).toBe("Conciliado: cobro en USD pagado con un abono en MXN.");
    expect(resumenEstadoEntrada({ ...respuesta332(), abonos: [] })).toEqual({
      texto: "Aparece como conciliado, pero no se pudo leer el abono del banco.",
      tono: "aviso",
    });
    expect(resumenEstadoEntrada({ ...respuesta332(), estado: "NUEVO" as never })).toEqual({
      texto: "Revisa este cobro en Conciliación.",
      tono: "aviso",
    });
    expect(resumenEstadoEntrada({ ...respuestaIng3(), estado: "NUEVO" as never }).texto).toBe("Revisa este ingreso en Conciliación.");
  });

  it("parcial (con y sin cobertura), sin conciliar (cobro, ingreso, anticipo, sobre, baja) y no bancarios", () => {
    expect(resumenEstadoEntrada(respuestaParcial())).toEqual({
      texto: "Conciliado parcial: los abonos ligados suman $1,700.00; faltan $1,700.00 de $3,400.00.",
      tono: "aviso",
    });
    expect(resumenEstadoEntrada({ ...respuestaParcial(), cobertura: null }).texto).toBe(
      "Conciliado parcial: los abonos ligados no cubren el cobro.",
    );
    expect(resumenEstadoEntrada(respuesta223())).toEqual({
      texto: "Sin conciliar: ningún abono del banco está ligado a este cobro (Transferencia).",
      tono: "pendiente",
    });
    const ingresoPendiente: ConciliacionDeEntrada = { ...respuestaIng3(), estado: "SIN_CONCILIAR", via: null, abonos: [] };
    expect(resumenEstadoEntrada(ingresoPendiente).texto).toBe(
      "Sin conciliar: ningún abono del banco está ligado a este ingreso (COMBUSTIBLE).",
    );
    expect(resumenEstadoEntrada(respuestaAnticipoSinConciliar()).texto).toBe(
      "Sin conciliar: este cobro salió del anticipo ING-12 y ese anticipo todavía no está ligado a su abono del banco.",
    );
    expect(resumenEstadoEntrada(respuestaSobreSinConciliar()).texto).toBe(
      "Sin conciliar: este cobro es parte del sobre G-4 y ese sobre todavía no está ligado a su abono del banco.",
    );
    expect(
      resumenEstadoEntrada({ ...ingresoPendiente, entrada: { ...ingresoPendiente.entrada, dado_de_baja: true } }),
    ).toEqual({ texto: "Dado de baja: ya no se concilia.", tono: "neutro" });
    const efectivo: ConciliacionDeEntrada = {
      ...respuesta223(),
      estado: "NO_BANCARIO",
      entrada: { ...respuesta223().entrada, metodo: "EFECTIVO", metodo_etiqueta: "Efectivo" },
    };
    expect(resumenEstadoEntrada(efectivo)).toEqual({
      texto: "Este cobro no se concilia uno a uno con el banco (Efectivo).",
      tono: "neutro",
    });
    expect(
      resumenEstadoEntrada({ ...efectivo, entrada: { ...efectivo.entrada, es_reembolso: true, monto: -500 } }).texto,
    ).toBe("Es un reembolso al cliente: sale del banco como un cargo y no se concilia aquí.");
    expect(
      resumenEstadoEntrada({ ...respuestaIng3(), estado: "NO_BANCARIO", entrada: { ...respuestaIng3().entrada, cuenta: null } }).texto,
    ).toBe("Efectivo / caja: este ingreso no pasa por el banco.");
  });
});

describe("encabezado de la hoja", () => {
  it("descripción (cliente recortado, sin vacíos), con qué se pagó y quién registró", () => {
    expect(descripcionHojaEntrada(respuesta332().entrada)).toBe("Vuelo #332 · Cobro de vuelo · $977.45 · 15 sep 2026 · Beh Kay");
    expect(descripcionHojaEntrada(respuestaIng3().entrada)).toBe("ING-3 · Otros ingresos · $78.00 · 10 sep 2026 · didi");
    expect(descripcionHojaEntrada(respuesta223().entrada)).toBe(
      "Vuelo #223 · Cobro de vuelo · $812.00 USD · 10 sep 2026 · Morena Mia",
    );
    expect(lineaPagoEntrada(respuesta332().entrada)).toBe("Cobrado con: Transferencia · cuenta capturada: Scotiabank Pesos");
    expect(lineaPagoEntrada(respuesta293().entrada)).toBe("Cobrado con: Link de pago (Paywise)");
    expect(lineaPagoEntrada(respuesta223().entrada)).toBe("Cobrado con: Transferencia · cuenta capturada: HSBC Dólares");
    expect(lineaPagoEntrada(respuestaIng3().entrada)).toBe("Entró a: COMBUSTIBLE · Scotiabank (MXN) · Transferencia");
    expect(lineaPagoEntrada({ ...respuestaIng3().entrada, cuenta: null })).toBe("Entró a: efectivo / caja");
    expect(lineaRegistroEntrada(respuesta383().entrada)).toBe(
      `Registró el cobro: Itzi · ${fmtDateTime("2026-10-08T18:43:29.809678+00:00")}`,
    );
    expect(lineaRegistroEntrada(respuestaIng3().entrada)).toBe(
      `Registró el ingreso: Alejandro Canales · ${fmtDateTime("2026-10-12T22:57:31.939317+00:00")}`,
    );
    expect(lineaRegistroEntrada({ ...respuesta383().entrada, registrado_por_nombre: null })).toBe(
      `Registrado el ${fmtDateTime("2026-10-08T18:43:29.809678+00:00")}`,
    );
    expect(lineaRegistroEntrada({ ...respuesta383().entrada, registrado_por_nombre: null, registrado_at: null })).toBeNull();
  });

  it("la línea de la comisión: solo con comisión, los tres números de `entrada` (#293)", () => {
    expect(lineaComisionEntrada(respuesta293().entrada)).toBe(
      "El cliente pagó $12,495.00; la comisión registrada es de $624.76, así que al banco debe llegar el neto: $11,870.24.",
    );
    expect(lineaComisionEntrada({ ...respuestaIng3().entrada, monto: 1000, comision: 50, neto: 950 })).toBe(
      "El ingreso es de $1,000.00; la comisión registrada es de $50.00, así que al banco debe llegar el neto: $950.00.",
    );
    expect(lineaComisionEntrada(respuesta332().entrada)).toBeNull();
  });
});

describe("la tarjeta de cada abono", () => {
  it("ING-3: cuenta, leyenda, archivo con descarga, «Registró la liga» de la bitácora y «Ver en Conciliación» sin `cobro`", () => {
    const r = respuestaIng3();
    const f = fichaAbonoEntrada(r.abonos[0], r);
    expect(f.titulo).toBe("Abono del 10 sep 2026");
    expect(f.monto).toBe("$78.00");
    expect(f.cuenta).toBe("COMBUSTIBLE · Scotiabank (MXN)");
    expect(f.leyenda).toBe(
      "Leyenda del banco: «DLO DIDI RIDES MX (AJUSTE)» · Ref. 00005579209156174929 REF. 9156174929 AUT. 085488",
    );
    expect(f.aporte).toBeNull();
    expect(f.archivo).toEqual({
      tipo: "ARCHIVO",
      nombre: "scotia combus (6).pdf",
      detalle: `Importado el ${fmtDateTime("2026-09-29T20:35:24.229074+00:00")} por Jimmy Chi`,
      estadoCuentaId: "caa0a50a-df3d-4df4-96e1-97845d8ae7e1",
      etiquetaDescarga: "Descargar estado de cuenta (PDF)",
    });
    expect(f.registro).toBe(`Registró la liga: Alejandro Canales · ${fmtDateTime("2026-10-12T22:57:32.606618+00:00")}`);
    expect(f.href).toBe(
      `/admin/conciliacion?f=conciliados&cuenta=${CUENTA_COMBUSTIBLE.id}&desde=2026-09-10&hasta=2026-09-10&mov=${ING3_ABONO}`,
    );
  });

  it("#332: el lote completo con «(este cobro)» sin enlace, el aporte y «Ver en Conciliación» con `cobro`", () => {
    const r = respuesta332();
    const f = fichaAbonoEntrada(r.abonos[0], r);
    expect(f.aporte).toBe("Este abono pagó 2 cobros; a este le tocan $977.45.");
    expect(f.lote?.titulo).toBe("2 cobros · suman $69,183.00");
    expect(f.lote?.lineas.map((l) => [l.principal, l.secundaria, l.esEste, l.hrefVuelo])).toEqual([
      ["Vuelo #315 · Beh Kay", `cobro ${fmtDate("2026-09-15T17:00:00+00:00")} · $68,205.55 MXN`, false, `/admin/flights/${VUELO_315}#cobros`],
      ["Vuelo #332 · Beh Kay", `cobro ${fmtDate("2026-09-15T17:00:00+00:00")} · $977.45 MXN`, true, "/admin/flights/6f1825e3-0c54-45f1-bb66-d8f27a71fb7e#cobros"],
    ]);
    expect(f.lote?.diferencia).toBeNull();
    expect(f.lote?.sinDetalle).toBeNull();
    expect(f.registro).toBe(`Registró la liga: Diego Ramírez · ${fmtDateTime("2026-10-14T21:21:49.025963+00:00")}`);
    expect(f.href).toBe(
      `/admin/conciliacion?f=conciliados&cuenta=${CUENTA_EJE.id}&desde=2026-09-15&hasta=2026-09-15&mov=${ABONO_69183}&cobro=${C332}`,
    );
    // Desde #315: la misma línea marcada es la suya y la liga es anterior al corte.
    const r315 = respuesta315();
    const f315 = fichaAbonoEntrada(r315.abonos[0], r315);
    expect(f315.lote?.lineas.find((l) => l.esEste)?.principal).toBe("Vuelo #315 · Beh Kay");
    expect(f315.aporte).toBe("Este abono pagó 2 cobros; a este le tocan $68,205.55.");
    expect(f315.registro).toBe(TEXTO_LIGA_COBRO_ANTERIOR);
    expect(f315.href).toContain(`&cobro=${C315}`);
  });

  it("lote: los aditivos del 0.0.78 por línea (sufijo, «de $X») y la diferencia de centavos; sin detalle, el aviso", () => {
    const r = respuesta332();
    const abono = r.abonos[0];
    const cobros = abono.lote!.cobros!.map((c) =>
      c.cobro_id === C315 ? { ...c, cobro_estado: "CONCILIADO" as const, cobro_neto: 70000, cobro_abonos_n: 2, monto_parte: 68205.55 } : c,
    );
    const conAditivos = { ...abono, lote: { ...abono.lote!, cobros, cobros_diferencia: 0.01 } };
    const f = fichaAbonoEntrada(conAditivos, r);
    const l315 = f.lote!.lineas[0];
    expect(l315.secundaria).toBe(`cobro ${fmtDate("2026-09-15T17:00:00+00:00")} · $68,205.55 MXN de $70,000 MXN`);
    expect(l315.sufijo).toEqual({ texto: " · completa el cobro (2 abonos)", linea: "Completa el cobro (2 abonos)", tono: "neutro" });
    expect(f.lote!.diferencia).toBe("Diferencia con el abono: $0.01 (el banco depositó de más; ningún cobro se ajusta).");
    const menos = fichaAbonoEntrada({ ...abono, lote: { ...abono.lote!, cobros_diferencia: -0.01 } }, r);
    expect(menos.lote!.diferencia).toBe("Diferencia con el abono: $0.01 (el banco depositó de menos; ningún cobro se ajusta).");
    const sinDetalle = fichaAbonoEntrada({ ...abono, lote: { ...abono.lote!, cobros: null } }, r);
    expect(sinDetalle.lote!.sinDetalle).toBe(TEXTO_LOTE_ENTRADA_SIN_DETALLE);
    expect(sinDetalle.lote!.lineas).toEqual([]);
  });

  it("#358 (Paywise, centavo de redondeo): «cubre … de …» + la tolerancia; Paywise como pasarela; «Liga anterior…»", () => {
    const r = respuesta358();
    const f = fichaAbonoEntrada(r.abonos[0], r);
    expect(f.aporte).toBe("Este abono cubre $38,950.00 de $38,950.01. Falta $0.01, dentro de la tolerancia de $1.00 (redondeo).");
    expect(f.cuenta).toBe("Paywise · Paywise (MXN) · pasarela de pago");
    expect(f.registro).toBe(TEXTO_LIGA_COBRO_ANTERIOR);
    expect(f.pasarela).toBeNull();
    // Un sobrante dentro de la tolerancia se dice (liga vieja de centavos).
    const conSobrante = { ...r, cobertura: { ...r.cobertura!, faltante: 0, sobrante: 0.4 } };
    expect(fichaAbonoEntrada({ ...r.abonos[0], liga: { ...r.abonos[0].liga, monto_parte: 38950.41 } }, conSobrante).aporte).toBe(
      "Este abono cubre $38,950.41 de $38,950.01. El banco depositó $0.40 de más, dentro de la tolerancia de $1.00.",
    );
    // Con lo del reporte de la pasarela (hoy 0 filas), se dice lo que venga.
    expect(fichaAbonoEntrada({ ...r.abonos[0], monto_bruto: 41000.01, comision_pasarela: 2050 }, r).pasarela).toBe(
      "Según el reporte de la pasarela: bruto $41,000.01 · comisión $2,050.00 · depositado $38,950.00.",
    );
    expect(fichaAbonoEntrada({ ...r.abonos[0], comision_pasarela: 2050 }, r).pasarela).toBe(
      "Según el reporte de la pasarela: comisión $2,050.00 · depositado $38,950.00.",
    );
  });

  it("2 abonos sin lote, sobre, anticipo, ESPEJO y el cuadre del ingreso", () => {
    const dos = respuestaDosAbonos();
    expect(fichaAbonoEntrada(dos.abonos[0], dos).aporte).toBe("Este abono aporta $1,700.00 de $3,400.00.");
    expect(fichaAbonoEntrada(dos.abonos[1], dos).registro).toBe(
      `Registró la liga: Alejandro Canales · ${fmtDateTime("2026-10-13T16:51:24.805037+00:00")}`,
    );
    const sobre = respuestaSobre();
    const fs = fichaAbonoEntrada(sobre.abonos[0], sobre);
    expect(fs.aporte).toBe("Este abono pagó el sobre G-4 completo ($10,800.76); a este cobro le tocan $2,060.16.");
    expect(fs.registro).toBe("El sistema no guarda quién liga el abono de un sobre de grupo.");
    expect(fs.lote).toBeNull();
    const anticipo = respuestaAnticipo();
    const fa = fichaAbonoEntrada(anticipo.abonos[0], anticipo);
    expect(fa.aporte).toBe("Este abono pagó el anticipo ING-12 ($50,000.00); este cobro aplicó $20,000.00 de ese anticipo.");
    expect(fa.registro).toBe(`Registró la liga del anticipo: Alejandro Canales · ${fmtDateTime("2026-10-12T22:57:32.606618+00:00")}`);
    expect(fa.href).not.toContain("cobro=");
    const espejo = respuestaEspejo();
    expect(fichaAbonoEntrada(espejo.abonos[0], espejo).registro).toBeNull();
    const ing = respuestaIng3();
    const bruto = {
      ...ing.abonos[0],
      liga: { ...ing.abonos[0].liga, cuadre: { por: "BRUTO" as const, diferencia: 0.4, tolerancia: 1 } },
    };
    expect(fichaAbonoEntrada(bruto, ing).aporte).toBe(
      "Cuadra con el monto bruto del ingreso: el banco no descontó la comisión. Diferencia de $0.40 con el ingreso, dentro de la tolerancia de $1.00.",
    );
  });

  it("cruzada: las dos monedas y el T.C. SOLO con `tc_implicito` (jamás «el guardado en el cobro»)", () => {
    const r = respuesta223();
    const base = respuesta332().abonos[0];
    const abono = {
      ...base,
      monto: 14000,
      lote: null,
      liga: { ...base.liga, cruzada: true, monto_parte: 14000, moneda: "MXN", tc_implicito: 17.241379 },
    };
    const conTc = fichaAbonoEntrada(abono, { ...r, estado: "CONCILIADO", via: "DIRECTO", abonos: [abono] });
    expect(conTc.aporte).toBe(
      "Cobro de $812.00 USD pagado con este abono de $14,000.00 MXN (otra moneda: se concilia uno a uno) · T.C. implícito 17.241379",
    );
    const sinTc = fichaAbonoEntrada({ ...abono, liga: { ...abono.liga, tc_implicito: null } }, { ...r, abonos: [abono] });
    expect(sinTc.aporte).toBe("Cobro de $812.00 USD pagado con este abono de $14,000.00 MXN (otra moneda: se concilia uno a uno)");
    expect(`${conTc.aporte} ${sinTc.aporte}`).not.toMatch(/guardado/);
  });

  it("cada motivo de «no se sabe quién ligó» y cada motivo de «sin archivo»", () => {
    const r = respuestaIng3();
    const a = r.abonos[0];
    const conLiga = (sin_registro: "SIN_BITACORA" | "NO_LEIDO") =>
      fichaAbonoEntrada({ ...a, liga: { ...a.liga, registro: null, sin_registro } }, r).registro;
    expect(conLiga("SIN_BITACORA")).toBe("No quedó registro de quién hizo esta liga.");
    expect(conLiga("NO_LEIDO")).toBe("No se pudo leer quién hizo la liga (vuelve a abrir esta ventana).");
    expect(
      fichaAbonoEntrada({ ...a, liga: { ...a.liga, registro: { por: null, at: "2026-10-13T15:56:03.671262Z" } } }, r).registro,
    ).toBe(`Registró la liga: sin usuario · ${fmtDateTime("2026-10-13T15:56:03.671262Z")}`);
    const importado = fichaAbonoEntrada(
      { ...a, estado_cuenta: null, sin_archivo: "IMPORTADO_SIN_ARCHIVO", creado_at: "2026-07-17T00:34:09.441194+00:00" },
      r,
    );
    expect(importado.archivo).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo guardado: este abono se importó el ${fmtDate("2026-07-17T00:34:09.441194+00:00")} por Jimmy Chi sin el archivo original del banco.`,
    });
    const manual = fichaAbonoEntrada({ ...a, estado_cuenta: null, sin_archivo: "CAPTURA_MANUAL", origen: "MANUAL" }, r);
    expect(manual.archivo).toEqual({
      tipo: "SIN_ARCHIVO",
      texto: `Sin archivo: este abono se capturó a mano el ${fmtDate("2026-09-29T20:35:24.413103+00:00")} por Jimmy Chi; no viene de un estado de cuenta.`,
    });
    expect(fichaAbonoEntrada({ ...a, estado_cuenta: null, sin_archivo: null }, r).archivo).toEqual({
      tipo: "NO_LEIDO",
      texto: "Estado de cuenta archivado (no se pudo leer su detalle).",
    });
    expect(fichaAbonoEntrada({ ...a, notas_oficina: "Pago de Didi" }, r).notas).toBe("Notas del abono: Pago de Didi");
  });
});

describe("notas, contexto y alertas", () => {
  it("ESPEJO y baja; contexto del sobre y del anticipo con su enlace", () => {
    expect(notasEntrada(respuestaEspejo())).toEqual([NOTA_ESPEJO_ENTRADA]);
    expect(notasEntrada(respuesta332())).toEqual([]);
    const baja = respuestaIng3();
    baja.entrada = { ...baja.entrada, dado_de_baja: true };
    expect(notasEntrada(baja)).toEqual(["Este ingreso está dado de baja."]);
    expect(contextoEntrada(respuestaSobre())).toEqual({
      texto: "Este cobro es parte del sobre G-4 («Boda Pérez»): el banco concilia el sobre completo, no sus partes.",
      enlace: {
        etiqueta: "Abrir el grupo",
        href: "/admin/quotes/grupo/5d5d5d5d-0000-4000-8000-000000000001",
        titulo: "Abre el grupo en otra pestaña: el sobre se edita, re-parte o elimina desde Cobros del grupo",
      },
    });
    expect(contextoEntrada(respuestaAnticipo())).toEqual({
      texto:
        "Este cobro salió del anticipo ING-12: el banco concilia el anticipo, no el cobro; por eso en Ingresos este cobro se ve en gris y no se suma otra vez.",
      enlace: {
        etiqueta: "Abrir el anticipo ING-12",
        href: `/admin/ingresos?tab=anticipos&ingreso=${ANTICIPO_ID}`,
        titulo: "Abre el anticipo en Ingresos en otra pestaña",
      },
    });
    expect(hrefAnticipoEnIngresos(ANTICIPO_ID)).toBe(`/admin/ingresos?tab=anticipos&ingreso=${ANTICIPO_ID}`);
    expect(contextoEntrada(respuesta332())).toBeNull();
    expect(contextoEntrada(respuestaIng3())).toBeNull();
  });

  it("las 3 alertas (el sobrante con LA redacción del renglón «Banco», R13) y una desconocida", () => {
    const r = respuesta332();
    expect(textoAlertaConciliacionEntrada("CONCILIADO_SIN_ABONOS", r)).toBe(
      "Aparece como conciliado, pero no se pudo leer el abono del banco (lo acaban de cambiar). Cierra y vuelve a abrir esta ventana.",
    );
    const palma: ConciliacionDeEntrada = {
      ...r,
      entrada: { ...r.entrada, monto: 27526.5, neto: 27526.5 },
      cobertura: { ...r.cobertura!, neto: 27526.5, monto_vinculado: 55053, sobrante: 27526.5 },
    };
    expect(textoAlertaConciliacionEntrada("ABONO_CON_SOBRANTE", palma)).toBe(
      "El abono vinculado ($55,053 MXN) trae $27,526.50 MXN más que este cobro: ¿pagó también otro vuelo? Desvincúlalo en Conciliación y vuelve a vincularlo marcando los dos cobros.",
    );
    expect(textoAlertaConciliacionEntrada("LOTE_SIN_DETALLE", r)).toBe(TEXTO_LOTE_ENTRADA_SIN_DETALLE);
    expect(textoAlertaConciliacionEntrada("TC_NO_REGISTRADO", r)).toBe("Revisa este cobro en Conciliación.");
    expect(textoAlertaConciliacionEntrada("OTRA", respuestaIng3())).toBe("Revisa este ingreso en Conciliación.");
  });
});

describe("«¿Qué hacer?»", () => {
  it("#223 (USD, Morena Mia): las URLs EXACTAS de la spec, la suma del día, causas y la nota del pago en pesos", () => {
    const a = accionesPendienteEntrada(respuesta223(), HOY)!;
    expect(a.intro).toBe(INTRO_COBRO_SIN_CONCILIAR);
    expect(a.aviso).toBeNull();
    expect(a.enlaces.map((l) => [l.etiqueta, l.href])).toEqual([
      [BOTON_BUSCAR_ABONO, "/admin/conciliacion?f=pendientes&desde=2026-08-11&hasta=2026-10-10&mvq=812"],
      ["Buscar abonos con el nombre «Morena Mia»", "/admin/conciliacion?f=pendientes&desde=2026-08-11&hasta=2026-10-10&mvq=Morena+Mia"],
      [BOTON_VER_ABONOS_CONCILIADOS, "/admin/conciliacion?f=conciliados&desde=2026-09-03&hasta=2026-09-17&mvq=812"],
      ["Ver los omitidos de esas fechas", "/admin/conciliacion?f=omitidos&desde=2026-08-11&hasta=2026-10-10"],
    ]);
    expect(a.enlaces[0].titulo).toBe(
      "Abre en otra pestaña los movimientos pendientes de 30 días antes y después del 10 sep 2026, filtrados por $812.00 USD. Borra la búsqueda si el abono trae otro monto (varios cobros, comisión o un pago en partes).",
    );
    expect(a.enlaces[1].titulo).toBe(
      "Abre en otra pestaña los movimientos pendientes de 30 días antes y después del 10 sep 2026 cuya leyenda menciona «Morena Mia»: un solo abono puede pagar varios vuelos del mismo cliente. Si el depósito no trae el nombre, la lista sale vacía: usa la búsqueda por monto.",
    );
    expect(a.enlaces[2].titulo).toBe(
      "Abre en otra pestaña los abonos ya conciliados de 7 días antes y después del 10 sep 2026, filtrados por $812.00 USD: si el abono está ligado a OTRO cobro o ingreso, puede ser un cobro duplicado.",
    );
    expect(a.enlaces[3].titulo).toBe("Abre en otra pestaña los movimientos omitidos de la conciliación de esas fechas.");
    expect(textoDePiezas(a.mismoDia?.piezas)).toBe(
      "Ese día Morena Mia tiene 2 cobros más sin conciliar: Vuelo #198 · $783.00 USD, Vuelo #226 · $812.00 USD. Si los pagó juntos, el abono trae la suma de los netos: $2,407.00 USD.",
    );
    expect(a.mismoDia?.enlace).toMatchObject({
      etiqueta: "Buscar un abono por $2,407.00 USD (los 3 cobros del día)",
      href: "/admin/conciliacion?f=pendientes&desde=2026-08-11&hasta=2026-10-10&mvq=2407",
    });
    // Cada vuelo del día enlaza a su tarjeta de cobros (pestaña nueva en el componente).
    expect(a.mismoDia?.piezas.filter((p) => p.tipo === "enlace").map((p) => (p.tipo === "enlace" ? p.href : ""))).toEqual([
      "/admin/flights/3c8a63bf-ba67-45f9-a238-25525a80cce5#cobros",
      "/admin/flights/c4e4673e-b6ae-4fd0-b987-cc9eaf5ee2f7#cobros",
    ]);
    expect(a.causas).toEqual([
      "Que el estado de cuenta de esas fechas ya esté importado (abajo, qué fechas hay por cuenta).",
      "Que el cobro no se haya registrado DESPUÉS de importar el estado de cuenta de esas fechas: los cobros no se vuelven a intentar solos (prueba «Cruzar pendientes» en Conciliación).",
      "Que el cliente no haya pagado varios vuelos en un solo depósito: ese abono se vincula en Conciliación marcando todos los cobros que paga. Arriba están sus cobros de ese día y su suma.",
      "Que no haya pagado en varias transferencias: cada una se vincula a este mismo cobro.",
      "Que el banco no haya depositado otro monto (comisión o tipo de cambio).",
      "Que no haya otro cobro del mismo monto esos días: si la leyenda del banco no trae el nombre del cliente, el cruce automático no adivina y se vincula a mano.",
      "Que el abono no esté ligado a OTRO cobro o ingreso, ni clasificado (p. ej. como traspaso entre cuentas), por error: ábrelo con «Ver los abonos ya conciliados».",
      "Que el abono no se haya omitido de la conciliación por error (pestaña «Omitidos» de Conciliación).",
      "Que el dinero no haya entrado a otra cuenta, a la pasarela o en efectivo.",
    ]);
    expect(a.notas).toEqual([NOTA_COBRO_USD]);
    expect(NOTA_COBRO_USD).toContain("si te pagó en pesos");
    expect(a.cobertura).toEqual({ aviso: null, detalle: "Movimientos importados por cuenta: HSBC USD del 01 sep 2026 al 06 oct 2026." });
    expect(a.notaFinal).toBe("Si el estado de cuenta de ese periodo ya está importado, prueba «Cruzar pendientes» en Conciliación.");
  });

  it("#379 (Palma): «Ese día Palma tiene 1 cobro más…» y la búsqueda por $59,081.00 (`mvq=59081`)", () => {
    const b = textoMismoDiaCliente(respuesta379())!;
    expect(textoDePiezas(b.piezas)).toBe(
      "Ese día Palma tiene 1 cobro más sin conciliar: Vuelo #380 · $29,540.50. Si los pagó juntos, el abono trae la suma de los netos: $59,081.00.",
    );
    expect(b.enlace).toEqual({
      etiqueta: "Buscar un abono por $59,081.00 (los 2 cobros del día)",
      href: "/admin/conciliacion?f=pendientes&desde=2026-09-06&hasta=2026-11-05&mvq=59081",
      titulo:
        "Abre en otra pestaña los movimientos pendientes de 30 días antes y después del 06 oct 2026, filtrados por $59,081.00: un solo depósito puede pagar todos los vuelos del cliente de ese día. Si pagó solo algunos, borra la búsqueda y busca por el nombre o por cada monto.",
    });
  });

  it("#323 (ACP): 3 cobros más y $6,873.00 USD; con más de 5, las 5 primeras y «y N más»", () => {
    const b = textoMismoDiaCliente(respuesta323())!;
    expect(textoDePiezas(b.piezas)).toBe(
      "Ese día ACP tiene 3 cobros más sin conciliar: Vuelo #295 · $1,392.00 USD, Vuelo #296 · $1,392.00 USD, Vuelo #297 · $1,392.00 USD. Si los pagó juntos, el abono trae la suma de los netos: $6,873.00 USD.",
    );
    expect(b.enlace.etiqueta).toBe("Buscar un abono por $6,873.00 USD (los 4 cobros del día)");
    const r = respuesta323();
    const muchos = Array.from({ length: 8 }, (_, i) => ({ ...r.mismo_dia_cliente!.cobros[0], cobro_id: `c-${i}`, folio: 500 + i }));
    const conMuchos = textoMismoDiaCliente({ ...r, mismo_dia_cliente: { ...r.mismo_dia_cliente!, cobros: muchos, n: 12 } })!;
    const t = textoDePiezas(conMuchos.piezas);
    expect(t).toContain("tiene 12 cobros más sin conciliar: Vuelo #500");
    expect(t).toContain("Vuelo #504 · $1,392.00 USD y 7 más. Si los pagó juntos");
    expect(t).not.toContain("#505");
    expect(textoMismoDiaCliente({ ...r, mismo_dia_cliente: null })).toBeNull();
  });

  it("#383: «se registró después de importar» ARRIBA, con su enlace a la ventana exacta (y sin la causa repetida)", () => {
    const a = accionesPendienteEntrada(respuesta383(), HOY)!;
    expect(a.aviso).toEqual({
      texto: `Este cobro se registró el ${fmtDateTime("2026-10-08T18:43:29.809678+00:00")}, cuando ya estaban importados 4 abonos pendientes de esas fechas: el cruce automático solo corre al importar y no volvió a intentarlo. Pulsa «Cruzar pendientes» en Conciliación.`,
      enlace: {
        etiqueta: "Abrir Conciliación del 05 oct 2026 al 11 oct 2026",
        href: "/admin/conciliacion?f=pendientes&desde=2026-10-05&hasta=2026-10-11",
        titulo:
          "Abre Conciliación en otra pestaña con los movimientos pendientes del 05 oct 2026 al 11 oct 2026: pulsa «Cruzar pendientes» para que el sistema vuelva a intentar el cruce de esas fechas.",
      },
    });
    expect(a.causas.some((c) => c.includes("registrado DESPUÉS"))).toBe(false);
    expect(hrefConciliacionCruzarPendientes({ desde: "2026-10-05", hasta: "2026-10-11" })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-10-05&hasta=2026-10-11",
    );
    // Singular.
    const uno = avisoCruceNoCorrio({ ...respuesta383(), cruce_no_corrio: { abonos_previos: 1, desde: "2026-10-05", hasta: "2026-10-11" } })!;
    expect(uno.texto).toContain("cuando ya estaba importado 1 abono pendiente de esas fechas");
  });

  it("#349 («Transferencia» con cuenta «Paywise»): la nota del método, Paywise en la cobertura y la búsqueda sin cuenta", () => {
    const a = accionesPendienteEntrada(respuesta349(), HOY)!;
    expect(a.notas).toEqual([notaDestinoPasarela("Transferencia")]);
    expect(a.notas[0]).toBe(
      "La cuenta capturada es Paywise pero el método es «Transferencia»: los abonos de Paywise solo se cruzan solos con cobros «Link de pago (Paywise)». Si entró por Paywise, vincúlalo a mano en Conciliación (o corrige el método del cobro).",
    );
    expect(a.cobertura?.detalle).toBe(
      "Movimientos importados por cuenta: COMBUSTIBLE del 01 jul 2026 al 12 oct 2026 · EJE SCOTIA del 01 sep 2026 al 12 oct 2026 · GASTOS GNRAL del 01 jul 2026 al 12 oct 2026 · HSBC Pesos del 01 sep 2026 al 07 oct 2026 · Paywise del 01 sep 2026 al 30 sep 2026. Sin movimientos importados: afirme, American Express Ale, Tarjeta credito personal HSBC.",
    );
    expect(a.enlaces[0].href).toBe("/admin/conciliacion?f=pendientes&desde=2026-08-26&hasta=2026-10-25&mvq=10868");
    // Con comisión: «de un solo abono» ⇒ sin la causa de varias transferencias.
    expect(a.causas.some((c) => c.includes("varias transferencias"))).toBe(false);
  });

  it("#375 (HSBC_LINK con comisión): sin «varias transferencias»; la suma del día $31,435.90 busca por prefijo", () => {
    const a = accionesPendienteEntrada(respuesta375(), HOY)!;
    expect(a.causas.some((c) => c.includes("varias transferencias"))).toBe(false);
    expect(a.mismoDia?.enlace.etiqueta).toBe("Buscar un abono por $31,435.90 (los 2 cobros del día)");
    expect(a.mismoDia?.enlace.href).toBe("/admin/conciliacion?f=pendientes&desde=2026-09-02&hasta=2026-11-01&mvq=31435.9");
  });

  it("PAYWISE: la PASARELA única en la búsqueda, «Ir a Auditoría Paywise» y su nota", () => {
    const r: ConciliacionDeEntrada = { ...respuesta293(), estado: "SIN_CONCILIAR", via: null, abonos: [], ultimos_movimientos: ULTIMOS_PROD };
    const a = accionesPendienteEntrada(r, HOY)!;
    expect(a.enlaces[0].href).toBe(
      `/admin/conciliacion?f=pendientes&cuenta=${CUENTA_PAYWISE.id}&desde=2026-08-12&hasta=2026-10-11&mvq=11870.24`,
    );
    expect(a.enlaces.find((l) => l.etiqueta === "Ir a Auditoría Paywise")).toEqual({
      etiqueta: "Ir a Auditoría Paywise",
      href: "/admin/conciliacion?f=paywise",
      titulo: "Abre en otra pestaña la Auditoría Paywise: concilia lo que cuadra y corrige la comisión del cobro.",
    });
    expect(a.notas).toEqual([NOTA_COBRO_PAYWISE]);
    expect(a.cobertura?.detalle).toBe("Movimientos importados por cuenta: Paywise del 01 sep 2026 al 30 sep 2026.");
  });

  it("PARCIAL: «Buscar el abono que falta» = la liga de la tarjeta (R12), el nombre y los ya conciliados; sin causas", () => {
    const a = accionesPendienteEntrada(respuestaParcial(), HOY)!;
    expect(a.intro).toBe(INTRO_PARCIAL_ENTRADA);
    expect(a.causas).toEqual([]);
    expect(a.enlaces[0]).toEqual({
      etiqueta: BOTON_BUSCAR_ABONO_QUE_FALTA,
      href: hrefBuscarAbonoQueFalta({ fecha_cobro: "2026-09-15T17:00:00+00:00", faltante: 1700 }),
      titulo:
        "Abre en otra pestaña los movimientos pendientes de 7 días antes a 30 días después del 15 sep 2026, filtrados por $1,700.00, lo que falta.",
    });
    expect(a.enlaces[0].href).toBe("/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700");
    expect(a.enlaces[1].href).toBe("/admin/conciliacion?f=pendientes&desde=2026-08-16&hasta=2026-10-15&mvq=Beh+Kay");
    expect(a.enlaces[2].href).toBe("/admin/conciliacion?f=conciliados&desde=2026-09-08&hasta=2026-09-22&mvq=1700");
  });

  it("cobro de un anticipo sin conciliar y parte de un sobre sin ligar: se concilian en el anticipo / el sobre", () => {
    const an = accionesPendienteEntrada(respuestaAnticipoSinConciliar(), HOY)!;
    expect(an.intro).toBe(
      "Este cobro salió del anticipo ING-12: su dinero se concilia UNA sola vez, en el anticipo. Vincula el abono al anticipo (no al cobro) en «Por conciliar».",
    );
    expect(an.enlaces.map((l) => [l.etiqueta, l.href])).toEqual([
      [
        "Conciliar el anticipo ING-12 en «Por conciliar»",
        `/admin/ingresos?tab=por-conciliar&desde=2026-08-25&hasta=2026-10-01&cuenta=${CUENTA_EJE.id}`,
      ],
      ["Abrir el anticipo ING-12", `/admin/ingresos?tab=anticipos&ingreso=${ANTICIPO_ID}`],
    ]);
    expect(an.cobertura?.detalle).toBe("Movimientos importados por cuenta: EJE SCOTIA del 01 sep 2026 al 12 oct 2026.");
    const so = accionesPendienteEntrada(respuestaSobreSinConciliar(), HOY)!;
    expect(so.intro).toBe(
      "Este cobro es parte del sobre G-4 («Boda Pérez»): su dinero se concilia UNA sola vez, en el sobre del grupo. Vincula el abono al SOBRE (no a esta parte) en Conciliación.",
    );
    expect(so.enlaces.map((l) => [l.etiqueta, l.href])).toEqual([
      ["Buscar el abono del sobre en Conciliación", "/admin/conciliacion?f=pendientes&desde=2026-08-16&hasta=2026-10-15&mvq=10800.76"],
      ["Abrir el grupo", "/admin/quotes/grupo/5d5d5d5d-0000-4000-8000-000000000001"],
    ]);
  });

  it("ingreso SIN_CONCILIAR: «Conciliarlo en «Por conciliar»» (la URL del detalle), ya conciliados con su cuenta; baja ⇒ nada", () => {
    const r: ConciliacionDeEntrada = { ...respuestaIng3(), estado: "SIN_CONCILIAR", via: null, abonos: [], ultimos_movimientos: ULTIMOS_PROD };
    const a = accionesPendienteEntrada(r, HOY)!;
    expect(a.intro).toBe(
      "El cruce automático corre al importar el estado de cuenta de COMBUSTIBLE y al registrar el ingreso: liga un abono de esa cuenta que trae el neto o el bruto del ingreso (hasta $1.00 de diferencia), con hasta 3 días de diferencia (pasarela: 5), cuando ningún cobro de vuelo cuadra igual. Si no se cruzó, revisa:",
    );
    expect(a.enlaces.map((l) => [l.etiqueta, l.href, l.titulo])).toEqual([
      [
        "Conciliarlo en «Por conciliar»",
        `/admin/ingresos?tab=por-conciliar&desde=2026-09-03&hasta=2026-10-10&cuenta=${CUENTA_COMBUSTIBLE.id}`,
        "Abre en otra pestaña los abonos por identificar de COMBUSTIBLE de 7 días antes a 30 días después del 10 sep 2026.",
      ],
      [
        BOTON_VER_ABONOS_CONCILIADOS,
        `/admin/conciliacion?f=conciliados&cuenta=${CUENTA_COMBUSTIBLE.id}&desde=2026-09-03&hasta=2026-09-17&mvq=78`,
        "Abre en otra pestaña los abonos ya conciliados de 7 días antes y después del 10 sep 2026, filtrados por $78.00: si el abono está ligado a OTRO cobro o ingreso, puede ser un cobro duplicado.",
      ],
    ]);
    expect(a.causas).toContain(
      "Que el abono no esté ligado a OTRO cobro o ingreso, ni clasificado (p. ej. como traspaso entre cuentas), por error: ábrelo con «Ver los abonos ya conciliados».",
    );
    expect(a.cobertura?.detalle).toBe("Movimientos importados por cuenta: COMBUSTIBLE del 01 jul 2026 al 12 oct 2026.");
    expect(accionesPendienteEntrada({ ...r, entrada: { ...r.entrada, dado_de_baja: true } }, HOY)).toBeNull();
    // «Por conciliar» no pasa de hoy.
    expect(accionesPendienteEntrada(r, "2026-09-20")!.enlaces[0].href).toContain("hasta=2026-09-20");
  });

  it("conciliado (o sin conciliar) con abonos: nada; conciliado SIN abonos: buscar entre los ya conciliados", () => {
    expect(accionesPendienteEntrada(respuesta332(), HOY)).toBeNull();
    expect(accionesPendienteEntrada(respuestaDosAbonos(), HOY)).toBeNull();
    const sinAbonos = accionesPendienteEntrada({ ...respuesta332(), abonos: [] }, HOY)!;
    expect(sinAbonos.enlaces.map((l) => l.href)).toEqual([
      "/admin/conciliacion?f=conciliados&desde=2026-09-08&hasta=2026-09-22&mvq=977.45",
    ]);
    // Vía anticipo: el abono es el del anticipo (su día, monto y cuenta) + «Abrir el anticipo».
    expect(accionesPendienteEntrada({ ...respuestaAnticipo(), abonos: [] }, HOY)!.enlaces.map((l) => [l.etiqueta, l.href])).toEqual([
      [BOTON_VER_ABONOS_CONCILIADOS, `/admin/conciliacion?f=conciliados&cuenta=${CUENTA_EJE.id}&desde=2026-08-25&hasta=2026-09-08&mvq=50000`],
      ["Abrir el anticipo ING-12", `/admin/ingresos?tab=anticipos&ingreso=${ANTICIPO_ID}`],
    ]);
  });
});

describe("¿qué hay importado por cuenta? (cobertura)", () => {
  const conDia = (r: ConciliacionDeEntrada, dia: string): ConciliacionDeEntrada => ({ ...r, entrada: { ...r.entrada, dia } });

  it("los 5 avisos, el primero que aplica, con fechas reales", () => {
    // #163 (USD, 19-ago): anterior a TODO lo importado en dólares.
    expect(textoCoberturaEntrada(respuesta163())?.aviso).toBe(
      "Ningún estado de cuenta importado de estas cuentas llega tan atrás: el más antiguo empieza el 01 sep 2026 (HSBC USD) y este cobro es del 19 ago 2026. Importa el estado de cuenta de esas fechas en Conciliación: el cobro se cruza solo si el monto y la fecha coinciden.",
    );
    // Un cobro en pesos del 15-jul: anterior a ALGUNAS cuentas.
    const pesos = conDia(respuesta379(), "2026-07-15");
    expect(textoCoberturaEntrada(pesos)).toEqual({
      aviso:
        "Del 15 jul 2026 no hay estado de cuenta importado en EJE SCOTIA (desde el 01 sep 2026) y HSBC Pesos (desde el 01 sep 2026): si el cliente depositó ahí, importa ese periodo en Conciliación.",
      detalle:
        "Movimientos importados por cuenta: COMBUSTIBLE del 01 jul 2026 al 12 oct 2026 · EJE SCOTIA del 01 sep 2026 al 12 oct 2026 · GASTOS GNRAL del 01 jul 2026 al 12 oct 2026 · HSBC Pesos del 01 sep 2026 al 07 oct 2026. Sin movimientos importados: afirme, American Express Ale, Tarjeta credito personal HSBC.",
    });
    // Posterior a lo importado (empate en el 12-oct: la primera por alias, como en Gastos).
    expect(textoCoberturaEntrada(conDia(respuesta379(), "2026-10-13"))?.aviso).toBe(
      "Ningún estado de cuenta importado llega todavía al 13 oct 2026 (el más reciente es COMBUSTIBLE, hasta el 12 oct 2026). Impórtalo en Conciliación: el cobro se cruza solo si el monto y la fecha coinciden.",
    );
    // Dentro del margen del cruce (3 días; Paywise 5).
    expect(textoCoberturaEntrada(conDia(respuesta379(), "2026-10-10"))?.aviso).toBe(
      "El estado de cuenta importado más reciente llega al 12 oct 2026: si el banco registró el abono unos días después del cobro, todavía no está importado.",
    );
    expect(textoCoberturaEntrada(conDia(respuesta379(), "2026-10-09"))?.aviso).toBeNull();
    const paywise: ConciliacionDeEntrada = { ...respuesta293(), estado: "SIN_CONCILIAR", abonos: [], ultimos_movimientos: ULTIMOS_PROD };
    expect(textoCoberturaEntrada(conDia(paywise, "2026-09-26"))?.aviso).toContain("llega al 30 sep 2026");
    expect(textoCoberturaEntrada(conDia(paywise, "2026-09-25"))?.aviso).toBeNull();
    expect([MARGEN_CRUCE_ABONO_DIAS, MARGEN_CRUCE_PAYWISE_DIAS]).toEqual([3, 5]);
    // Ninguna cuenta con movimientos.
    const vacias = respuesta379();
    vacias.ultimos_movimientos = ULTIMOS_PROD.map((u) => ({ ...u, primera_fecha: null, ultima_fecha: null }));
    expect(textoCoberturaEntrada(vacias)).toEqual({
      aviso: "Todavía no hay estados de cuenta importados en las cuentas de este tipo de pago.",
      detalle: null,
    });
  });

  it("sin `primera_fecha` (un API que no la manda): el formato de Gastos; sin `ultimos_movimientos`: nada", () => {
    const r = respuesta223();
    r.ultimos_movimientos = ULTIMOS_PROD.map(({ cuenta, ultima_fecha }) => ({ cuenta, ultima_fecha }));
    expect(textoCoberturaEntrada(r)).toEqual({
      aviso: null,
      detalle: "Último movimiento importado por cuenta: HSBC USD 06 oct 2026",
    });
    expect(textoCoberturaEntrada({ ...respuesta223(), ultimos_movimientos: null })).toBeNull();
  });
});

describe("filas, botón y nombre accesible", () => {
  const entrada = (over: Partial<EntradaDinero> = {}): EntradaDinero => ({
    origen: "COBRO_VUELO",
    id: C332,
    dia: "2026-09-15",
    etiqueta: "Vuelo #332",
    categoria: "COBRO_VUELO",
    categoria_etiqueta: "Cobro de vuelo",
    cliente_nombre: "Beh Kay ",
    concepto: null,
    monto: 977.45,
    comision: null,
    neto: 977.45,
    moneda: "MXN",
    metodo: "TRANSFERENCIA",
    metodo_etiqueta: "Transferencia",
    vuelo_id: "6f1825e3-0c54-45f1-bb66-d8f27a71fb7e",
    vuelo_folio: 332,
    grupo_folio: null,
    vuelo_estado: "COMPLETADO",
    por_volar: false,
    anticipo_etiqueta: null,
    cuenta_en_total: true,
    es_reembolso: false,
    conciliacion: { estado: "CONCILIADO", movimiento_id: ABONO_69183 },
    registrado_por_nombre: "Itzi",
    ...over,
  });

  it("la fila de la lista: SIN_CONCILIAR + `parcial` ⇒ PARCIAL (así no salta «el estado cambió»)", () => {
    expect(filaBancoDeEntrada(entrada())).toMatchObject({ origen: "COBRO_VUELO", estado: "CONCILIADO", movimiento_id: ABONO_69183, cuenta_id: null });
    const parcial = filaBancoDeEntrada(
      entrada({
        conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: ABONO_1700_A, parcial: { monto_vinculado: 1700, faltante: 1700, abonos_n: 1 } },
      }),
    );
    expect(parcial).toMatchObject({ estado: "PARCIAL", faltante: 1700 });
    expect(estadoCambioEntrada(respuestaParcial(), parcial)).toBe(false);
    expect(estadoCambioEntrada(respuestaParcial(), { estado: "SIN_CONCILIAR" })).toBe(true);
    expect(estadoCambioEntrada(respuestaParcial(), { estado: null })).toBe(false);
    expect(filaBancoDeEntrada(entrada({ conciliacion: { estado: "OTRO" as never, movimiento_id: null } })).estado).toBeNull();
  });

  it("la fila de un ingreso (cuenta, baja) y la de un cobro de la tarjeta (día Cancún, folio, vía anticipo con un API previo)", () => {
    const ingreso = {
      id: "ffb57607-77e4-4334-8ee9-94afdba75f91",
      folio: 3,
      etiqueta: "ING-3",
      categoria_etiqueta: "Otros ingresos",
      fecha: "2026-09-10",
      monto: 78,
      moneda: "MXN",
      cliente_nombre: null,
      pagador: "didi",
      metodo_etiqueta: "Transferencia",
      cuenta_bancaria_id: CUENTA_COMBUSTIBLE.id,
      conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
      baja: { at: "2026-10-01T12:00:00Z", por_nombre: "Itzi", motivo: "duplicado" },
    } as unknown as Ingreso;
    expect(filaBancoDeIngreso(ingreso)).toMatchObject({
      origen: "INGRESO",
      cliente: "didi",
      cuenta_id: CUENTA_COMBUSTIBLE.id,
      estado: "SIN_CONCILIAR",
      baja: true,
    });
    const cobro = {
      id: C332,
      monto: "977.45",
      moneda: "MXN",
      metodo_cobro: "TRANSFERENCIA",
      fecha_cobro: "2026-09-16T03:00:00+00:00",
      conciliado: true,
      conciliado_via: "ANTICIPO",
      movimiento_bancario_id: ABONO_69183,
    } as unknown as FlightCobro;
    expect(filaBancoDeCobroVuelo(cobro, { folio: 332, cliente: "Beh Kay " })).toMatchObject({
      etiqueta: "Vuelo #332",
      dia: "2026-09-15",
      cliente: "Beh Kay",
      estado: "VIA_ANTICIPO",
      movimiento_id: ABONO_69183,
    });
    expect(estadoFilaDeCobroVuelo({ conciliacion_estado: "CONCILIADO", conciliado: true, conciliado_via: "ANTICIPO" })).toBe("CONCILIADO");
    expect(estadoFilaDeCobroVuelo({ conciliacion_estado: "NO_BANCARIO", conciliado: false })).toBe("NO_BANCARIO");
    expect(estadoFilaDeCobroVuelo({ conciliado: false })).toBeNull();
  });

  it("revisión 15-oct-2026: la llave del modo controlado cambia al editar la cuenta, la fecha o el monto (y al desvincular)", () => {
    const ingreso = {
      id: "ffb57607-77e4-4334-8ee9-94afdba75f91",
      folio: 5,
      etiqueta: "ING-5",
      categoria_etiqueta: "Otros ingresos",
      fecha: "2026-09-10",
      monto: 78,
      moneda: "MXN",
      cliente_nombre: null,
      pagador: "didi",
      metodo_etiqueta: "Transferencia",
      cuenta_bancaria_id: CUENTA_COMBUSTIBLE.id,
      conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
      baja: null,
    } as unknown as Ingreso;
    const clave = (over: Partial<Ingreso>) => claveEntradaControlada(filaBancoDeIngreso({ ...ingreso, ...over } as Ingreso));
    const base = clave({});
    expect(base.startsWith(`INGRESO:${ingreso.id}:`)).toBe(true);
    // Editar desde el MISMO detalle (sin conciliar): la cuenta, la fecha o el monto ⇒ otra llave ⇒ el cuerpo se vuelve a pedir.
    // Otra cuenta (la causa «Que el dinero no haya entrado a otra cuenta (corrige la cuenta del ingreso)»).
    expect(clave({ cuenta_bancaria_id: "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f" })).not.toBe(base);
    expect(clave({ fecha: "2026-09-12" })).not.toBe(base);
    expect(clave({ monto: 80 })).not.toBe(base);
    // Ligar / desvincular el abono o cambiar el estado: también.
    expect(
      clave({ conciliacion: { estado: "CONCILIADO", movimiento_id: ABONO_69183, movimiento_fecha: null, movimiento_monto: null } } as never),
    ).not.toBe(base);
    // La misma fila (un refresh sin cambios) ⇒ la misma llave: no se vuelve a pedir.
    expect(clave({})).toBe(base);
  });

  it("revisión 2 (15-oct-2026): editar SOLO la comisión cambia la llave (el cuerpo pinta la comisión y busca el abono por el neto)", () => {
    const ingreso = {
      id: "0b6f3d0e-2c11-4a7e-9a55-3f1f2d1c9e01",
      folio: 9,
      etiqueta: "ING-9",
      categoria_etiqueta: "Otros ingresos",
      fecha: "2026-10-02",
      monto: 10000,
      comision_monto: 350,
      neto: 9650,
      moneda: "MXN",
      cliente_nombre: null,
      pagador: "HSBC link",
      metodo_etiqueta: "Transferencia",
      cuenta_bancaria_id: CUENTA_COMBUSTIBLE.id,
      conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null, movimiento_fecha: null, movimiento_monto: null },
      baja: null,
    } as unknown as Ingreso;
    const clave = (over: Partial<Ingreso>) => claveEntradaControlada(filaBancoDeIngreso({ ...ingreso, ...over } as Ingreso));
    const base = clave({});
    expect(filaBancoDeIngreso(ingreso).neto).toBe(9650);
    // Comisión a 0: mismo monto, cuenta, día, moneda y estado; solo el neto del API cambia.
    expect(clave({ comision_monto: null, neto: 10000 })).not.toBe(base);
    // Agregar comisión a un ingreso que no tenía.
    expect(clave({ comision_monto: 500, neto: 9500 })).not.toBe(base);
    expect(clave({})).toBe(base);
    // El neto viene del API (el de la tarjeta, `neto_banco`); sin él (API previo) ⇒ null, sin inventarlo.
    const cobro = { id: C332, monto: "977.45", moneda: "MXN", fecha_cobro: "2026-09-16T03:00:00+00:00", conciliado: false } as unknown as FlightCobro;
    expect(filaBancoDeCobroVuelo(cobro).neto).toBeNull();
    expect(filaBancoDeCobroVuelo({ ...cobro, neto_banco: 950 } as FlightCobro).neto).toBe(950);
  });

  it("qué badge es botón: nunca «No se concilia uno a uno», «—» ni un ingreso dado de baja", () => {
    for (const e of ["CONCILIADO", "VIA_ANTICIPO", "PARCIAL", "SIN_CONCILIAR"]) expect(abreDetalleEntrada(e), e).toBe(true);
    for (const e of ["NO_BANCARIO", null, undefined, "—"]) expect(abreDetalleEntrada(e), String(e)).toBe(false);
    expect(abreDetalleEntrada("SIN_CONCILIAR", { baja: true })).toBe(false);
  });

  it("el nombre accesible EMPIEZA con el texto visible (WCAG 2.5.3)", () => {
    const f = filaBancoDeEntrada(entrada());
    expect(nombreAccesibleEntrada("Conciliado", f)).toBe(
      "Conciliado: ver la conciliación con el banco del cobro del vuelo #332 de $977.45 del 15 sep 2026",
    );
    expect(
      nombreAccesibleEntrada("Conciliado", { origen: "INGRESO", etiqueta: "ING-3", monto: 78, moneda: "MXN", dia: "2026-09-10" }),
    ).toBe("Conciliado: ver la conciliación con el banco del ingreso ING-3 de $78.00 del 10 sep 2026");
    expect(
      nombreAccesibleEntrada("Sin conciliar", { origen: "COBRO_VUELO", etiqueta: "Vuelo #223", monto: 812, moneda: "USD", dia: "2026-09-10" }),
    ).toBe("Sin conciliar: ver la conciliación con el banco del cobro del vuelo #223 de $812.00 USD del 10 sep 2026");
    // La tarjeta (sin folio): «… del cobro de $977.45 del 15 sep 2026».
    expect(nombreAccesibleEntrada("Conciliado", { ...f, etiqueta: "" })).toBe(
      "Conciliado: ver la conciliación con el banco del cobro de $977.45 del 15 sep 2026",
    );
  });

  it("buscar desde la FILA (error o API previo): un parcial busca lo que falta; lo demás, el monto", () => {
    expect(hrefBuscarDesdeFila({ dia: "2026-09-15", monto: 3400, estado: "PARCIAL", faltante: 1700 })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-09-08&hasta=2026-10-15&mvq=1700",
    );
    expect(hrefBuscarDesdeFila({ dia: "2026-09-10", monto: 812, estado: "SIN_CONCILIAR", faltante: null })).toBe(
      "/admin/conciliacion?f=pendientes&desde=2026-08-11&hasta=2026-10-10&mvq=812",
    );
    expect(hrefBuscarAbonoEnConciliacion({ dia: null, monto: null })).toBe("/admin/conciliacion?f=pendientes");
    expect(nombreParaBuscar("  Jo ")).toBeNull();
    expect(nombreParaBuscar(" Ana ")).toBe("Ana");
  });
});

describe("errores al cargar", () => {
  it("por código y status (API previo, inválida, rol, no existe, ingresos sin migración, sesión, red)", () => {
    expect(mensajeErrorDetalleEntrada({ code: "RUTA_NO_DISPONIBLE", status: 404 }, "COBRO_VUELO")).toEqual({
      texto: MSG_DETALLE_BANCO_API_VIEJO,
      reintentable: false,
      buscarEnConciliacion: true,
    });
    expect(
      mensajeErrorDetalleEntrada({ status: 404, error: `Cannot GET /v1/conciliacion/cobros/${C332}` }, "COBRO_VUELO").buscarEnConciliacion,
    ).toBe(true);
    expect(MSG_DETALLE_BANCO_API_VIEJO).toBe(
      "El servidor todavía no tiene este detalle (falta actualizar el API). Mientras, búscalo en Conciliación.",
    );
    expect(mensajeErrorDetalleEntrada({ code: "ENTRADA_INVALIDA", status: 400 }, "INGRESO").texto).toBe(MSG_ENTRADA_INVALIDA);
    expect(MSG_ENTRADA_INVALIDA).toBe("Cobro o ingreso inválido.");
    expect(mensajeErrorDetalleEntrada({ status: 403 }, "COBRO_VUELO").texto).toBe(MSG_DETALLE_BANCO_SIN_PERMISO);
    expect(mensajeErrorDetalleEntrada({ status: 404, code: "COBRO_NO_EXISTE" }, "COBRO_VUELO").texto).toBe(MSG_COBRO_YA_NO_EXISTE);
    expect(mensajeErrorDetalleEntrada({ status: 404, code: "INGRESO_NO_EXISTE" }, "INGRESO").texto).toBe(MSG_INGRESO_YA_NO_EXISTE);
    expect(mensajeErrorDetalleEntrada({ status: 404 }, "INGRESO").texto).toBe("Ese ingreso ya no existe: recarga la página.");
    expect(mensajeErrorDetalleEntrada({ status: 404 }, "COBRO_VUELO").texto).toBe("Ese cobro ya no existe: recarga la página.");
    const msg503 =
      "Los ingresos todavía no están habilitados en la base de datos (falta aplicar una actualización). Vuelve a intentarlo en unos minutos; si sigue igual, avisa a soporte.";
    expect(mensajeErrorDetalleEntrada({ status: 503, code: "INGRESOS_NO_DISPONIBLE", error: msg503 }, "INGRESO")).toEqual({
      texto: msg503,
      reintentable: true,
      buscarEnConciliacion: false,
    });
    expect(mensajeErrorDetalleEntrada({ status: 401 }, "COBRO_VUELO").texto).toBe(MSG_SESION_EXPIRO);
    expect(mensajeErrorDetalleEntrada({ code: "SIN_CONEXION" }, "COBRO_VUELO")).toEqual({
      texto: MSG_DETALLE_BANCO_FALLO,
      reintentable: true,
      buscarEnConciliacion: false,
    });
    expect(mensajeErrorDetalleEntrada({ status: 500 }, "INGRESO").reintentable).toBe(true);
  });
});

describe("guarda: el panel no calcula dinero del banco", () => {
  it("entrada-banco.ts no suma (`.reduce(`, `+ Number(`) ni redacta el sobrante por su cuenta", () => {
    const src = readFileSync(path.resolve(__dirname, "../entrada-banco.ts"), "utf8");
    expect(src).not.toContain(".reduce(");
    expect(src).not.toContain("+ Number(");
    expect(src).not.toContain("trae $");
    // La pestaña «Omitidos» se lee de la constante de Conciliación (no la homónima de Ingresos).
    expect(src).toContain('import { FILTROS_CONCILIACION, hrefConciliacion } from "@/lib/admin/conciliacion-vista";');
  });
});
