import { describe, expect, it } from "vitest";
import {
  alternativasDePropuesta,
  descripcionCandidatoGasto,
  diaMas,
  etiquetaCandidatoGasto,
  etiquetaCriterio,
  gastoDePropuesta,
  lineaCriterios,
  motivoMasComun,
  motivoPendienteDe,
  normalizaCodigo,
  primeraLinea,
  reglaAutomaticaDe,
  resumenAutoMatch,
  resumenImportJob,
  textoConfianza,
  tonoMotivo,
} from "@/lib/admin/conciliacion-auto";

describe("motivoPendienteDe", () => {
  it("no dice nada de un movimiento ya conciliado", () => {
    expect(motivoPendienteDe({ conciliado: true, motivo_pendiente: "AMBIGUO" })).toBeNull();
  });

  it("sin aditivos del API (skew de deploy) devuelve null: no se inventa el motivo", () => {
    expect(motivoPendienteDe({ conciliado: false })).toBeNull();
    expect(motivoPendienteDe(null)).toBeNull();
  });

  it("ambiguo dice entre cuántos (el caso de los dos cargos de Cozumel)", () => {
    const m = motivoPendienteDe({ conciliado: false, motivo_pendiente: "AMBIGUO", candidatos_n: 2 });
    expect(m?.codigo).toBe("AMBIGUO");
    expect(m?.etiqueta).toBe("Ambiguo entre 2");
    expect(m?.candidatos).toBe(2);
    expect(tonoMotivo(m!.codigo)).toBe("ambar");
  });

  it("acepta el singular del API y el alias de `sugerir`", () => {
    expect(motivoPendienteDe({ motivo_pendiente: "SIN_CANDIDATO" })?.codigo).toBe("SIN_CANDIDATOS");
    expect(motivoPendienteDe({ motivo_sin_match: "sin candidatos" })?.codigo).toBe(
      "SIN_CANDIDATOS",
    );
  });

  it("el error de UN movimiento se explica sin tumbar el lote", () => {
    const m = motivoPendienteDe({
      motivo_pendiente: "ERROR",
      auto_match_error: "operator does not exist: public.moneda = text",
    });
    expect(m?.codigo).toBe("ERROR");
    expect(m?.etiqueta).toBe("Error al cruzar");
    expect(m?.detalle).toContain("public.moneda = text");
    expect(tonoMotivo(m!.codigo)).toBe("rojo");
  });

  it("deduce el motivo cuando solo llega el número de candidatos", () => {
    expect(motivoPendienteDe({ candidatos_n: 0 })?.codigo).toBe("SIN_CANDIDATOS");
    expect(motivoPendienteDe({ candidatos_n: 1 })?.etiqueta).toBe("1 candidato");
    expect(motivoPendienteDe({ candidatos_n: 3 })?.etiqueta).toBe("Ambiguo entre 3");
  });

  it("un código desconocido no rompe la tabla", () => {
    expect(motivoPendienteDe({ motivo_pendiente: "COSA_RARA" })?.etiqueta).toBe("COSA_RARA");
    const frase = motivoPendienteDe({
      motivo_pendiente: "el gasto vive en otra moneda",
    });
    expect(frase?.etiqueta).toBe("Pendiente");
    expect(frase?.detalle).toBe("el gasto vive en otra moneda");
  });

  it("normalizaCodigo quita acentos y espacios", () => {
    expect(normalizaCodigo(" ambigüo entre dos ")).toBe("AMBIGUO_ENTRE_DOS");
  });
});

