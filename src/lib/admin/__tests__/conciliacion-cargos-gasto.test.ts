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
 *
 * Paso 4, «¿No está el gasto? Créalo por $X» (al final): el prellenado con la
 * SUMA DEL API (mismo día; días y meses distintos ⇒ el último pago + aviso;
 * terminación común ⇒ tarjeta; sin ella ⇒ transferencia; todos automáticos ⇒
 * pago domiciliado; USD 19.72), las notas (≤ 10 cargos + «y N más», ≤ 2,000),
 * los posibles duplicados (jamás «ninguno» con la lectura caída o sin
 * `excluidos`), los textos exactos y cada error del alta (incierto, no
 * activa, GASTO_SIN_VINCULAR, cargos no pendientes, llave en uso). Caso real:
 * HSBC Pesos 30-sep 2f95e45b $649.00 + 61baed07 $103.84 = $752.84.
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
  TEXTO_ESPERA_LISTA_SUMA,
  TEXTO_ESPERA_SUMA_CARGOS,
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
  fichaElegidaVigente,
  guiaResultado,
  hayCandidatoQueCubre,
  lineaCargoVincular,
  marcaCandidatoPropio,
  mensajeErrorCandidatosSuma,
  mensajeErrorCargosGasto,
  motivoNoVincularCargos,
  notaVentanaSuma,
  placeholderBuscarSuma,
  textoCargosSinSuma,
  textoFechasCargos,
  textoResumenVincularCargos,
  textoVentanaSuma,
  toastCargosVinculados,
  tituloVincularCargos,
  MAX_LARGO_NOTAS,
  MEDIOS_BANCARIOS_ALTA_SUMA,
  MSG_LLAVE_CAPTURA_REQUERIDA,
  NOTA_SIN_IA_SUMA,
  TEXTO_DUPLICADOS_SUMA_NO_LEIDOS,
  TEXTO_ESPERA_DUPLICADOS,
  TEXTO_FALTA_CASILLA_SUMA,
  TEXTO_INCIERTO_CREAR_SUMA,
  TEXTO_RECHAZO_CREAR_SUMA,
  avisoCargosConCandidatoPropioCrear,
  avisoFechasCargos,
  botonAbrirCrearSuma,
  casillaCrearSuma,
  contextoCrearSuma,
  esDtoSinCargosAlta,
  estadoDuplicadosSuma,
  mensajeErrorCrearSuma,
  motivoNoCrearSuma,
  notaPrellenadoSuma,
  notasDeCargos,
  prefillGastoDesdeCargos,
  qDuplicadosSuma,
  textoExitoCrearSuma,
  tituloAbrirCrearSuma,
  tituloCrearSuma,
} from "../conciliacion-cargos-gasto";
import { MSG_SESION_EXPIRADA, textoExcluidosCandidatos } from "../conciliacion-lote";
import { MSG_OPCION_NO_ACTIVA, MSG_SIN_PERMISO_CONCILIAR } from "../conciliacion-omision";
import { MEDIOS_BANCARIOS_CONCILIACION } from "../conciliacion-no-bancario";
import { TEXTO_BUSCANDO_DUPLICADOS } from "../gasto-desde-cargo";
import { MEDIO_PAGO_LABELS } from "../medios-pago";
import type {
  CandidatoGastoPorSuma,
  CargosGastosCandidatosResponse,
  CargosResumen,
  ConciliacionAlCrear,
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

  it("con UN cargo (quitaron los demás de la selección): singular, nunca «1 cargos»", () => {
    expect(tituloVincularCargos(1)).toBe("Vincular 1 cargo a un gasto");
    expect(textoCargosSinSuma(1)).toBe("1 cargo seleccionado");
    expect(botonVincularCargos(1)).toBe("Vincular el cargo");
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

  it("la ficha del elegido SOLO vale para los cargos con los que se eligió (revisión del 15-oct)", () => {
    // Se eligió G para A+B+C (suma $550, «Queda cubierto»).
    const g550 = comida({ monto: 550, faltante: 550, resultado: "CUBRE", faltante_tras: 0 });
    const elegido = { idsClave: `${A},${B},C`, candidato: g550 };
    // Mismos cargos: la ficha MÁS reciente de la respuesta vigente…
    const fresca = { ...g550, monto_vinculado: 10, faltante: 540 };
    expect(fichaElegidaVigente(elegido, `${A},${B},C`, [fresca])).toBe(fresca);
    // …o la elegida si la búsqueda lo dejó fuera (es de la MISMA suma).
    expect(fichaElegidaVigente(elegido, `${A},${B},C`, [])).toBe(g550);
    // Se quitó C (otra suma: $400): la ficha de $550 ya no sirve, ni siquiera
    // si G vuelve en la lista nueva con OTRO resultado (hay que volver a elegir).
    expect(fichaElegidaVigente(elegido, `${A},${B}`, [])).toBeNull();
    expect(fichaElegidaVigente(elegido, `${A},${B}`, [comida({ monto: 550, resultado: "PARCIAL", faltante_tras: 150 })])).toBeNull();
    expect(fichaElegidaVigente(null, `${A},${B}`, [g550])).toBeNull();
  });

  it("«Vincular los N cargos» no llama al API sin la confirmación a la vista (el botón nunca se apaga: el clic dice por qué)", () => {
    const listo = { unSolo: false, cargando: false, elegido: true, conResumen: true };
    expect(motivoNoVincularCargos(listo)).toBeNull();
    expect(motivoNoVincularCargos({ ...listo, unSolo: true })).toBe(TEXTO_UN_SOLO_CARGO);
    // Se quitó un cargo y llega la suma nueva (o la lista se vuelve a pedir).
    expect(motivoNoVincularCargos({ ...listo, cargando: true })).toBe("Espera a que termine de cargar la lista de gastos.");
    expect(TEXTO_ESPERA_LISTA_SUMA).toBe("Espera a que termine de cargar la lista de gastos.");
    expect(motivoNoVincularCargos({ ...listo, elegido: false })).toBe(TEXTO_ELIGE_GASTO);
    // Sin el resumen (la suma de ESTOS cargos no llegó o falló): no hay confirmación.
    expect(motivoNoVincularCargos({ ...listo, conResumen: false })).toBe(
      "Espera a que se actualice la suma de los cargos y vuelve a elegir el gasto.",
    );
    expect(TEXTO_ESPERA_SUMA_CARGOS).toBe(motivoNoVincularCargos({ ...listo, conResumen: false }));
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

// ═════════════════ Paso 4: «¿No está el gasto? Créalo por $X» ═════════════════

const RENTA = "2f95e45b-0000-4000-8000-000000000649";
const IVA = "61baed07-0000-4000-8000-000000000103";
const HSBC_MXN = "4c4c4c4c-0000-4000-8000-0000000000a1";

/** Un cargo como lo trae la tabla (el monto del banco viene con signo). */
const mov = (fecha: string, descripcion: string | null, monto: string) => ({ fecha, descripcion, monto });
/** HSBC Pesos 30-sep (prod): C ADMINISTRACION RENTA $649.00 + I.V.A. $103.84. */
const HSBC_30SEP = [mov("2026-09-30", "C ADMINISTRACION RENTA", "-649.00"), mov("2026-09-30", "I.V.A.", "-103.84")];
const resumenHsbc = (extra: Partial<CargosResumen> = {}): CargosResumen => ({
  ids: [RENTA, IVA],
  n: 2,
  suma: 752.84,
  moneda: "MXN",
  fecha_min: "2026-09-30",
  fecha_max: "2026-09-30",
  cuentas: [{ id: HSBC_MXN, alias: "HSBC Pesos" }],
  terminacion_comun: null,
  ...extra,
});

describe("paso 4 · textos exactos del enlace, el paso previo y el alta", () => {
  it("el enlace «Créalo por $X» con la suma del API (« USD» fuera de pesos) y su tooltip", () => {
    expect(botonAbrirCrearSuma(400, "MXN")).toBe("¿No está el gasto? Créalo por $400.00");
    expect(botonAbrirCrearSuma(752.84, null)).toBe("¿No está el gasto? Créalo por $752.84");
    expect(botonAbrirCrearSuma(19.72, "USD")).toBe("¿No está el gasto? Créalo por $19.72 USD");
    expect(botonAbrirCrearSuma(9591.49, "MXN")).toBe("¿No está el gasto? Créalo por $9,591.49");
    expect(tituloAbrirCrearSuma(2)).toBe(
      "El gasto no se capturó: créalo prellenado con la suma de los 2 cargos; al guardar queda vinculado a ellos en un solo paso.",
    );
  });

  it("título, nota de la IA, casilla y nota al pie del paso previo", () => {
    expect(tituloCrearSuma(2)).toBe("Crear el gasto con la suma de 2 cargos");
    expect(NOTA_SIN_IA_SUMA).toBe("La IA revisa un cargo a la vez: con varios cargos, revisa tú la lista.");
    expect(casillaCrearSuma(2, 752.84, "MXN")).toBe(
      "Revisé la lista y este gasto NO está registrado: crearlo por $752.84 y vincularle los 2 cargos.",
    );
    expect(casillaCrearSuma(2, 19.72, "USD")).toBe(
      "Revisé la lista y este gasto NO está registrado: crearlo por $19.72 USD y vincularle los 2 cargos.",
    );
    expect(notaPrellenadoSuma(2)).toBe(
      "El alta se abre con la suma, la fecha del último pago, el medio de pago y las leyendas de los cargos; revisa la categoría, el avión o vuelo y el proveedor. Al guardar se registra el gasto y se vinculan los 2 cargos en un solo paso: si algo falla, no se registra nada.",
    );
  });

  it("aviso ámbar del paso «crear»: quizá ya está capturado por separado (null sin ninguno o sin el dato)", () => {
    expect(avisoCargosConCandidatoPropioCrear(null)).toBeNull();
    expect(avisoCargosConCandidatoPropioCrear(undefined)).toBeNull();
    expect(avisoCargosConCandidatoPropioCrear([])).toBeNull();
    expect(avisoCargosConCandidatoPropioCrear([{ id: IVA, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 }])).toBe(
      "1 de los cargos tiene un gasto que cuadra solo: quizá ya está capturado por separado; vincúlalo uno por uno en vez de crear uno nuevo.",
    );
    expect(
      avisoCargosConCandidatoPropioCrear([
        { id: RENTA, motivo: "SE_PUEDE_CRUZAR", candidatos_n: 1 },
        { id: IVA, motivo: "AMBIGUO", candidatos_n: 2 },
      ]),
    ).toBe(
      "2 de los cargos tienen un gasto que cuadra solo: quizá ya están capturados por separado; vincúlalos uno por uno en vez de crear uno nuevo.",
    );
  });

  it("el contexto del alta: encabezado con la suma del API + todo o nada + solo medios del banco", () => {
    expect(contextoCrearSuma(resumenHsbc())).toBe(
      "2 cargos de HSBC Pesos · suman $752.84 MXN · 30 sep 2026. Al guardar se vinculan los 2 cargos en el mismo paso: si la liga falla, el gasto no se registra. Para vincular varios cargos el gasto debe pagarse por el banco (tarjeta corporativa, transferencia, Paywise o pago domiciliado).",
    );
    // La frase nombra TODOS los medios bancarios (espejo de MEDIOS_BANCARIOS del API).
    for (const m of MEDIOS_BANCARIOS_CONCILIACION) {
      expect(MEDIOS_BANCARIOS_ALTA_SUMA.toLowerCase()).toContain(MEDIO_PAGO_LABELS[m].toLowerCase());
    }
  });
});

describe("paso 4 · la fecha del gasto = la del ÚLTIMO pago, con aviso", () => {
  it("mismo día ⇒ sin aviso; días distintos; meses distintos; años distintos", () => {
    expect(avisoFechasCargos("2026-09-30", "2026-09-30")).toBeNull();
    expect(avisoFechasCargos("2026-08-10", "2026-08-12")).toBe(
      "Los cargos son de días distintos (10 y 12 ago): la fecha del gasto quedó en la del último pago (12 ago 2026). Cámbiala si la factura dice otra.",
    );
    expect(avisoFechasCargos("2026-09-30", "2026-10-01")).toBe(
      "Los cargos son de meses distintos (sep y oct): la fecha del gasto quedó en la del último pago (01 oct 2026) y el gasto cuenta en ese mes. Cámbiala si la factura dice otra.",
    );
    expect(avisoFechasCargos("2025-12-30", "2026-01-02")).toBe(
      "Los cargos son de meses distintos (dic 2025 y ene 2026): la fecha del gasto quedó en la del último pago (02 ene 2026) y el gasto cuenta en ese mes. Cámbiala si la factura dice otra.",
    );
    expect(avisoFechasCargos(null, "2026-10-01")).toBeNull();
    expect(avisoFechasCargos("2026-10-01", "x")).toBeNull();
  });
});

describe("paso 4 · las notas del gasto con las leyendas de los cargos", () => {
  it("«Pagado en 2 cargos del banco (HSBC Pesos): 30-sep C ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84»", () => {
    expect(notasDeCargos(HSBC_30SEP, "HSBC Pesos", "MXN")).toBe(
      "Pagado en 2 cargos del banco (HSBC Pesos): 30-sep C ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84",
    );
    expect(notasDeCargos(HSBC_30SEP, null, "MXN")).toBe(
      "Pagado en 2 cargos del banco: 30-sep C ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84",
    );
  });

  it("en orden de fecha; USD con su moneda; sin descripción, solo fecha y monto", () => {
    const usd = [mov("2026-10-01", "CARGO 2", "2.72"), mov("2026-09-30", null, "17.00")];
    expect(notasDeCargos(usd, "HSBC USD", "USD")).toBe("Pagado en 2 cargos del banco (HSBC USD): 30-sep $17.00 USD · 01-oct CARGO 2 $2.72 USD");
  });

  it("a lo más 10 cargos nombrados y «y N más»; la leyenda en una línea ≤ 60; nunca más de 2,000", () => {
    const doce = Array.from({ length: 12 }, (_, i) =>
      mov(`2026-09-${String(10 + i).padStart(2, "0")}`, `COMISION ${i + 1}\n  ESPACIOS`, "1.12"),
    );
    const t = notasDeCargos(doce, "GASTOS GNRAL", "MXN");
    expect(t.startsWith("Pagado en 12 cargos del banco (GASTOS GNRAL): 10-sep COMISION 1 ESPACIOS $1.12 · 11-sep")).toBe(true);
    expect(t.endsWith("19-sep COMISION 10 ESPACIOS $1.12 y 2 más")).toBe(true);
    expect(t.split(" · ")).toHaveLength(10);
    const larga = notasDeCargos([mov("2026-09-30", "X".repeat(200), "1.00"), mov("2026-09-30", "Y", "2.00")], null, "MXN");
    expect(larga).toContain(`${"X".repeat(59)}… $1.00`);
    const enorme = notasDeCargos(HSBC_30SEP, "Z".repeat(3000), "MXN");
    expect(enorme.length).toBe(MAX_LARGO_NOTAS);
    expect(enorme.endsWith("…")).toBe(true);
  });
});

describe("paso 4 · el alta prellenada con la SUMA DEL API", () => {
  it("HSBC Pesos 30-sep: $752.84 MXN, la fecha del pago, transferencia y las leyendas", () => {
    expect(prefillGastoDesdeCargos(HSBC_30SEP, resumenHsbc())).toEqual({
      monto: "752.84",
      moneda: "MXN",
      fecha_gasto: "2026-09-30",
      medio_pago: "TRANSFERENCIA",
      tarjeta_terminacion: "",
      notas: "Pagado en 2 cargos del banco (HSBC Pesos): 30-sep C ADMINISTRACION RENTA $649.00 · 30-sep I.V.A. $103.84",
    });
  });

  it("días distintos ⇒ la fecha del ÚLTIMO pago (`fecha_max` del API)", () => {
    const p = prefillGastoDesdeCargos(
      [mov("2026-08-10", "ASA CANCUN", "3216.27"), mov("2026-08-12", "ASA CANCUN", "6375.22")],
      resumenHsbc({ suma: 9591.49, fecha_min: "2026-08-10", fecha_max: "2026-08-12" }),
    );
    expect(p.fecha_gasto).toBe("2026-08-12");
    expect(p.monto).toBe("9591.49");
  });

  it("terminación común VALIDADA por el API ⇒ tarjeta corporativa con esa terminación; sin ella (o inválida) ⇒ transferencia", () => {
    const conTarjeta = prefillGastoDesdeCargos(HSBC_30SEP, resumenHsbc({ terminacion_comun: "4929" }));
    expect(conTarjeta.medio_pago).toBe("TARJETA_CORP");
    expect(conTarjeta.tarjeta_terminacion).toBe("4929");
    for (const t of [null, "", "12", "49290", "abcd"]) {
      const p = prefillGastoDesdeCargos(HSBC_30SEP, resumenHsbc({ terminacion_comun: t }));
      expect(p.medio_pago, String(t)).toBe("TRANSFERENCIA");
      expect(p.tarjeta_terminacion).toBe("");
    }
  });

  it("TODOS los cargos automáticos ⇒ pago domiciliado (gana a la terminación); uno solo no basta", () => {
    const recur = [mov("2026-10-02", "DLO*STARLINK Carg Recur.", "1200.00"), mov("2026-10-02", "STR*AMAZON RET REC Carg Recur.", "99.00")];
    const p = prefillGastoDesdeCargos(recur, resumenHsbc({ suma: 1299, terminacion_comun: "4929" }));
    expect(p.medio_pago).toBe("DOMICILIADO");
    expect(p.tarjeta_terminacion).toBe("");
    const mezcla = prefillGastoDesdeCargos([recur[0], mov("2026-10-02", "REST EL TACO LOCO", "99.00")], resumenHsbc({ suma: 1299 }));
    expect(mezcla.medio_pago).toBe("TRANSFERENCIA");
  });

  it("USD (HSBC USD 01-oct, 17.00 + 2.72): moneda USD y monto 19.72", () => {
    const p = prefillGastoDesdeCargos(
      [mov("2026-10-01", "COMISION", "17.00"), mov("2026-10-01", "IVA COMISION", "2.72")],
      resumenHsbc({ suma: 19.72, moneda: "USD", fecha_min: "2026-10-01", fecha_max: "2026-10-01", cuentas: [{ id: HSBC_USD, alias: "HSBC USD" }] }),
    );
    expect(p.moneda).toBe("USD");
    expect(p.monto).toBe("19.72");
    expect(p.notas).toBe("Pagado en 2 cargos del banco (HSBC USD): 01-oct COMISION $17.00 USD · 01-oct IVA COMISION $2.72 USD");
  });

  it("alias de la página si el API no lo manda; varias cuentas en las notas; sin suma o sin fecha, no se inventa", () => {
    const sinAlias = resumenHsbc({ cuentas: [{ id: HSBC_MXN, alias: null }] });
    expect(prefillGastoDesdeCargos(HSBC_30SEP, sinAlias, { [HSBC_MXN]: "HSBC Pesos" }).notas).toContain("(HSBC Pesos):");
    expect(prefillGastoDesdeCargos(HSBC_30SEP, sinAlias).notas).toContain("Pagado en 2 cargos del banco: ");
    const dos = resumenHsbc({ cuentas: [{ id: GASTOS, alias: "GASTOS GNRAL" }, { id: EJE, alias: "EJE SCOTIA" }] });
    expect(prefillGastoDesdeCargos(HSBC_30SEP, dos).notas).toContain("(GASTOS GNRAL, EJE SCOTIA):");
    expect(prefillGastoDesdeCargos(HSBC_30SEP, resumenHsbc({ suma: 0 })).monto).toBe("");
    expect(prefillGastoDesdeCargos(HSBC_30SEP, resumenHsbc({ fecha_max: "" }))).not.toHaveProperty("fecha_gasto");
  });
});

describe("paso 4 · el aviso del alta al guardar (de `conciliacion` del API)", () => {
  const estado = (extra: Partial<NonNullable<LigarCargosGastoRespuesta["gasto_estado"]>> = {}) => ({
    monto: 752.84,
    moneda: "MXN",
    n_partes: 2,
    monto_vinculado: 752.84,
    faltante: 0,
    cubierto: true,
    ...extra,
  });
  const conCon = (gasto_estado = estado(), idempotente = false) => ({
    conciliacion: { movimiento_ids: [RENTA, IVA], idempotente, partes: [], gasto_estado },
  });

  it("cubierto, PARCIAL (en pesos y en dólares) y el re-envío con la misma llave", () => {
    expect(textoExitoCrearSuma(conCon())).toBe("Gasto registrado y vinculado a 2 cargos · quedó cubierto");
    expect(textoExitoCrearSuma(conCon(estado({ monto: 800, monto_vinculado: 752.84, faltante: 47.16, cubierto: false })))).toBe(
      "Gasto registrado y vinculado a 2 cargos · quedó PARCIAL: faltan $47.16 de $800.00",
    );
    expect(
      textoExitoCrearSuma(conCon(estado({ monto: 20.72, moneda: "USD", monto_vinculado: 19.72, faltante: 1, cubierto: false }))),
    ).toBe("Gasto registrado y vinculado a 2 cargos · quedó PARCIAL: faltan $1.00 USD de $20.72 USD");
    expect(textoExitoCrearSuma(conCon(estado(), true))).toBe("Gasto registrado y vinculado a 2 cargos · quedó cubierto");
  });

  it("sin el bloque `conciliacion` no inventa cuántos ni cómo quedó", () => {
    expect(textoExitoCrearSuma({})).toBe("Gasto registrado y vinculado a los cargos");
    expect(textoExitoCrearSuma(null)).toBe("Gasto registrado y vinculado a los cargos");
    expect(
      textoExitoCrearSuma({
        conciliacion: { movimiento_ids: [RENTA, IVA], idempotente: false, partes: [] } as unknown as ConciliacionAlCrear,
      }),
    ).toBe("Gasto registrado y vinculado a 2 cargos");
  });
});

describe("paso 4 · errores del ALTA por la suma (el alta sigue abierta con este texto)", () => {
  it("sin conexión, red o 5xx sin código conocido ⇒ «No se pudo confirmar…» (incierto, refresh y releer)", () => {
    const inc = { texto: TEXTO_INCIERTO_CREAR_SUMA, incierto: true, refrescar: true, releer: true };
    expect(TEXTO_INCIERTO_CREAR_SUMA).toBe(
      "No se pudo confirmar si se registró el gasto: vuelve a pulsar «Guardar» (con esta misma captura no se duplica).",
    );
    expect(mensajeErrorCrearSuma({ ok: false, code: "SIN_CONEXION", error: "El servidor no respondió." })).toEqual(inc);
    expect(mensajeErrorCrearSuma({ ok: false, error: "fetch failed" })).toEqual(inc);
    expect(mensajeErrorCrearSuma({ ok: false, code: "PARSE_ERROR", status: 502, error: "Bad Gateway" })).toEqual(inc);
    expect(
      mensajeErrorCrearSuma({
        ok: false,
        code: "ERROR",
        status: 500,
        error: "Ocurrió un error inesperado al procesar la acción. Intenta de nuevo; si persiste, contacta a soporte.",
      }),
    ).toEqual(inc);
  });

  it("todavía no activo (503 de la migración o de las partes, DTO previo, ruta) ⇒ «Esta opción todavía no está activa…»", () => {
    for (const r of [
      { ok: false, code: "CONCILIACION_CARGOS_A_GASTO_NO_DISPONIBLE", status: 503, error: MSG_OPCION_NO_ACTIVA },
      { ok: false, code: "CONCILIACION_PARTES_NO_DISPONIBLE", status: 503, error: "La conciliación por partes…" },
      { ok: false, code: "BAD_REQUEST", status: 400, error: "property conciliar_con_movimientos should not exist" },
      { ok: false, code: "RUTA_NO_DISPONIBLE", status: 404, error: "Cannot POST /v1/expenses" },
    ]) {
      expect(mensajeErrorCrearSuma(r)).toEqual({ texto: MSG_OPCION_NO_ACTIVA, incierto: false, refrescar: false, releer: false });
    }
    expect(esDtoSinCargosAlta({ status: 400, error: "property conciliar_con_movimientos should not exist" })).toBe(true);
    expect(esDtoSinCargosAlta({ status: 400, error: "property inventario should not exist" })).toBe(false);
  });

  it("401 ⇒ sesión; 403 ⇒ el texto del API (o el de siempre si es técnico)", () => {
    expect(mensajeErrorCrearSuma({ ok: false, status: 401, error: "Unauthorized" }).texto).toBe(MSG_SESION_EXPIRADA);
    expect(
      mensajeErrorCrearSuma({
        ok: false,
        code: "CONCILIAR_SOLO_ADMIN_FACTURACION",
        status: 403,
        error: "Solo Administración y Facturación concilian con el banco.",
      }).texto,
    ).toBe("Solo Administración y Facturación concilian con el banco.");
    expect(mensajeErrorCrearSuma({ ok: false, status: 403, error: "Forbidden" }).texto).toBe(MSG_SIN_PERMISO_CONCILIAR);
  });

  it("500 GASTO_SIN_VINCULAR: su texto (el gasto SÍ quedó; «Guardar» reintenta la liga), refresh y releer — NO es incierto", () => {
    const msg =
      "El gasto se registró pero NO quedó vinculado a los cargos: vuelve a pulsar «Guardar» para reintentar la liga (no se duplica) o cancela y vincúlalo con «Vincular a un gasto».";
    expect(mensajeErrorCrearSuma({ ok: false, code: "GASTO_SIN_VINCULAR", status: 500, error: msg })).toEqual({
      texto: msg,
      incierto: false,
      refrescar: true,
      releer: true,
    });
  });

  it("500 GASTO_NO_REGISTRADO: el API ya retiró el gasto ⇒ su texto, sin refresh", () => {
    const msg =
      "No se registró el gasto: la liga con los cargos del banco falló y el gasto se retiró. Vuelve a intentarlo; si se repite, avisa a sistemas.";
    expect(mensajeErrorCrearSuma({ ok: false, code: "GASTO_NO_REGISTRADO", status: 500, error: msg })).toEqual({
      texto: msg,
      incierto: false,
      refrescar: false,
      releer: false,
    });
  });

  it("4xx ⇒ el texto del API; cargos no pendientes ⇒ refresh al cerrar; llave en uso ⇒ refresh y releer", () => {
    const noPend =
      "No se registró el gasto: 1 de los 2 cargos ya no está pendiente — 30 sep · I.V.A. $103.84 (ya está vinculado a un gasto). Cancela, quita esos cargos de la selección y vuelve a intentarlo.";
    expect(mensajeErrorCrearSuma({ ok: false, code: "MOVIMIENTO_NO_PENDIENTE", status: 409, error: noPend })).toEqual({
      texto: noPend,
      incierto: false,
      refrescar: true,
      releer: false,
    });
    const efectivo =
      "No se registró el gasto: el gasto se pagó con Efectivo, que no pasa por el banco: se vincula cargo por cargo con su justificación (menú ⋯ → Vincular gasto → «Incluir gastos en efectivo y otros medios»).";
    expect(mensajeErrorCrearSuma({ ok: false, code: "GASTO_NO_BANCARIO", status: 409, error: efectivo })).toEqual({
      texto: efectivo,
      incierto: false,
      refrescar: false,
      releer: false,
    });
    const enUso = "Esa captura ya registró un gasto con otros datos: búscalo en Gastos antes de volver a intentarlo.";
    expect(mensajeErrorCrearSuma({ ok: false, code: "CLIENT_REQUEST_ID_EN_USO", status: 409, error: enUso })).toEqual({
      texto: enUso,
      incierto: false,
      refrescar: true,
      releer: true,
    });
    expect(mensajeErrorCrearSuma({ ok: false, code: "MOVIMIENTO_OMITIDO", status: 409, error: "No se registró el gasto: este movimiento se omitió…" }).refrescar).toBe(true);
    // Un 4xx sin texto útil (técnico) o con el código pegado.
    expect(mensajeErrorCrearSuma({ ok: false, status: 409, error: "Conflict" }).texto).toBe(TEXTO_RECHAZO_CREAR_SUMA);
    expect(
      mensajeErrorCrearSuma({ ok: false, code: "LOTE_INVALIDO", status: 400, error: "LOTE_INVALIDO: Elige de 2 a 50 cargos sin repetir." }).texto,
    ).toBe("Elige de 2 a 50 cargos sin repetir.");
  });
});

describe("paso 4 · los posibles duplicados (mismo monto, ±120 días) y cuándo se puede crear", () => {
  const resp = (extra: Partial<CargosGastosCandidatosResponse> = {}) => ({
    ok: true,
    data: {
      cargos: resumenHsbc(),
      ventana: { desde: "2026-06-02", hasta: "2027-01-28" },
      candidatos: [] as CandidatoGastoPorSuma[],
      truncado: false,
      cargos_con_candidato_propio: [],
      excluidos: [] as ExcluidosCandidatos[],
      excluidos_monto: 752.84,
      ...extra,
    },
  });

  it("la búsqueda es la suma del API como monto", () => {
    expect(qDuplicadosSuma(752.84)).toBe("752.84");
    expect(qDuplicadosSuma(-19.7)).toBe("19.70");
    expect(qDuplicadosSuma(null)).toBe("0.00");
  });

  it("sin respuesta ⇒ «Buscando…»; la lectura caída ⇒ «No se pudieron revisar…» (jamás «no hay ninguno»)", () => {
    expect(estadoDuplicadosSuma(null, 752.84)).toEqual({ tipo: "cargando", texto: TEXTO_BUSCANDO_DUPLICADOS });
    expect(estadoDuplicadosSuma({ ok: false, code: "SIN_CONEXION", error: "x" }, 752.84)).toEqual({
      tipo: "error",
      texto: TEXTO_DUPLICADOS_SUMA_NO_LEIDOS,
      quitarIds: [],
    });
    expect(TEXTO_DUPLICADOS_SUMA_NO_LEIDOS).toBe("No se pudieron revisar los posibles duplicados: vuelve a intentarlo.");
    // Vino sin `excluidos`: no se pudieron revisar los de efectivo ni los ya conciliados.
    const sinExcluidos = resp();
    delete (sinExcluidos.data as Partial<CargosGastosCandidatosResponse>).excluidos;
    expect(estadoDuplicadosSuma(sinExcluidos, 752.84)).toEqual({ tipo: "error", texto: TEXTO_DUPLICADOS_SUMA_NO_LEIDOS, quitarIds: [] });
  });

  it("un cargo que ya no está pendiente: el texto del API y «Quitar…» con su id", () => {
    const e = estadoDuplicadosSuma(
      {
        ok: false,
        code: "MOVIMIENTO_NO_PENDIENTE",
        status: 409,
        error: "No se vinculó ningún cargo: 1 de los 2 ya no está pendiente — 30 sep · I.V.A. $103.84 (ya está vinculado a un gasto). Quítalo de la selección y vuelve a intentarlo.",
        details: { movimientos: [{ id: IVA }] },
      },
      752.84,
    );
    expect(e.tipo).toBe("error");
    if (e.tipo === "error") {
      expect(e.texto.startsWith("No se vinculó ningún cargo: 1 de los 2 ya no está pendiente")).toBe(true);
      expect(e.quitarIds).toEqual([IVA]);
    }
  });

  it("listo: SOLO los del mismo monto (±0.01) y, en ámbar, los del monto que no son del universo (efectivo…)", () => {
    const igual = comida({ id: "aaaa0000-0000-4000-8000-000000000752", monto: 752.84, faltante: 752.84, categoria: "OPERACIONES" });
    const otro = comida({ id: "aaaa0000-0000-4000-8000-000000000750", monto: 750, faltante: 750 });
    const efectivo: ExcluidosCandidatos = {
      motivo: "EFECTIVO_U_OTRO_MEDIO",
      n: 1,
      gastos: [
        {
          id: "e0e0e0e0-0000-4000-8000-000000000752",
          fecha_gasto: "2026-09-29",
          monto: 752.84,
          moneda: "MXN",
          medio_pago: "EFECTIVO",
          categoria: "OPERACIONES",
          vuelo_folio: null,
          vuelo_id: null,
        },
      ],
    };
    const e = estadoDuplicadosSuma(resp({ candidatos: [igual, otro], excluidos: [efectivo] }), 752.84);
    expect(e.tipo).toBe("listo");
    if (e.tipo === "listo") {
      expect(e.duplicados.map((d) => d.id)).toEqual([igual.id]);
      expect(e.avisos).toHaveLength(1);
      expect(e.avisos[0].texto).toContain("en efectivo");
      // Frase de VARIOS cargos: el efectivo se liga cargo por cargo (nunca «muéstralo»).
      expect(e.avisos[0].texto).toContain("vincúlalo cargo por cargo con su justificación");
      expect(e.avisos[0].mostrar).toBeNull();
    }
    const vacio = estadoDuplicadosSuma(resp(), 752.84);
    expect(vacio).toEqual({ tipo: "listo", duplicados: [], avisos: [] });
  });

  it("«Crear el gasto» nunca se apaga: el clic dice por qué (revisando, lectura caída, sin casilla); con todo, null", () => {
    expect(motivoNoCrearSuma({ confirmado: true, duplicados: estadoDuplicadosSuma(null, 1) })).toBe(TEXTO_ESPERA_DUPLICADOS);
    expect(TEXTO_ESPERA_DUPLICADOS).toBe("Espera a que termine la revisión de los posibles duplicados.");
    expect(
      motivoNoCrearSuma({ confirmado: true, duplicados: estadoDuplicadosSuma({ ok: false, error: "fetch failed" }, 1) }),
    ).toBe(TEXTO_DUPLICADOS_SUMA_NO_LEIDOS);
    expect(motivoNoCrearSuma({ confirmado: false, duplicados: estadoDuplicadosSuma(resp(), 752.84) })).toBe(TEXTO_FALTA_CASILLA_SUMA);
    expect(TEXTO_FALTA_CASILLA_SUMA).toBe("Marca la casilla: confirma que revisaste la lista y que el gasto NO está registrado.");
    expect(motivoNoCrearSuma({ confirmado: true, duplicados: estadoDuplicadosSuma(resp(), 752.84) })).toBeNull();
  });
});

describe("paso 4 · paridad con el API (si el repo hermano está al lado)", () => {
  const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
  const leerApi = (rel: string): string | null => {
    const p = path.join(API, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };

  it("los textos del alta por la suma, el DTO de la llave y los códigos que el panel distingue", () => {
    const util = leerApi("modules/conciliacion/cargos-a-gasto.util.ts");
    const dto = leerApi("modules/expenses/dto/expenses.dto.ts");
    const servicio = leerApi("modules/expenses/expenses.service.ts");
    const ctrl = leerApi("modules/expenses/expenses.controller.ts");
    if (!util || !dto || !servicio || !ctrl) return;
    expect(util).toContain(`'${MSG_LLAVE_CAPTURA_REQUERIDA}'`);
    // El 400 INVENTARIO_NO_DESDE_CARGOS sigue en el API (bloque `inventario`
    // deprecado el 21-oct-2026); el panel ya no lo manda ni lo traduce.
    expect(util).toContain(
      "'Una refacción que entra a Inventario/Tienda no se registra desde varios cargos: regístrala en Gastos y vincula los cargos después.'",
    );
    expect(util).toContain("'Esa captura ya registró un gasto con otros datos: búscalo en Gastos antes de volver a intentarlo.'");
    expect(util).toContain("export const PREFIJO_NO_SE_REGISTRO = 'No se registró el gasto: ';");
    expect(dto).toContain("conciliar_con_movimientos?: string[];");
    expect(dto).toContain(`'${MSG_CARGO_INVALIDO}'`);
    expect(dto).toMatch(/@ArrayMinSize\(CARGOS_A_GASTO_MIN, \{ message: MENSAJE_LOTE_CARGOS_INVALIDO \}\)/);
    for (const codigo of ["GASTO_SIN_VINCULAR", "GASTO_NO_REGISTRADO", "CLIENT_REQUEST_ID_EN_USO", "CLIENT_REQUEST_ID_REQUERIDO"]) {
      expect(servicio).toContain(`error: '${codigo}'`);
    }
    expect(ctrl).toContain("error: 'CONCILIAR_SOLO_ADMIN_FACTURACION'");
  });
});
