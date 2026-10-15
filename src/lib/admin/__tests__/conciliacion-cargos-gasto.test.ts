/**
 * «Vincular a un gasto…» con VARIOS cargos (14-oct-2026, API 0.0.77,
 * invariante 76): la lista antes de la red (2..50 uuid sin repetir, textos
 * del DTO), el encabezado con la SUMA DEL API, los renglones de los cargos,
 * los avisos ámbar (cargos con su propio gasto, cuentas distintas), la guía
 * CUBRE/PARCIAL/EXCEDE (solo pinta lo del API), el resumen que confirma, el
 * toast, cada error (incierto, no activa, 4xx con «Quitar…») y los gastos del
 * mismo monto que no entraron en palabras de «varios cargos». Con la paridad
 * contra el API (si el repo hermano está al lado).
 *
 * Casos reales (prod, 14-oct): C = 402ee224 $120.00 + a78ae15d $280.00 ⇒
 * gasto dd5fcb2b «Comida» $400.00 TARJETA_CORP; Cozumel (falso positivo)
 * 62.91 × 2 = 125.82; HSBC USD 01-oct 17.00 + 2.72 = 19.72 USD.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTON_AMPLIAR_120,
  DESCRIPCION_VINCULAR_CARGOS,
  MSG_CARGO_INVALIDO,
  MSG_LOTE_CARGOS_INVALIDO,
  NOTA_CANDIDATO_PROPIO_NO_VERIFICADO,
  TEXTO_CANDIDATOS_NO_CARGARON,
  TEXTO_ELIGE_GASTO,
  TEXTO_INCIERTO_VINCULAR,
  TEXTO_NO_SE_VINCULO,
  TEXTO_RECHAZO_VINCULAR,
  TEXTO_UN_SOLO_CARGO,
  avisoCargosConCandidatoPropio,
  avisoVariasCuentas,
  botonQuitarNoPendientes,
  botonVincularCargos,
  descripcionCandidatoSuma,
  encabezadoCargos,
  errorListaCargosGasto,
  esCargosNoActivo,
  estadoListaSuma,
  etiquetaGastoResumen,
  guiaResultado,
  hayCandidatoQueCubre,
  lineaCargoVincular,
  marcaCandidatoPropio,
  mensajeErrorCandidatosSuma,
  mensajeErrorCargosGasto,
  notaVentanaSuma,
  placeholderBuscarSuma,
  textoCargosSinSuma,
  textoFechasCargos,
  textoResumenVincularCargos,
  textoVentanaSuma,
  toastCargosVinculados,
  tituloVincularCargos,
} from "../conciliacion-cargos-gasto";
import { textoExcluidosCandidatos } from "../conciliacion-lote";
import type {
  CandidatoGastoPorSuma,
  CargosResumen,
  ExcluidosCandidatos,
  LigarCargosGastoRespuesta,
} from "@/types/conciliacion";

const A = "402ee224-0000-4000-8000-000000000001";
const B = "a78ae15d-0000-4000-8000-000000000002";
const GASTOS = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const EJE = "3e3e3e3e-0000-4000-8000-0000000000e1";
const HSBC_USD = "5b0c2a10-1111-4c4c-9d9d-0123456789ab";
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

/** El gasto del caso C, como lo manda el API (ficha de siempre + la cuenta de la suma). */
const comida = (extra: Partial<CandidatoGastoPorSuma> = {}): CandidatoGastoPorSuma => ({
  id: "dd5fcb2b-0000-4000-8000-000000000400",
  fecha: "2026-08-03",
  monto: 400,
  moneda: "MXN",
  proveedor: null,
  categoria: "COMIDA",
  medio_pago: "TARJETA_CORP",
  tarjeta_terminacion: "4929",
  vuelo_folio: 104,
  matricula: "N621TX",
  nota: "[CARGA-EXCEL-AGO28] Viáticos",
  capturado_por: "Itzi",
  monto_vinculado: 0,
  faltante: 400,
  no_bancario: false,
  resultado: "CUBRE",
  faltante_tras: 0,
  excedente: 0,
  ...extra,
});

const resumenC = (extra: Partial<CargosResumen> = {}): CargosResumen => ({
  ids: [A, B],
  n: 2,
  suma: 400,
  moneda: "MXN",
  fecha_min: "2026-08-03",
  fecha_max: "2026-08-03",
  cuentas: [{ id: GASTOS, alias: "GASTOS GNRAL" }],
  terminacion_comun: null,
  ...extra,
});

