/**
 * Cargo devuelto ↔ su devolución (30-sep-2026, API 0.0.44).
 *
 * Pregunta del cliente: «¿Cómo puedo conciliar los cargos reembolsados?».
 * Caso REAL de prod (cuenta GASTOS GNRAL): 8 cargos «ASUR CANCUN» de $825.13
 * el 21-sep (1 ya con su gasto) y 7 abonos «CARGO INDEBIDO 21 SEP 355xx» el
 * 23-sep con la misma referencia. Se custodian aquí los helpers PUROS:
 * detección de la descripción (espejo del API), pista de fecha, orden de
 * candidatos, textos y errores.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIRMAR_EMPAREJAR_AUTO,
  ETIQUETA_REVERSO,
  PATRONES_DEVOLUCION,
  abonosCandidatosParaCargo,
  candidatosDeRespuesta,
  candidatosIndistinguibles,
  coincidePista,
  descripcionDialogoReverso,
  diaCorto,
  diaMasReverso,
  esConciliadoPorReverso,
  esDescripcionDevolucion,
  mensajeErrorReverso,
  ayudaClasificarSoloUno,
  candidatoPreseleccionado,
  cargoParaEmparejarSolo,
  esApiSinReverso,
  textoIndistinguibles,
  textoVariosCargosPosibles,
  ordenarCargosParaAbono,
  pistaFechaDevolucion,
  pistaPendienteDevolucion,
  resumenReversosAuto,
  textoAlcanceAuto,
  textoConfirmarQuitarReverso,
  textoParejaReverso,
  textoSinCandidatosReverso,
  tituloParejaReverso,
  toastEmparejado,
  type MovimientoReversoInfo,
} from "@/lib/admin/conciliacion-reverso";
import { etiquetaCriterio, resumenAutoMatch, resumenImportJob } from "@/lib/admin/conciliacion-auto";
import { CLASIFICACION_REVERSO } from "@/lib/admin/ingresos-ui";

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const OTRA_CUENTA = "0b5d1c2e-1111-4a7b-8c9d-0e1f2a3b4c5d";

const base = {
  cuenta_bancaria_id: CUENTA,
  monto: "825.13",
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  cobro_grupo_id: null,
  ingreso_id: null,
  clasificacion_id: null,
  notas: null,
};

/** Un cargo «ASUR CANCUN» del 21-sep (prod). */
const CARGO_21: MovimientoReversoInfo = {
  ...base,
  id: "9d022c9a-c191-427b-94a7-b4e6d2f9e2f3",
  tipo: "CARGO",
  fecha: "2026-09-21",
  descripcion: "ASUR CANCUN",
  referencia: "00000000529137612263",
};

/** Los 7 abonos del 23-sep (prod), misma referencia. */
const ABONOS_23: MovimientoReversoInfo[] = [
  ["405466de-599b-4c0e-b2df-203133282530", "35552"],
  ["35d5c5eb-ebf6-4959-a22a-e5282cde329d", "35554"],
  ["e9eae31a-8fbb-49ac-a156-f3b62b808212", "35555"],
  ["c377b91a-b0dd-46e5-92a1-1d5267ed1007", "35564"],
  ["db3c10e9-f67f-4c7c-a238-83d44a8f3f3b", "35572"],
  ["52249ccb-76a7-4634-8bfb-1ccf784667fd", "35578"],
  ["eb3467a3-7d15-4a73-8ac5-7010dde4ec39", "35579"],
].map(([id, sufijo]) => ({
  ...base,
  id,
  tipo: "ABONO",
  fecha: "2026-09-23",
  descripcion: `CARGO INDEBIDO 21 SEP ${sufijo}`,
  referencia: "00000000001303268115",
}));