describe("resumenAutoMatch", () => {
  it("canta el resultado por resultado y nunca esconde los errores", () => {
    const r = resumenAutoMatch({
      revisados: 44,
      conciliados: 21,
      ambiguos: 6,
      sin_candidato: 15,
      traspasos: 2,
      errores: 1,
      por_criterio: { MONTO: 15, TARJETA: 4, DESCRIPCION: 2 },
    });
    expect(r.titulo).toBe("21 de 44 pendientes quedaron conciliados");
    expect(r.conciliados).toBe(21);
    expect(r.hayErrores).toBe(true);
    expect(r.descripcion).toContain("2 traspasos clasificados por regla");
    expect(r.descripcion).toContain("6 ambiguos");
    expect(r.descripcion).toContain("15 sin candidato");
    expect(r.descripcion).toContain("1 con error");
    expect(r.descripcion).toContain("Monto exacto 15");
    expect(r.descripcion).toContain("terminación de tarjeta 4");
  });

  it("sin pendientes lo dice en vez de cantar un 0 confuso", () => {
    expect(resumenAutoMatch({ revisados: 0, conciliados: 0 }).titulo).toBe(
      "No había movimientos pendientes en ese rango",
    );
    expect(resumenAutoMatch({ revisados: 5, conciliados: 0 }).titulo).toBe(
      "Ninguno de los 5 pendientes pudo cruzarse solo",
    );
  });

  it("lineaCriterios ordena por volumen y traduce el código", () => {
    expect(lineaCriterios({ TARJETA: 2, MONTO: 9, VACIO: 0 })).toBe(
      "Monto exacto 9 · terminación de tarjeta 2",
    );
    expect(lineaCriterios(null)).toBeNull();
    expect(etiquetaCriterio("REGLA")).toBe("regla automática");
    expect(etiquetaCriterio("LO_QUE_SEA")).toBe("LO_QUE_SEA");
    expect(etiquetaCriterio(null)).toBe("cruce automático");
  });
});

describe("resumenImportJob", () => {
  it("un job interrumpido NO invita a reimportar: invita a re-cruzar", () => {
    const r = resumenImportJob({
      estado: "ERROR",
      importados: 101,
      conciliados_auto: 0,
      error: "operator does not exist: public.moneda = text",
    });
    expect(r.tono).toBe("error");
    expect(r.titulo).toBe("La importación se interrumpió");
    expect(r.descripcion).toContain("101 movimientos ya entraron");
    expect(r.descripcion).toContain("no vuelvas a importar");
    expect(r.sugerirRecruce).toBe(true);
  });

  it("re-subir el mismo archivo se explica como duplicado", () => {
    const r = resumenImportJob({
      estado: "LISTO",
      importados: 0,
      conciliados_auto: 0,
      duplicados_omitidos: 101,
    });
    expect(r.titulo).toContain("101 movimientos ya estaban importados");
    expect(r.tono).toBe("info");
  });

  it("resume la importación normal por resultado, con el error más común", () => {
    const r = resumenImportJob({
      estado: "LISTO",
      importados: 67,
      conciliados_auto: 40,
      ambiguos: 5,
      sin_candidato: 20,
      traspasos: 2,
      errores: 2,
      errores_detalle: [
        { error: "timeout de PostgREST" },
        { error: "Timeout de PostgREST" },
        { error: "otro" },
      ],
      por_criterio: { MONTO: 36, TARJETA: 4 },
    });
    expect(r.titulo).toBe("Importados 67 · conciliados automáticamente 40");
    expect(r.descripcion).toContain("2 movimientos con error");
    expect(r.descripcion).toContain("timeout de PostgREST");
    expect(r.descripcion).toContain("25 quedan pendientes de vincular");
  });

  it("motivoMasComun agrupa sin distinguir mayúsculas ni acentos", () => {
    expect(
      motivoMasComun([{ error: "Sin candidato" }, { error: "sin candidato" }, { error: "x" }]),
    ).toBe("Sin candidato");
    expect(motivoMasComun([])).toBeNull();
    expect(motivoMasComun(null)).toBeNull();
  });
});

describe("textoConfianza", () => {
  it("lee 0..1 y 0..100 y clasifica alta/media/baja", () => {
    expect(textoConfianza(0.92)).toMatchObject({ pct: 92, etiqueta: "Alta", tono: "alta" });
    expect(textoConfianza(92)).toMatchObject({ pct: 92, etiqueta: "Alta" });
    expect(textoConfianza(0.7).etiqueta).toBe("Media");
    expect(textoConfianza(0.3).etiqueta).toBe("Baja");
    expect(textoConfianza(null).pct).toBe(0);
    expect(textoConfianza(0.92).texto).toBe("Confianza alta (92 %)");
  });
});