describe("la lista antes de la red (espejo del DTO del API)", () => {
  it("2..50 uuid sin repetir; con uno, vacía o con más de 50, el texto del DTO", () => {
    for (const ids of [undefined, null, "x", [], [A], Array.from({ length: 51 }, (_, i) => uuid(i))]) {
      expect(errorListaCargosGasto(ids)).toBe(MSG_LOTE_CARGOS_INVALIDO);
    }
    expect(MSG_LOTE_CARGOS_INVALIDO).toBe("Elige de 2 a 50 cargos sin repetir (con uno, usa «Vincular gasto» del menú ⋯).");
    expect(errorListaCargosGasto([A, "nada"])).toBe("Algún cargo de la selección no es válido: recarga la página.");
    expect(errorListaCargosGasto([A, A.toUpperCase()])).toBe(MSG_LOTE_CARGOS_INVALIDO);
    expect(errorListaCargosGasto([A, B])).toBeNull();
    expect(errorListaCargosGasto(Array.from({ length: 50 }, (_, i) => uuid(i)))).toBeNull();
  });
});

describe("encabezado y cargos (la suma es la del API)", () => {
  it("título, descripción y, sin la respuesta del API, solo el conteo", () => {
    expect(tituloVincularCargos(2)).toBe("Vincular 2 cargos a un gasto");
    expect(DESCRIPCION_VINCULAR_CARGOS).toBe("Los cargos se suman y pagan UN gasto (una factura cobrada en varios cargos).");
    expect(textoCargosSinSuma(3)).toBe("3 cargos seleccionados");
  });

  it("fechas: el mismo día, días, meses y años distintos (días de pared)", () => {
    expect(textoFechasCargos("2026-08-03", "2026-08-03")).toBe("03 ago 2026");
    expect(textoFechasCargos("2026-08-10", "2026-08-12")).toBe("del 10 al 12 ago 2026");
    expect(textoFechasCargos("2026-09-30", "2026-10-01")).toBe("del 30 sep al 01 oct 2026");
    expect(textoFechasCargos("2025-12-30", "2026-01-02")).toBe("del 30 dic 2025 al 02 ene 2026");
    expect(textoFechasCargos(null, "2026-10-01")).toBe("01 oct 2026");
    expect(textoFechasCargos(null, undefined)).toBe("");
  });

  it("«2 cargos de GASTOS GNRAL · suman $400.00 MXN · 03 ago 2026» (alias del API o de la página; varias cuentas; USD)", () => {
    expect(encabezadoCargos(resumenC())).toBe("2 cargos de GASTOS GNRAL · suman $400.00 MXN · 03 ago 2026");
    expect(encabezadoCargos(resumenC({ cuentas: [{ id: GASTOS, alias: null }] }), { [GASTOS]: "GASTOS GNRAL" })).toBe(
      "2 cargos de GASTOS GNRAL · suman $400.00 MXN · 03 ago 2026",
    );
    expect(encabezadoCargos(resumenC({ cuentas: [{ id: GASTOS, alias: null }] }))).toBe(
      "2 cargos · suman $400.00 MXN · 03 ago 2026",
    );
    expect(
      encabezadoCargos(
        resumenC({
          suma: 9591.49,
          fecha_min: "2026-08-10",
          fecha_max: "2026-08-12",
          cuentas: [
            { id: GASTOS, alias: "GASTOS GNRAL" },
            { id: EJE, alias: "EJE SCOTIA" },
          ],
        }),
      ),
    ).toBe("2 cargos de 2 cuentas · suman $9,591.49 MXN · del 10 al 12 ago 2026");
    expect(
      encabezadoCargos(
        resumenC({
          suma: 19.72,
          moneda: "USD",
          fecha_min: "2026-10-01",
          fecha_max: "2026-10-01",
          cuentas: [{ id: HSBC_USD, alias: "HSBC USD" }],
        }),
      ),
    ).toBe("2 cargos de HSBC USD · suman $19.72 USD · 01 oct 2026");
  });

  it("renglón del cargo: fecha · descripción · ref, y el monto aparte (« USD» fuera de pesos)", () => {
    const m = { fecha: "2026-08-03", descripcion: "REST EL TACO LOCO", referencia: "0025830577", monto: "-280.00" };
    expect(lineaCargoVincular(m, null, "MXN")).toEqual({
      texto: "03 ago · REST EL TACO LOCO · ref 0025830577",
      monto: "$280.00",
    });
    expect(lineaCargoVincular(m, "GASTOS GNRAL", "MXN").texto).toBe("03 ago · GASTOS GNRAL · REST EL TACO LOCO · ref 0025830577");
    // La referencia que ya viene en la leyenda no se repite.
    expect(lineaCargoVincular({ ...m, descripcion: "SPEI 0025830577 TACO" }, null, "MXN").texto).toBe(
      "03 ago · SPEI 0025830577 TACO",
    );
    expect(lineaCargoVincular({ ...m, referencia: null, monto: "17.00", fecha: "2026-10-01" }, null, "USD")).toEqual({
      texto: "01 oct · REST EL TACO LOCO",
      monto: "$17.00 USD",
    });
  });

  it("aviso ámbar de cuentas distintas (sin todos los alias, sin la lista); null con una", () => {
    expect(avisoVariasCuentas([{ id: GASTOS, alias: "GASTOS GNRAL" }])).toBeNull();
    expect(avisoVariasCuentas(null)).toBeNull();
    expect(
      avisoVariasCuentas([
        { id: GASTOS, alias: "GASTOS GNRAL" },
        { id: EJE, alias: null },
      ], { [EJE]: "EJE SCOTIA" }),
    ).toBe("Los cargos son de 2 cuentas (GASTOS GNRAL, EJE SCOTIA).");
    expect(
      avisoVariasCuentas([
        { id: GASTOS, alias: "GASTOS GNRAL" },
        { id: EJE, alias: null },
      ]),
    ).toBe("Los cargos son de 2 cuentas.");
  });

  it("aviso ámbar de cargos con su PROPIO gasto (lo calcula el API: caso Cozumel 62.91 × 2)", () => {
    expect(avisoCargosConCandidatoPropio(null)).toBeNull();
    expect(avisoCargosConCandidatoPropio(undefined)).toBeNull();
    expect(avisoCargosConCandidatoPropio([])).toBeNull();
    expect(avisoCargosConCandidatoPropio([{ id: A, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 }])).toBe(
      "1 de los cargos tiene un gasto que cuadra solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por uno desde su menú ⋯.",
    );
    expect(
      avisoCargosConCandidatoPropio([
        { id: A, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 },
        { id: B, motivo: "AMBIGUO", candidatos_n: 3 },
      ]),
    ).toBe(
      "2 de los cargos tienen un gasto que cuadra solo: ¿seguro que pagan juntos un solo gasto? Si no, vincúlalos uno por uno desde su menú ⋯.",
    );
    expect(NOTA_CANDIDATO_PROPIO_NO_VERIFICADO).toBe("No se pudo revisar si algún cargo tiene su propio gasto.");
    expect(marcaCandidatoPropio({ motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 })).toBe("tiene un gasto que cuadra solo");
    expect(marcaCandidatoPropio({ motivo: "AMBIGUO", candidatos_n: 3 })).toBe("tiene 3 gastos que cuadran solos");
    expect(marcaCandidatoPropio({ motivo: "AMBIGUO", candidatos_n: null })).toBe("tiene varios gastos que cuadran solos");
  });
});