describe("descripción de una devolución (espejo del API)", () => {
  it("la lista de frases es la del contrato", () => {
    expect([...PATRONES_DEVOLUCION]).toEqual([
      "CARGO INDEBIDO",
      "DEVOLUCION",
      "REVERSO",
      "CONTRACARGO",
      "ABONO POR ACLARACION",
      "RECLAMACION",
    ]);
  });

  it("reconoce las del banco, sin acentos ni mayúsculas", () => {
    expect(esDescripcionDevolucion("CARGO INDEBIDO 21 SEP 35552")).toBe(true);
    expect(esDescripcionDevolucion("Devolución de compra")).toBe(true);
    expect(esDescripcionDevolucion("REVERSO OPERACION 1234")).toBe(true);
    expect(esDescripcionDevolucion("contracargo visa")).toBe(true);
    expect(esDescripcionDevolucion("ABONO POR ACLARACIÓN 99")).toBe(true);
    expect(esDescripcionDevolucion("RECLAMACIÓN 8812")).toBe(true);
    expect(esDescripcionDevolucion("cargo   indebido")).toBe(true);
  });

  it("espejo del API: inicio de palabra y el prefijo «REV …» del banco", () => {
    // «DEVOLUCIONES» entra (inicio de palabra); a media palabra, no.
    expect(esDescripcionDevolucion("DEVOLUCIONES VARIAS")).toBe(true);
    expect(esDescripcionDevolucion("IRREVERSO 1234")).toBe(false);
    expect(esDescripcionDevolucion("PAGODEVOLUCION")).toBe(false);
    // `patronReverso` del API: «REV ASUR MERIDA», «REV.DLO*DIDI PAYIN».
    expect(esDescripcionDevolucion("REV ASUR MERIDA")).toBe(true);
    expect(esDescripcionDevolucion("REV.DLO*DIDI PAYIN")).toBe(true);
    expect(esDescripcionDevolucion("Rev ASUR Cancun")).toBe(true);
    expect(esDescripcionDevolucion("REVOLVENTE 55")).toBe(false);
    expect(esDescripcionDevolucion("PREVIO 55")).toBe(false);
  });

  it("no confunde un cargo, un traspaso o un vacío", () => {
    expect(esDescripcionDevolucion("ASUR CANCUN")).toBe(false);
    expect(esDescripcionDevolucion("TRASPASO A CUENTA 1234")).toBe(false);
    expect(esDescripcionDevolucion("")).toBe(false);
    expect(esDescripcionDevolucion(null)).toBe(false);
  });

  it("pista de fecha: «21 SEP» ⇒ 21 de septiembre (el sufijo 35552 no es fecha)", () => {
    expect(pistaFechaDevolucion("CARGO INDEBIDO 21 SEP 35552")).toEqual({ dia: 21, mes: 9 });
    expect(pistaFechaDevolucion("DEVOLUCION 5 ENE")).toEqual({ dia: 5, mes: 1 });
    expect(pistaFechaDevolucion("CARGO INDEBIDO 21SEPT")).toEqual({ dia: 21, mes: 9 });
    expect(pistaFechaDevolucion("DEVOLUCION 5 SEPTIEMBRE")).toEqual({ dia: 5, mes: 9 });
    expect(pistaFechaDevolucion("CARGO INDEBIDO 21 SEPTIMO")).toBeNull();
    expect(pistaFechaDevolucion("CARGO INDEBIDO 32 SEP")).toBeNull();
    expect(pistaFechaDevolucion("CARGO INDEBIDO 35552")).toBeNull();
    expect(pistaFechaDevolucion(null)).toBeNull();
  });

  it("coincidePista compara mes y día del DATE", () => {
    const pista = pistaFechaDevolucion("CARGO INDEBIDO 21 SEP 35552");
    expect(coincidePista(pista, "2026-09-21")).toBe(true);
    expect(coincidePista(pista, "2026-09-22")).toBe(false);
    expect(coincidePista(null, "2026-09-21")).toBe(false);
  });
});