describe("candidato de gasto (lo que desempata a ojo)", () => {
  const gasto = {
    id: "g1",
    fecha: "2026-09-04",
    monto: "125.82",
    moneda: "MXN",
    categoria: "ATERRIZAJE",
    proveedor: "ASUR",
    lugar: "Aeropuerto de Cozumel",
    notas: "Aeropuerto de Cozumel\nsegunda línea que no se usa",
    tarjeta_terminacion: "0577",
    matricula: "n990gg",
    vuelo_folio: 268,
  };

  it("la etiqueta trae categoría, monto, fecha y proveedor", () => {
    // El mes abreviado lo pone Intl (sep/sept según la versión de ICU): se
    // afirman las partes, no la abreviatura.
    const etiqueta = etiquetaCandidatoGasto(gasto);
    expect(etiqueta.startsWith("Aterrizaje · $125.82 MXN · 04 sep")).toBe(true);
    expect(etiqueta.endsWith("2026 · ASUR")).toBe(true);
  });

  it("la descripción trae terminación, nota, matrícula y vuelo", () => {
    const d = descripcionCandidatoGasto(gasto)!;
    expect(d).toContain("Tarjeta ****0577");
    expect(d).toContain("Aeropuerto de Cozumel");
    expect(d).toContain("N990GG");
    expect(d).toContain("vuelo #268");
    // La nota repetida del lugar no se pinta dos veces.
    expect(d.match(/Aeropuerto de Cozumel/g)?.length).toBe(1);
    expect(d).not.toContain("segunda línea");
  });

  it("marca el pago parcial y el T.C. implícito de un gasto en dólares", () => {
    const d = descripcionCandidatoGasto({
      id: "g2",
      monto: 403.61,
      moneda: "MXN",
      monto_vinculado: 277.79,
      faltante: 125.82,
      tc_implicito: 18.5,
    })!;
    expect(d).toContain("faltan $125.82 de $403.61");
    expect(d).toContain("T.C. 18.50");
  });

  it("un gasto sin datos extra no inventa descripción", () => {
    expect(descripcionCandidatoGasto({ id: "g3", monto: 10 })).toBeNull();
  });

  it("primeraLinea ignora líneas vacías", () => {
    expect(primeraLinea("\n\n  ASA Mérida \notra")).toBe("ASA Mérida");
    expect(primeraLinea(null)).toBeNull();
  });
});

describe("propuestas de la IA", () => {
  const propuesta = {
    movimiento_id: "m1",
    gasto_id_sugerido: "g2",
    confianza: 0.9,
    razon: "La descripción del banco coincide con el lugar del gasto",
    alternativas: [
      { id: "g1", monto: 125.82 },
      { id: "g2", monto: 125.82, tarjeta_terminacion: "0577" },
      { id: "g2", monto: 125.82 },
    ],
  };

  it("encuentra la ficha del gasto propuesto entre las alternativas", () => {
    expect(gastoDePropuesta(propuesta)?.tarjeta_terminacion).toBe("0577");
  });

  it("prefiere la ficha embebida cuando el API la manda", () => {
    expect(
      gastoDePropuesta({ ...propuesta, gasto: { id: "g2", monto: 1, lugar: "ASA Mérida" } })?.lugar,
    ).toBe("ASA Mérida");
  });

  it("sin sugerido no devuelve nada (la IA no propuso)", () => {
    expect(gastoDePropuesta({ movimiento_id: "m1", gasto_id_sugerido: null })).toBeNull();
  });

  it("las alternativas excluyen al sugerido y no se repiten", () => {
    const alt = alternativasDePropuesta(propuesta);
    expect(alt.map((a) => a.id)).toEqual(["g1"]);
  });
});