describe("la lista de gastos", () => {
  it("buscador, ventana, «Ampliar a ±120 días» y la nota al pie", () => {
    expect(placeholderBuscarSuma(400)).toBe("Busca por monto (400.00), proveedor o nota");
    expect(placeholderBuscarSuma(null)).toBe("Busca por monto, proveedor o nota");
    expect(textoVentanaSuma(30)).toBe("Gastos sin conciliar · ±30 días de los cargos");
    expect(textoVentanaSuma(120)).toBe("Gastos sin conciliar · ±120 días de los cargos");
    expect(BOTON_AMPLIAR_120).toBe("Ampliar a ±120 días");
    expect(notaVentanaSuma(30)).toBe(
      "Gastos bancarios (tarjeta, transferencia, PayWise o pago domiciliado) sin conciliar, en la moneda de los cargos y con fecha ±30 días de los cargos; primero los que la suma cubre. Un gasto en efectivo no sale aquí: se vincula cargo por cargo desde el menú ⋯.",
    );
  });

  it("estados: el ERROR antes que el vacío (jamás «ningún gasto» si la lectura falló)", () => {
    const s = { cargando: false, error: null, q: "", resultados: 0, truncado: false, dias: 30 };
    expect(estadoListaSuma({ ...s, cargando: true })).toEqual({
      tipo: "cargando",
      texto: "Buscando los gastos que pagaron los cargos…",
    });
    expect(estadoListaSuma({ ...s, cargando: true, q: "taco" }).texto).toBe("Buscando «taco»…");
    expect(estadoListaSuma({ ...s, error: TEXTO_CANDIDATOS_NO_CARGARON })).toEqual({
      tipo: "error",
      texto: "No se pudo cargar la lista de gastos: vuelve a intentarlo.",
    });
    expect(estadoListaSuma(s)).toEqual({
      tipo: "vacio_sin_q",
      texto: "Ningún gasto sin conciliar coincide en ±30 días de los cargos.",
    });
    expect(estadoListaSuma({ ...s, q: "400.00", dias: 120 })).toEqual({
      tipo: "vacio_con_q",
      texto: "Ningún gasto sin conciliar coincide con «400.00» en ±120 días de los cargos.",
    });
    expect(estadoListaSuma({ ...s, resultados: 3 })).toEqual({ tipo: "lista", texto: "" });
    expect(estadoListaSuma({ ...s, resultados: 100, truncado: true }).texto).toBe(
      "Se muestran los primeros 100: escribe el monto, el proveedor o la nota para encontrar el que buscas.",
    );
  });

  it("la guía SOLO pinta `resultado`, `faltante_tras` y `excedente` del API (verde / ámbar / rojo)", () => {
    expect(guiaResultado(comida())).toEqual({ tono: "ok", texto: "Queda cubierto" });
    expect(guiaResultado(comida({ monto: 450, resultado: "PARCIAL", faltante_tras: 50 }))).toEqual({
      tono: "aviso",
      texto: "Quedaría parcial: le faltarían $50.00",
    });
    expect(guiaResultado(comida({ monto: 380, resultado: "EXCEDE", excedente: 20 }))).toEqual({
      tono: "error",
      texto: "Se pasa por $20.00: el sistema no lo acepta",
    });
    expect(guiaResultado(comida({ moneda: "USD", resultado: "PARCIAL", faltante_tras: 2.72 }))?.texto).toBe(
      "Quedaría parcial: le faltarían $2.72 USD",
    );
    // Un resultado que el panel no conoce: sin guía (no se adivina).
    expect(guiaResultado(comida({ resultado: "OTRO" as never }))).toBeNull();
    expect(hayCandidatoQueCubre([comida({ resultado: "PARCIAL" }), comida()])).toBe(true);
    expect(hayCandidatoQueCubre([comida({ resultado: "EXCEDE" })])).toBe(false);
    expect(hayCandidatoQueCubre([])).toBe(false);
  });

  it("la ficha: la de siempre + «capturó Itzi»; el gasto del resumen sin proveedor ni MXN", () => {
    expect(descripcionCandidatoSuma(comida())).toBe(
      "Tarjeta ****4929 · [CARGA-EXCEL-AGO28] Viáticos · N621TX · vuelo #104 · capturó Itzi",
    );
    expect(
      descripcionCandidatoSuma(
        comida({ tarjeta_terminacion: null, nota: null, matricula: null, vuelo_folio: null, capturado_por: null }),
      ),
    ).toBeNull();
    expect(etiquetaGastoResumen(comida())).toBe("Comida · $400.00 · 03 ago 2026 · vuelo #104");
    expect(etiquetaGastoResumen(comida({ moneda: "USD", monto: 19.72, vuelo_folio: null, fecha: "2026-10-01" }))).toBe(
      "Comida · $19.72 USD · 01 oct 2026",
    );
  });
});