describe("fechas", () => {
  it("«21 sep» sin correr el día (DATE a mediodía UTC)", () => {
    expect(diaCorto("2026-09-21")).toBe("21 sep");
    expect(diaCorto("2026-09-01")).toBe("1 sep");
    expect(diaCorto("basura")).toBe("");
    expect(diaCorto(null)).toBe("");
  });

  it("± días sobre el día de pared, cruzando mes y año", () => {
    expect(diaMasReverso("2026-09-21", 60)).toBe("2026-11-20");
    expect(diaMasReverso("2026-12-15", 60)).toBe("2027-02-13");
    expect(diaMasReverso("2026-09-23", -60)).toBe("2026-07-25");
  });
});

describe("la fila conciliada por reverso", () => {
  const abonoPareado: MovimientoReversoInfo = {
    ...ABONOS_23[0],
    conciliado: true,
    clasificacion_id: "c1",
    reverso_de_id: CARGO_21.id,
    reverso_de: { id: CARGO_21.id, fecha: "2026-09-21", descripcion: "ASUR CANCUN" },
    notas: "Devuelve el cargo del 21-09 · ASUR CANCUN",
  };
  const cargoPareado: MovimientoReversoInfo = {
    ...CARGO_21,
    conciliado: true,
    clasificacion_id: "c1",
    revertido_por: { id: ABONOS_23[0].id, fecha: "2026-09-23", descripcion: "CARGO INDEBIDO 21 SEP 35552" },
  };

  it("API previo (sin aditivos) ⇒ no está emparejado: la fila queda como antes", () => {
    expect(esConciliadoPorReverso({ ...CARGO_21, conciliado: true, clasificacion_id: "c1" })).toBe(false);
    expect(esConciliadoPorReverso(abonoPareado)).toBe(true);
    expect(esConciliadoPorReverso(cargoPareado)).toBe(true);
    expect(esConciliadoPorReverso({ ...ABONOS_23[1], reverso_de_id: CARGO_21.id })).toBe(true);
  });

  it("dice la OTRA fecha y descripción", () => {
    expect(textoParejaReverso(abonoPareado)).toBe("devuelve el cargo del 21 sep · ASUR CANCUN");
    expect(textoParejaReverso(cargoPareado)).toBe("devuelto el 23 sep · CARGO INDEBIDO 21 SEP 35552");
    expect(textoParejaReverso({ ...ABONOS_23[1], reverso_de_id: CARGO_21.id })).toBe(
      "devuelve un cargo de esta cuenta",
    );
  });

  it("«Conciliado con: Reverso de un cargo · …» + las notas en otra línea", () => {
    expect(ETIQUETA_REVERSO).toBe(CLASIFICACION_REVERSO);
    expect(tituloParejaReverso(abonoPareado)).toBe(
      "Conciliado con: Reverso de un cargo · devuelve el cargo del 21 sep · ASUR CANCUN\nDevuelve el cargo del 21-09 · ASUR CANCUN",
    );
    expect(tituloParejaReverso(cargoPareado, "Reverso de un cargo")).toBe(
      "Conciliado con: Reverso de un cargo · devuelto el 23 sep · CARGO INDEBIDO 21 SEP 35552",
    );
  });

  it("quitar confirma que LOS DOS vuelven a pendiente (desde cualquiera de los dos)", () => {
    const esperado =
      "El cargo del 21 sep y su devolución del 23 sep vuelven a quedar Pendientes de conciliar (los dos, no solo esta línea).";
    expect(textoConfirmarQuitarReverso(abonoPareado)).toContain(esperado);
    expect(textoConfirmarQuitarReverso(cargoPareado)).toContain(esperado);
  });
});