describe("clasificación automática por regla", () => {
  it("reconoce el traspaso interno clasificado por una regla", () => {
    expect(reglaAutomaticaDe({ notas: "Regla: SEL TRASPASO ENTRE CUENTAS" })).toBe(
      "SEL TRASPASO ENTRE CUENTAS",
    );
    expect(reglaAutomaticaDe({ clasificacion_auto: true })).toBe("regla automática");
  });

  it("lo que clasificó una persona NO se marca como automático", () => {
    expect(reglaAutomaticaDe({ notas: "comisión mensual de la cuenta" })).toBeNull();
    expect(reglaAutomaticaDe(null)).toBeNull();
  });
});

describe("diaMas", () => {
  it("suma y resta días de pared sin correr el mes", () => {
    expect(diaMas("2026-09-15", -30)).toBe("2026-08-16");
    expect(diaMas("2026-08-31", 1)).toBe("2026-09-01");
    expect(diaMas("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("deja pasar lo que no es una fecha", () => {
    expect(diaMas("", 3)).toBe("");
  });
});

/**
 * REVISIÓN ADVERSARIA (15-sep-2026): las cuentas que ve el operador tienen
 * que CUADRAR — revisados = conciliados + traspasos + ambiguos + sin
 * candidato + rechazados + errores — y el motivo nuevo del API («se puede
 * cruzar») debe leerse como acción, no como error.
 */
describe("cuentas completas del cruce (rechazados incluidos)", () => {
  it("el resumen nombra los rechazados: sin ellos las cifras no suman", () => {
    const r = resumenAutoMatch({
      revisados: 44,
      conciliados: 21,
      traspasos: 2,
      ambiguos: 4,
      sin_candidato: 15,
      rechazados: 2,
      errores: 0,
    });
    expect(r.titulo).toContain("21 de 44");
    expect(r.descripcion).toContain("2 con el gasto ya cubierto");
    // 21 + 2 + 4 + 15 + 2 + 0 = 44
    expect(r.pendientes).toBe(21);
  });

  it("la importación también los nombra", () => {
    const r = resumenImportJob({
      estado: "LISTO",
      importados: 10,
      conciliados_auto: 6,
      rechazados: 1,
      sin_candidato: 3,
    });
    expect(r.descripcion).toContain("1 con el gasto ya cubierto");
  });

  it("sin rechazados el texto no cambia", () => {
    const r = resumenAutoMatch({
      revisados: 3,
      conciliados: 3,
      ambiguos: 0,
      sin_candidato: 0,
      errores: 0,
    });
    expect(r.descripcion).not.toContain("cubierto");
  });
});

describe("motivo SE_PUEDE_CRUZAR", () => {
  it("se lee como acción pendiente, no como error", () => {
    const m = motivoPendienteDe({
      conciliado: false,
      motivo_pendiente: "SE_PUEDE_CRUZAR",
      candidatos_n: 1,
    });
    expect(m?.codigo).toBe("SE_PUEDE_CRUZAR");
    expect(m?.etiqueta).toBe("Se puede cruzar");
    expect(m?.detalle).toContain("Cruzar pendientes");
    expect(tonoMotivo(m!.codigo)).toBe("ambar");
  });

  it("acepta el alias CRUZABLE", () => {
    expect(
      motivoPendienteDe({ conciliado: false, motivo_pendiente: "cruzable" })
        ?.codigo,
    ).toBe("SE_PUEDE_CRUZAR");
  });
});

describe("corrida truncada", () => {
  it("avisa que faltan pendientes por revisar", () => {
    const r = resumenAutoMatch({
      revisados: 500,
      conciliados: 100,
      ambiguos: 0,
      sin_candidato: 400,
      errores: 0,
      truncado: true,
    });
    expect(r.descripcion).toContain("vuelve a ejecutarlo");
  });

  it("una corrida completa no lo menciona", () => {
    const r = resumenAutoMatch({
      revisados: 12,
      conciliados: 12,
      ambiguos: 0,
      sin_candidato: 0,
      errores: 0,
    });
    expect(r.descripcion).not.toContain("vuelve a ejecutarlo");
  });
});