describe("la confirmación (resumen visible + botón) y el toast", () => {
  it("resumen con la suma DEL API: cubre, parcial y se pasa", () => {
    expect(textoResumenVincularCargos({ n: 2, suma: 400, moneda: "MXN", gasto: comida() })).toBe(
      "Se vincularán 2 cargos ($400.00) al gasto «Comida · $400.00 · 03 ago 2026 · vuelo #104» y, según la suma, el gasto queda cubierto.",
    );
    expect(
      textoResumenVincularCargos({
        n: 2,
        suma: 400,
        moneda: "MXN",
        gasto: comida({ categoria: "OPERACIONES", monto: 450, fecha: "2026-08-04", vuelo_folio: null, resultado: "PARCIAL", faltante_tras: 50 }),
      }),
    ).toBe(
      "Se vincularán 2 cargos ($400.00) al gasto «Operaciones · $450.00 · 04 ago 2026» y, según la suma, quedará parcial: le faltarán $50.00.",
    );
    expect(
      textoResumenVincularCargos({
        n: 2,
        suma: 400,
        moneda: "MXN",
        gasto: comida({ monto: 380, resultado: "EXCEDE", excedente: 20 }),
      }),
    ).toBe(
      "Los 2 cargos ($400.00) se pasarían por $20.00 del gasto «Comida · $380.00 · 03 ago 2026 · vuelo #104»: el sistema no lo acepta. Elige otro gasto o revisa la selección.",
    );
    expect(
      textoResumenVincularCargos({
        n: 2,
        suma: 19.72,
        moneda: "USD",
        gasto: comida({ moneda: "USD", monto: 19.72, vuelo_folio: null, fecha: "2026-10-01" }),
      }),
    ).toBe(
      "Se vincularán 2 cargos ($19.72 USD) al gasto «Comida · $19.72 USD · 01 oct 2026» y, según la suma, el gasto queda cubierto.",
    );
    expect(botonVincularCargos(2)).toBe("Vincular los 2 cargos");
    expect(TEXTO_ELIGE_GASTO).toBe("Elige el gasto que pagaron los cargos.");
  });

  const liga = (extra: Partial<LigarCargosGastoRespuesta> = {}): LigarCargosGastoRespuesta => ({
    gasto_id: comida().id,
    idempotente: false,
    nuevos: [A, B],
    partes: [
      { movimiento_id: A, monto_parte: 120, moneda: "MXN" },
      { movimiento_id: B, monto_parte: 280, moneda: "MXN" },
    ],
    gasto_estado: { monto: 400, moneda: "MXN", n_partes: 2, monto_vinculado: 400, faltante: 0, cubierto: true },
    movimientos: [],
    ...extra,
  });

  it("toast: cubierto, parcial, re-envío idéntico, uno ya estaba y sin `gasto_estado`", () => {
    expect(toastCargosVinculados(liga(), 2)).toEqual({
      titulo: "2 cargos vinculados al gasto",
      descripcion: "El gasto quedó cubierto ($400.00).",
    });
    expect(
      toastCargosVinculados(
        liga({ gasto_estado: { monto: 450, moneda: "MXN", n_partes: 2, monto_vinculado: 400, faltante: 50, cubierto: false } }),
        2,
      ).descripcion,
    ).toBe("El gasto quedó PARCIAL: faltan $50.00 de $450.00.");
    expect(toastCargosVinculados(liga({ idempotente: true, nuevos: [] }), 2).titulo).toBe(
      "Los 2 cargos ya estaban vinculados a ese gasto",
    );
    expect(toastCargosVinculados(liga({ nuevos: [B] }), 2).titulo).toBe("1 cargo vinculado al gasto (1 ya lo estaba)");
    expect(toastCargosVinculados(liga({ nuevos: [B, uuid(3)] }), 3).titulo).toBe("2 cargos vinculados al gasto (1 ya lo estaba)");
    expect(toastCargosVinculados({ ...liga(), gasto_estado: undefined as never }, 2)).toEqual({
      titulo: "2 cargos vinculados al gasto",
    });
    expect(
      toastCargosVinculados(
        liga({ gasto_estado: { monto: 19.72, moneda: "USD", n_partes: 2, monto_vinculado: 19.72, faltante: 0, cubierto: true } }),
        2,
      ).descripcion,
    ).toBe("El gasto quedó cubierto ($19.72 USD).");
  });
});