describe("textos del diálogo y del toast", () => {
  it("sin candidatos: el texto del contrato", () => {
    expect(textoSinCandidatosReverso("ABONO", "825.13")).toBe(
      "No hay cargos pendientes por $825.13 en los últimos 60 días",
    );
    expect(textoSinCandidatosReverso("CARGO", 825.13)).toBe(
      "No hay abonos pendientes por $825.13 en los 60 días siguientes",
    );
  });

  it("toast: «Cargo del 21 sep y su devolución conciliados»", () => {
    const t = toastEmparejado("2026-09-21");
    expect(t.titulo).toBe("Cargo del 21 sep y su devolución conciliados");
    expect(t.descripcion).toContain("no cuentan como gasto ni como ingreso");
  });

  it("la descripción dice de qué movimiento se parte y qué va a pasar", () => {
    expect(descripcionDialogoReverso(ABONOS_23[0])).toBe(
      "Abono de $825.13 del 23 sep 2026 · CARGO INDEBIDO 21 SEP 35552. Elige el cargo que el banco devolvió: los dos quedan conciliados como «Reverso de un cargo» y no cuentan como gasto ni como ingreso.",
    );
    expect(descripcionDialogoReverso(CARGO_21, "MXN")).toContain("Cargo de $825.13 MXN del 21 sep 2026 · ASUR CANCUN.");
  });

  it("confirmación del lote: texto EXACTO del contrato y alcance", () => {
    expect(CONFIRMAR_EMPAREJAR_AUTO).toBe(
      "Se emparejarán automáticamente las devoluciones del banco con su cargo (mismo monto, ±60 días). ¿Continuar?",
    );
    // Sin rango en la vista el API toma los abonos de los últimos 90 días:
    // se dice (antes solo «Todas las cuentas.», y sonaba a TODO el historial).
    expect(textoAlcanceAuto({})).toBe("Todas las cuentas · abonos de los últimos 90 días.");
    expect(textoAlcanceAuto({ cuenta: "GASTOS GNRAL", desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "Cuenta: GASTOS GNRAL · del 01 sep 2026 al 30 sep 2026.",
    );
  });

  it("pista en la fila pendiente: solo ABONO pendiente que dice devolución", () => {
    expect(pistaPendienteDevolucion(ABONOS_23[0])?.etiqueta).toBe("Parece devolución");
    expect(pistaPendienteDevolucion(ABONOS_23[0])?.detalle).toContain("«Es la devolución de un cargo»");
    expect(pistaPendienteDevolucion(CARGO_21)).toBeNull();
    expect(pistaPendienteDevolucion({ ...ABONOS_23[0], conciliado: true })).toBeNull();
    expect(pistaPendienteDevolucion({ ...ABONOS_23[0], descripcion: "SPEI CLIENTE" })).toBeNull();
  });
});

describe("candidatos", () => {
  it("respuesta tolerante: arreglo, {candidatos} o {data}; basura ⇒ []", () => {
    const c = { id: CARGO_21.id, fecha: "2026-09-21", descripcion: "ASUR CANCUN", referencia: "1", monto: "825.13" };
    expect(candidatosDeRespuesta([c])).toHaveLength(1);
    expect(candidatosDeRespuesta({ candidatos: [c] })).toHaveLength(1);
    expect(candidatosDeRespuesta({ data: [c, { nada: 1 }] })).toHaveLength(1);
    expect(candidatosDeRespuesta(null)).toEqual([]);
    expect(candidatosDeRespuesta({ candidatos: "x" })).toEqual([]);
  });

  it("desde el ABONO: los cargos del día que dice la descripción van primero", () => {
    // El API ordena por fecha desc: un cargo del 22-sep del mismo monto
    // saldría primero; «CARGO INDEBIDO 21 SEP» dice que el devuelto es del 21.
    const del22 = { id: "a", fecha: "2026-09-22", descripcion: "ASUR CANCUN", referencia: null, monto: "825.13" };
    const del21 = { id: "b", fecha: "2026-09-21", descripcion: "ASUR CANCUN", referencia: null, monto: "825.13" };
    const del20 = { id: "c", fecha: "2026-09-20", descripcion: "ASUR CANCUN", referencia: null, monto: "825.13" };
    expect(ordenarCargosParaAbono(ABONOS_23[0], [del22, del21, del20]).map((c) => c.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    // Sin pista, el orden del API tal cual.
    expect(
      ordenarCargosParaAbono({ descripcion: "DEVOLUCION" }, [del22, del21, del20]).map((c) => c.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("desde el CARGO: misma cuenta, mismo monto, del día del cargo a +60, pendientes; devoluciones primero", () => {
    const noDevolucion = { ...ABONOS_23[0], id: "n1", fecha: "2026-09-22", descripcion: "SPEI CLIENTE" };
    const otraFecha = { ...ABONOS_23[0], id: "n2", fecha: "2026-09-22", descripcion: "DEVOLUCION 18 SEP" };
    const excluidos: MovimientoReversoInfo[] = [
      { ...ABONOS_23[0], id: "x1", conciliado: true, clasificacion_id: "c1" },
      { ...ABONOS_23[0], id: "x2", cuenta_bancaria_id: OTRA_CUENTA },
      { ...ABONOS_23[0], id: "x3", monto: "825.20" },
      { ...ABONOS_23[0], id: "x4", fecha: "2026-09-20" },
      { ...ABONOS_23[0], id: "x5", fecha: "2026-11-21" },
      { ...ABONOS_23[0], id: "x6", ingreso_id: "i1" },
      { ...ABONOS_23[0], id: "x7", reverso_de_id: "otro" },
      { ...CARGO_21, id: "x8" },
    ];
    const r = abonosCandidatosParaCargo(CARGO_21, [
      noDevolucion,
      ...excluidos,
      otraFecha,
      ...[...ABONOS_23].reverse(),
    ]);
    expect(r.map((c) => c.id)).toEqual([
      // Las 7 del 23-sep dicen «21 SEP» = el día del cargo (orden por descripción).
      ...ABONOS_23.map((a) => a.id),
      // Devolución de OTRO día.
      "n2",
      // Lo que no dice devolución, al final.
      "n1",
    ]);
    expect(r[0]).toEqual({
      id: ABONOS_23[0].id,
      fecha: "2026-09-23",
      descripcion: "CARGO INDEBIDO 21 SEP 35552",
      referencia: "00000000001303268115",
      monto: "825.13",
    });
  });

  it("monto con tolerancia de medio centavo (la del trigger)", () => {
    const r = abonosCandidatosParaCargo(CARGO_21, [
      { ...ABONOS_23[0], monto: 825.134 },
      { ...ABONOS_23[1], monto: "825.136" },
    ]);
    expect(r.map((c) => c.id)).toEqual([ABONOS_23[0].id]);
  });

  it("`sugerido` del API: se conserva, se preselecciona y decide el emparejado sin diálogo", () => {
    const a = { id: "a", fecha: "2026-09-21", descripcion: "ASUR CANCUN", referencia: null, monto: "825.13" };
    const b = { ...a, id: "b", sugerido: true };
    const cands = candidatosDeRespuesta([a, b, { ...a, id: "c", sugerido: "si" }]);
    expect(cands.map((c) => c.sugerido ?? false)).toEqual([false, true, false]);
    expect(candidatoPreseleccionado(cands)).toBe("b");
    expect(candidatoPreseleccionado(candidatosDeRespuesta([a]))).toBe("a");
    expect(candidatoPreseleccionado([])).toBe("");
    expect(cargoParaEmparejarSolo(cands)).toBe("b");
    expect(cargoParaEmparejarSolo(candidatosDeRespuesta([a]))).toBe("a");
    // Varios sin sugerencia: el panel no adivina.
    expect(cargoParaEmparejarSolo(candidatosDeRespuesta([a, { ...a, id: "z" }]))).toBeNull();
    expect(cargoParaEmparejarSolo([])).toBeNull();
    expect(textoVariosCargosPosibles(3)).toBe(
      "Hay 3 cargos posibles por el mismo monto: emparéjala a mano desde el menú (⋯) → «Es la devolución de un cargo».",
    );
  });

  it("candidatos idénticos: el texto correcto desde cada lado", () => {
    expect(textoIndistinguibles(7, "ABONO")).toBe(
      "Los 7 cargos son iguales (misma fecha, monto y descripción): da lo mismo cuál elijas; los demás quedan para las otras devoluciones.",
    );
    expect(textoIndistinguibles(7, "CARGO")).toContain("los demás quedan para los otros cargos");
  });

  it("clasificar solo un lado: desde el cargo se recomienda ESPERAR la devolución", () => {
    expect(ayudaClasificarSoloUno("ABONO")).toContain("el cargo no está en el sistema");
    expect(ayudaClasificarSoloUno("CARGO")).toContain("mejor espera");
    expect(ayudaClasificarSoloUno("CARGO")).toContain("«Emparejar devoluciones»");
  });

  it("los 7 «ASUR CANCUN» del 21-sep son indistinguibles; las devoluciones no", () => {
    const cargos = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      fecha: "2026-09-21",
      descripcion: "ASUR CANCUN",
      referencia: `r${i}`,
      monto: "825.13",
    }));
    expect(candidatosIndistinguibles(cargos)).toBe(true);
    expect(candidatosIndistinguibles(cargos.slice(0, 1))).toBe(false);
    expect(candidatosIndistinguibles(abonosCandidatosParaCargo(CARGO_21, ABONOS_23))).toBe(false);
  });
});

describe("errores del API", () => {
  it("ruta inexistente (API previo): lo dice y ofrece clasificar a mano", () => {
    const e = mensajeErrorReverso({
      status: 404,
      code: "NOT_FOUND",
      error: "Cannot POST /v1/conciliacion/movimientos/x/reverso",
    });
    expect(e.apiSinRuta).toBe(true);
    expect(e.titulo).toContain("falta actualizar el API");
    expect(e.descripcion).toContain("«Reverso de un cargo»");
  });

  it("409 REVERSO_INVALIDO: el motivo del trigger manda y se recarga", () => {
    const e = mensajeErrorReverso({
      status: 409,
      code: "REVERSO_INVALIDO",
      error: "No se pudo emparejar.",
      details: { motivo: "El cargo ya está ligado a un gasto." },
    });
    expect(e.descripcion).toBe("El cargo ya está ligado a un gasto.");
    expect(e.recargar).toBe(true);
    expect(mensajeErrorReverso({ status: 409, error: "El monto no coincide." }).descripcion).toBe(
      "El monto no coincide.",
    );
  });

  it("503 REVERSOS_NO_DISPONIBLE (migración pendiente) = la misma salida que el API previo", () => {
    const r = {
      status: 503,
      code: "REVERSOS_NO_DISPONIBLE",
      error: "El emparejado de cargos devueltos todavía no está habilitado en la base de datos…",
    };
    expect(esApiSinReverso(r)).toBe(true);
    const e = mensajeErrorReverso(r);
    expect(e.apiSinRuta).toBe(true);
    expect(e.titulo).toContain("todavía no está habilitado");
    expect(e.descripcion).toContain("«Clasificar (no es de un vuelo)»");
    // Un 503 de Railway en un deploy NO es «falta la migración».
    expect(esApiSinReverso({ status: 503, code: "PARSE_ERROR", error: "Service Unavailable" })).toBe(false);
    expect(esApiSinReverso({ status: 404, code: "NOT_FOUND", error: "Movimiento no encontrado" })).toBe(false);
  });

  it("ya conciliado (lectura de candidatos o carrera): lo dice y recarga", () => {
    const e = mensajeErrorReverso({
      status: 409,
      code: "MOVIMIENTO_YA_LIGADO",
      error: "Ese movimiento ya está conciliado: quítale la conciliación antes de emparejarlo.",
    });
    expect(e.titulo).toBe("Este movimiento ya está conciliado");
    expect(e.descripcion).toContain("quítale la conciliación");
    expect(e.recargar).toBe(true);
  });

  it("jamás un texto técnico en inglés o de red", () => {
    for (const r of [
      { status: 502, code: "PARSE_ERROR", error: "Bad Gateway" },
      { status: 503, code: "PARSE_ERROR", error: "Service Unavailable" },
      { error: "fetch failed" },
      // La server action misma no salió (navegador sin red / Vercel cortó).
      { error: "Failed to fetch" },
      { error: "An unexpected response was received from the server." },
      { status: 500, code: "INTERNAL_ERROR", error: "Internal server error" },
      { status: 500 },
    ]) {
      const e = mensajeErrorReverso(r);
      expect(e.titulo).toContain("El servidor no respondió");
      expect(e.apiSinRuta).toBe(false);
    }
    // El texto del API en español sí se pinta tal cual.
    expect(mensajeErrorReverso({ status: 500, code: "REVERSO_A_MEDIAS", error: "El emparejado quedó a medias." }).titulo).toBe(
      "El emparejado quedó a medias.",
    );
  });

  it("404 de registro, 403, 401 y genérico", () => {
    const n = mensajeErrorReverso({ status: 404, code: "NOT_FOUND", error: "Movimiento no encontrado" });
    expect(n.apiSinRuta).toBe(false);
    expect(n.recargar).toBe(true);
    expect(mensajeErrorReverso({ status: 403 }).titulo).toBe("Tu usuario no puede conciliar movimientos del banco.");
    expect(mensajeErrorReverso({ status: 401 }).titulo).toContain("sesión");
    expect(mensajeErrorReverso({ status: 500, error: "Falló" }).titulo).toBe("Falló");
  });
});

describe("«Emparejar devoluciones» (lote)", () => {
  it("el caso real: 7 emparejadas", () => {
    const r = resumenReversosAuto({ emparejados: 7, sin_candidato: 0, ambiguos: 0 });
    expect(r.titulo).toBe("7 devoluciones quedaron conciliadas con su cargo");
    expect(r.tono).toBe("exito");
    expect(r.lineas).toEqual([]);
  });

  it("singular, nada que hacer y lo que quedó pendiente", () => {
    expect(resumenReversosAuto({ emparejados: 1, sin_candidato: 0, ambiguos: 0 }).titulo).toBe(
      "1 devolución quedó conciliada con su cargo",
    );
    expect(resumenReversosAuto({ emparejados: 0, sin_candidato: 0, ambiguos: 0 }).titulo).toBe(
      "No había devoluciones del banco pendientes de emparejar",
    );
    const r = resumenReversosAuto({ emparejados: 0, sin_candidato: 2, ambiguos: 1 });
    expect(r.titulo).toBe("Ninguna devolución se pudo emparejar sola");
    expect(r.tono).toBe("info");
    expect(r.lineas[0]).toContain("2 sin cargo pendiente");
    expect(r.lineas[1]).toContain("1 con varios cargos posibles");
    expect(r.lineas[1]).toContain("«Es la devolución de un cargo»");
    expect(resumenReversosAuto(null).titulo).toBe("No había devoluciones del banco pendientes de emparejar");
  });

  it("«Cruzar pendientes» nombra el criterio REVERSO y el conteo aditivo", () => {
    expect(etiquetaCriterio("REVERSO")).toBe("devolución de un cargo");
    // El API cuenta por MOVIMIENTO (`ConteoCruce`): las 7 parejas del caso
    // real son 14 movimientos. Decir «14 devoluciones emparejadas» sería el
    // doble (revisión adversaria 30-sep-2026).
    const r = resumenAutoMatch({
      revisados: 30,
      conciliados: 5,
      reversos: 14,
      por_criterio: { MONTO_EXACTO: 5, REVERSO: 14 },
    });
    expect(r.lineas).toContain(
      "14 movimientos conciliados como cargo devuelto o su devolución (no son gasto ni ingreso)",
    );
    expect(r.lineas.join(" ")).not.toContain("devoluciones emparejadas");
    expect(r.lineas).toContain("Devolución de un cargo 14 · monto exacto 5");
    expect(r.pendientes).toBe(11);
    expect(
      resumenImportJob({ estado: "COMPLETADO", importados: 20, conciliados: 2, reversos: 2 }).descripcion,
    ).toContain("2 movimientos conciliados como cargo devuelto o su devolución");
    // Sin el aditivo, como antes.
    expect(resumenAutoMatch({ revisados: 4, conciliados: 1 }).pendientes).toBe(3);
  });
});