describe("errores al LIGAR (todo o nada en el API)", () => {
  const NO_ACTIVA = "Esta opción todavía no está activa: avisa a sistemas.";

  it("sin conexión, 5xx o sin status ⇒ INCIERTO (la RPC pudo correr): «No se pudo confirmar…» y refresh", () => {
    for (const r of [
      { ok: false, code: "SIN_CONEXION", error: "No hubo conexión con el servidor. Vuelve a intentarlo." },
      { ok: false, status: 500, code: "INTERNAL_SERVER_ERROR", error: "Internal server error" },
      { ok: false, status: 502, error: "Bad Gateway" },
      { ok: false, error: "fetch failed" },
    ]) {
      expect(mensajeErrorCargosGasto(r)).toMatchObject({
        titulo: "No se pudo confirmar si se vincularon: revisa la lista antes de reintentar.",
        incierto: true,
        refrescar: true,
      });
    }
    expect(TEXTO_INCIERTO_VINCULAR).toBe("No se pudo confirmar si se vincularon: revisa la lista antes de reintentar.");
  });

  it("ruta inexistente, DTO previo o el 503 de la migración ⇒ «todavía no está activa» (nada se escribió)", () => {
    for (const r of [
      { ok: false, code: "RUTA_NO_DISPONIBLE", status: 404, error: NO_ACTIVA },
      { ok: false, status: 404, error: "Cannot POST /v1/conciliacion/gastos/x/cargos" },
      { ok: false, status: 400, error: "property movimiento_ids should not exist" },
      { ok: false, status: 503, code: "CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE", error: NO_ACTIVA },
      { ok: false, status: 503, code: "CONCILIACION_PARTES_NO_DISPONIBLE", error: "La conciliación de un cargo…" },
    ]) {
      expect(esCargosNoActivo(r)).toBe(true);
      expect(mensajeErrorCargosGasto(r)).toEqual({
        titulo: NO_ACTIVA,
        incierto: false,
        refrescar: false,
        recargarLista: false,
        soltarGasto: false,
        quitarIds: [],
      });
    }
    expect(esCargosNoActivo(null)).toBe(false);
  });

  it("401 y 403 en palabras del operador", () => {
    expect(mensajeErrorCargosGasto({ ok: false, status: 401, error: "Invalid or expired token" }).titulo).toBe(
      "Tu sesión expiró. Recarga la página e inicia sesión.",
    );
    expect(mensajeErrorCargosGasto({ ok: false, status: 403, error: "Forbidden resource" }).titulo).toBe(
      "Tu usuario no puede conciliar movimientos del banco.",
    );
  });

  it("409 MOVIMIENTO_NO_PENDIENTE: el texto del API (ya dice «No se vinculó…»), «Quitar…» con sus ids y refresh", () => {
    const texto =
      "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — 03 ago · REST EL TACO LOCO $280.00 (ya está vinculado a un gasto). Quítalo de la selección y vuelve a intentarlo.";
    const e = mensajeErrorCargosGasto({
      ok: false,
      status: 409,
      code: "MOVIMIENTO_NO_PENDIENTE",
      error: texto,
      details: { gasto_id: comida().id, movimientos: [{ id: B, estado: "CON_GASTO" }] },
    });
    expect(e).toEqual({
      titulo: texto,
      incierto: false,
      refrescar: true,
      recargarLista: false,
      soltarGasto: false,
      quitarIds: [B],
    });
  });

  it("404 MOVIMIENTO_NO_EXISTE (faltan), 409 MOVIMIENTO_OMITIDO (movimiento_id) y 400 SOLO_CARGOS (abonos)", () => {
    expect(
      mensajeErrorCargosGasto({
        ok: false,
        status: 404,
        code: "MOVIMIENTO_NO_EXISTE",
        error: "Uno de los movimientos ya no existe: recarga la página.",
        details: { faltan: [A] },
      }),
    ).toMatchObject({ descripcion: TEXTO_NO_SE_VINCULO, refrescar: true, quitarIds: [A] });
    expect(
      mensajeErrorCargosGasto({
        ok: false,
        status: 409,
        code: "MOVIMIENTO_OMITIDO",
        error: "Este movimiento se omitió de la conciliación: deshaz la omisión antes de vincularlo o clasificarlo.",
        details: { movimiento_id: B },
      }),
    ).toMatchObject({ refrescar: true, quitarIds: [B] });
    expect(
      mensajeErrorCargosGasto({
        ok: false,
        status: 400,
        code: "SOLO_CARGOS",
        error: "Solo los cargos pagan un gasto: quita el abono de la selección.",
        details: { abonos: [{ id: B, fecha: "2026-08-03", monto: 280 }] },
      }),
    ).toMatchObject({ refrescar: false, recargarLista: false, quitarIds: [B] });
  });

  it("una regla rechazó (se pasa, otra moneda, efectivo, al mismo tiempo): texto + «No se vinculó ningún cargo.» y la lista se vuelve a pedir", () => {
    const excede =
      "Los 2 cargos suman $400.00 y al gasto le faltan $380.00 (vale $380.00): se pasarían por $20.00 (tolerancia $1.00). Revisa la selección o el monto del gasto.";
    expect(mensajeErrorCargosGasto({ ok: false, status: 409, code: "CARGOS_EXCEDEN_GASTO", error: excede })).toEqual({
      titulo: excede,
      descripcion: "No se vinculó ningún cargo.",
      incierto: false,
      refrescar: false,
      recargarLista: true,
      soltarGasto: false,
      quitarIds: [],
    });
    for (const code of ["LOTE_MONEDA_DISTINTA", "GASTO_NO_BANCARIO", "GASTO_BODEGA", "GASTO_YA_CUBIERTO", "CONFLICTO_CONCURRENTE"]) {
      expect(mensajeErrorCargosGasto({ ok: false, status: 409, code, error: "Texto del API." })).toMatchObject({
        titulo: "Texto del API.",
        descripcion: TEXTO_NO_SE_VINCULO,
        recargarLista: true,
      });
    }
    // El código pegado al texto no se pinta.
    expect(mensajeErrorCargosGasto({ ok: false, status: 409, code: "X", error: "CARGO_EXCEDIDO: el cargo ya rebasa." }).titulo).toBe(
      "el cargo ya rebasa.",
    );
  });

  it("404 GASTO_NO_EXISTE suelta el gasto y vuelve a pedir la lista; un 4xx técnico dice el genérico", () => {
    expect(
      mensajeErrorCargosGasto({ ok: false, status: 404, code: "GASTO_NO_EXISTE", error: "Ese gasto ya no existe: recarga la página." }),
    ).toMatchObject({ soltarGasto: true, recargarLista: true, refrescar: true, descripcion: TEXTO_NO_SE_VINCULO });
    const tecnico = mensajeErrorCargosGasto({ ok: false, status: 400, error: "Bad Request" });
    expect(tecnico.titulo).toBe(TEXTO_RECHAZO_VINCULAR);
    expect(tecnico.descripcion).toBeUndefined();
    expect(mensajeErrorCargosGasto({ ok: false, status: 400, code: "GASTO_INVALIDO", error: "Gasto inválido." })).toMatchObject({
      titulo: "Gasto inválido.",
      recargarLista: false,
    });
  });

  it("«Quitar esos N…» y el aviso de un solo cargo", () => {
    expect(botonQuitarNoPendientes(1)).toBe("Quitar ese cargo de la selección");
    expect(botonQuitarNoPendientes(2)).toBe("Quitar esos 2 de la selección");
    expect(TEXTO_UN_SOLO_CARGO).toBe("Con un solo cargo usa «Vincular gasto» desde su menú ⋯.");
  });
});

describe("errores de la LECTURA de candidatos (nada que confirmar)", () => {
  it("lo que el API explica se pinta con su «Quitar…»; red o 5xx ⇒ el genérico con «Reintentar»", () => {
    expect(
      mensajeErrorCandidatosSuma({
        ok: false,
        status: 409,
        code: "MOVIMIENTO_NO_PENDIENTE",
        error: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — … Quítalo de la selección y vuelve a intentarlo.",
        details: { movimientos: [{ id: A }] },
      }),
    ).toEqual({
      texto: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — … Quítalo de la selección y vuelve a intentarlo.",
      reintentar: false,
      refrescar: true,
      quitarIds: [A],
    });
    expect(
      mensajeErrorCandidatosSuma({ ok: false, status: 404, code: "MOVIMIENTO_NO_EXISTE", error: "x", details: { faltan: [B] } }),
    ).toMatchObject({ refrescar: true, quitarIds: [B] });
    expect(
      mensajeErrorCandidatosSuma({ ok: false, status: 400, code: "SOLO_CARGOS", error: "x", details: { abonos: [{ id: B }] } }),
    ).toMatchObject({ refrescar: false, quitarIds: [B] });
    for (const r of [
      { ok: false, code: "SIN_CONEXION", error: "No hubo conexión con el servidor. Vuelve a intentarlo." },
      { ok: false, status: 500, error: "Internal server error" },
      { ok: false, error: "fetch failed" },
    ]) {
      expect(mensajeErrorCandidatosSuma(r)).toEqual({
        texto: "No se pudo cargar la lista de gastos: vuelve a intentarlo.",
        reintentar: true,
        refrescar: false,
        quitarIds: [],
      });
    }
    const sinMoneda = "No se pudo leer la moneda de la cuenta bancaria del cargo: vuelve a intentarlo en unos minutos.";
    expect(mensajeErrorCandidatosSuma({ ok: false, status: 503, code: "CUENTA_SIN_MONEDA", error: sinMoneda })).toMatchObject({
      texto: sinMoneda,
      reintentar: true,
    });
  });

  it("no activa, 401, 403 y un 409 de la regla (sin «Reintentar»: no cambiaría)", () => {
    expect(mensajeErrorCandidatosSuma({ ok: false, status: 404, error: "Cannot POST /v1/conciliacion/cargos/gastos-candidatos" }).texto).toBe(
      "Esta opción todavía no está activa: avisa a sistemas.",
    );
    expect(mensajeErrorCandidatosSuma({ ok: false, status: 401, error: "x" }).texto).toBe(
      "Tu sesión expiró. Recarga la página e inicia sesión.",
    );
    expect(mensajeErrorCandidatosSuma({ ok: false, status: 403, error: "x" }).texto).toBe(
      "Tu usuario no puede conciliar movimientos del banco.",
    );
    expect(
      mensajeErrorCandidatosSuma({
        ok: false,
        status: 409,
        code: "CARGOS_MONEDA_DISTINTA",
        error: "Los cargos son de cuentas en MXN y USD: un gasto se paga en una sola moneda.",
      }),
    ).toEqual({
      texto: "Los cargos son de cuentas en MXN y USD: un gasto se paga en una sola moneda.",
      reintentar: false,
      refrescar: false,
      quitarIds: [],
    });
  });
});

describe("los gastos del monto de la suma que NO entraron, en palabras de «varios cargos»", () => {
  const efectivo: ExcluidosCandidatos = {
    motivo: "EFECTIVO_U_OTRO_MEDIO",
    n: 1,
    gastos: [
      {
        id: "e0e0e0e0-0000-4000-8000-000000000400",
        fecha_gasto: "2026-08-03",
        monto: 400,
        moneda: "MXN",
        medio_pago: "EFECTIVO",
        categoria: "COMIDA",
        vuelo_folio: 104,
        vuelo_id: null,
      },
    ],
  };
  const fuera: ExcluidosCandidatos = { ...efectivo, motivo: "FUERA_DE_VENTANA", gastos: [{ ...efectivo.gastos[0], medio_pago: "TARJETA_CORP", fecha_gasto: "2026-05-01" }] };
  const ctx = { monedaCuenta: "MXN", dias: 30, montoBuscado: 400, variosCargos: true };

  it("efectivo: manda a ligarlos cargo por cargo (como el API) y NUNCA «Mostrar estos gastos»", () => {
    const [a] = textoExcluidosCandidatos([efectivo], 400, ctx);
    expect(a.texto).toBe(
      "Hay 1 gasto de $400.00 en efectivo (3 ago · vuelo #104): la lista solo muestra gastos pagados por el banco. Si en realidad se pagó con tarjeta, transferencia o pago domiciliado, corrige el medio de pago del gasto; si no, vincúlalo cargo por cargo con su justificación (menú ⋯ → Vincular gasto → «Incluir gastos en efectivo y otros medios»).",
    );
    expect(a.mostrar).toBeNull();
    const [varios] = textoExcluidosCandidatos([{ ...efectivo, n: 2 }], 400, ctx);
    expect(varios.texto).toContain(
      "si no, vincula el que corresponda cargo por cargo con su justificación (menú ⋯ → Vincular gasto → «Incluir gastos en efectivo y otros medios»).",
    );
  });

  it("fuera de la ventana: «de los cargos»; sin la bandera, las frases de UN cargo idénticas", () => {
    expect(textoExcluidosCandidatos([fuera], 400, ctx)[0].texto).toBe(
      "1 gasto de $400.00 (1 may · vuelo #104) cae fuera de ±30 días de los cargos: amplía a 120 días.",
    );
    const uno = textoExcluidosCandidatos([efectivo, fuera], 400, { ...ctx, variosCargos: undefined });
    expect(uno[0].texto).toContain("si no, muéstralo y vincúlalo con una justificación (su medio de pago no cambia).");
    expect(uno[0].mostrar).not.toBeNull();
    expect(uno[1].texto).toContain("fuera de ±30 días del cargo:");
  });
});

describe("paridad con el API (si el repo hermano está al lado)", () => {
  const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
  const leerApi = (rel: string): string | null => {
    const p = path.join(API, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };

  it("textos del DTO, rutas, resultados, códigos 503 y la salida de un gasto en efectivo", () => {
    const util = leerApi("modules/conciliacion/cargos-a-gasto.util.ts");
    const dto = leerApi("modules/conciliacion/dto/conciliacion.dto.ts");
    const ctrl = leerApi("modules/conciliacion/conciliacion.controller.ts");
    const sonda = leerApi("common/omision-cargos-disponible.util.ts");
    const partes = leerApi("common/partes-disponible.util.ts");
    if (!util || !dto || !ctrl || !sonda || !partes) return;
    expect(util).toContain(`'${MSG_LOTE_CARGOS_INVALIDO}'`);
    expect(dto).toContain(`'${MSG_CARGO_INVALIDO}'`);
    expect(util).toContain("export type ResultadoSuma = 'CUBRE' | 'PARCIAL' | 'EXCEDE';");
    expect(ctrl).toContain("@Post('cargos/gastos-candidatos')");
    expect(ctrl).toContain("@Post('gastos/:id/cargos')");
    expect(sonda).toContain("error: 'CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE'");
    expect(partes).toContain("error: 'CONCILIACION_PARTES_NO_DISPONIBLE'");
    // La frase del efectivo con varios cargos dice lo mismo que el 409 GASTO_NO_BANCARIO.
    expect(util).toContain(
      "se vincula cargo por cargo con su justificación (menú ⋯ → Vincular gasto → «Incluir gastos en efectivo y otros medios»).",
    );
  });
});
