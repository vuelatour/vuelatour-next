/**
 * Inicio oficial del sistema (16-oct-2026, API 0.0.84). Pedido del cliente:
 * «Quitemos todo lo de Agosto … para que iniciemos en septiembre 2026 de
 * forma oficial». La fecha llega del API (`/v1/me` → `config.inicio_oficial`);
 * con `null` (API previo o piso apagado) TODO queda como hoy.
 */
import { describe, expect, it } from "vitest";
import {
  ajustarMesAlInicio,
  ajustarRangoAlInicio,
  atajoAntesDelInicio,
  avisoCapturaAntesDelInicio,
  esAntesDelInicio,
  esMesDelInicioOAnterior,
  etiquetaDesdeInicio,
  fechaInicioCorta,
  inicioOficialDeMe,
  mesesDesdeInicio,
  minFechaFiltro,
  mesInicio,
  normalizarInicioOficial,
  pisoDesde,
  pisoMes,
  recortarAtajos,
  rotuloAcumuladoFinanzas,
  textoArrancaEnMes,
  textoAvisoAjuste,
  textoAvisoCaptura,
  textoChipAntesDelInicio,
  textoDesdeInicio,
  textoFranjaAntesDelInicio,
  textoSaldoInicial,
  vaciarDiasAntesDelInicio,
  ventanaConPiso,
} from "../inicio-oficial";

const INICIO = "2026-09-01";

describe("lectura de la fecha (fuente única: /v1/me)", () => {
  it("sin llave (API previo), sin config, inválida o basura ⇒ null", () => {
    expect(inicioOficialDeMe(undefined)).toBeNull();
    expect(inicioOficialDeMe({})).toBeNull();
    expect(inicioOficialDeMe({ config: null })).toBeNull();
    expect(inicioOficialDeMe({ config: {} })).toBeNull();
    expect(inicioOficialDeMe({ config: { inicio_oficial: null } })).toBeNull();
    expect(inicioOficialDeMe({ config: { inicio_oficial: "2026-02-30" } })).toBeNull();
    expect(inicioOficialDeMe({ config: { inicio_oficial: "2026-09-01T00:00:00Z" } })).toBeNull();
    expect(inicioOficialDeMe({ config: { inicio_oficial: 20260901 } })).toBeNull();
    expect(normalizarInicioOficial("nada")).toBeNull();
  });

  it("válida ⇒ la fecha tal cual", () => {
    expect(inicioOficialDeMe({ config: { inicio_oficial: INICIO } })).toBe(INICIO);
  });
});

describe("ajustarRangoAlInicio (URL vieja o manipulada)", () => {
  it("agosto completo ⇒ el mes del inicio completo, con aviso", () => {
    expect(ajustarRangoAlInicio({ desde: "2026-08-01", hasta: "2026-08-31" }, INICIO, "2026-10-16")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      ajustado: true,
    });
  });

  it("mes del inicio en curso ⇒ hasta HOY", () => {
    expect(ajustarRangoAlInicio({ desde: "2026-08-01", hasta: "2026-08-31" }, INICIO, "2026-09-12")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-12",
      ajustado: true,
    });
  });

  it("25-ago a 10-sep ⇒ 1-sep a 10-sep", () => {
    expect(ajustarRangoAlInicio({ desde: "2026-08-25", hasta: "2026-09-10" }, INICIO, "2026-10-16")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-10",
      ajustado: true,
    });
  });

  it("septiembre ⇒ intacto; solo «desde» anterior ⇒ sube", () => {
    expect(ajustarRangoAlInicio({ desde: "2026-09-01", hasta: "2026-09-30" }, INICIO, "2026-10-16")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
      ajustado: false,
    });
    expect(ajustarRangoAlInicio({ desde: "2026-07-01" }, INICIO, "2026-10-16")).toEqual({
      desde: "2026-09-01",
      hasta: undefined,
      ajustado: true,
    });
  });

  it("sin extremos no inventa un rango (listas sin rango por defecto)", () => {
    expect(ajustarRangoAlInicio({}, INICIO, "2026-10-16")).toEqual({
      desde: undefined,
      hasta: undefined,
      ajustado: false,
    });
  });

  it("con null ⇒ intacto (agosto incluido)", () => {
    expect(ajustarRangoAlInicio({ desde: "2026-08-01", hasta: "2026-08-31" }, null, "2026-10-16")).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-31",
      ajustado: false,
    });
  });

  it("por mes: agosto ⇒ septiembre con aviso; null ⇒ intacto", () => {
    expect(ajustarMesAlInicio("2026-08", INICIO)).toEqual({ mes: "2026-09", ajustado: true });
    expect(ajustarMesAlInicio("2026-10", INICIO)).toEqual({ mes: "2026-10", ajustado: false });
    expect(ajustarMesAlInicio("2026-08", null)).toEqual({ mes: "2026-08", ajustado: false });
  });
});

describe("pisos y selectores", () => {
  it("pisoDesde / pisoMes / ventanaConPiso", () => {
    expect(pisoDesde("2026-08-15", INICIO)).toBe(INICIO);
    expect(pisoDesde("2026-09-15", INICIO)).toBe("2026-09-15");
    expect(pisoDesde(undefined, INICIO)).toBeUndefined();
    expect(pisoDesde("2026-08-15", null)).toBe("2026-08-15");
    expect(pisoMes("2026-07", INICIO)).toBe("2026-09");
    expect(pisoMes("2026-10", INICIO)).toBe("2026-10");
    expect(pisoMes("2026-07", null)).toBe("2026-07");
    expect(ventanaConPiso("2026-07-18", INICIO)).toBe(INICIO);
    expect(ventanaConPiso("2026-12-01", INICIO)).toBe("2026-12-01");
    expect(ventanaConPiso("2026-07-18", null)).toBe("2026-07-18");
  });

  it("`min` de los inputs: día y mes del inicio; null ⇒ sin min", () => {
    expect(minFechaFiltro(INICIO)).toBe(INICIO);
    expect(mesInicio(INICIO)).toBe("2026-09");
    expect(minFechaFiltro(null)).toBeUndefined();
    expect(mesInicio(null)).toBeUndefined();
  });

  it("mesesDesdeInicio: sep-2026 a oct-2026 (hoy); null ⇒ desde enero 2026", () => {
    expect(mesesDesdeInicio(INICIO, "2026-10-16")).toEqual(["2026-10", "2026-09"]);
    const sin = mesesDesdeInicio(null, "2026-10-16");
    expect(sin[0]).toBe("2026-10");
    expect(sin[sin.length - 1]).toBe("2026-01");
    expect(sin).toHaveLength(10);
    expect(mesesDesdeInicio(INICIO, "2027-01-05")).toEqual(["2027-01", "2026-12", "2026-11", "2026-10", "2026-09"]);
  });

  it("flecha «mes anterior»: apagada en el mes del inicio (y antes); null ⇒ nunca", () => {
    expect(esMesDelInicioOAnterior("2026-09", INICIO)).toBe(true);
    expect(esMesDelInicioOAnterior("2026-08", INICIO)).toBe(true);
    expect(esMesDelInicioOAnterior("2026-10", INICIO)).toBe(false);
    expect(esMesDelInicioOAnterior("2026-09", null)).toBe(false);
  });
});

describe("recortarAtajos", () => {
  const atajos = (hoy: string) => [
    { clave: "mes", etiqueta: "Este mes", desde: `${hoy.slice(0, 7)}-01`, hasta: hoy },
    { clave: "anterior", etiqueta: "Mes pasado", desde: "2026-08-01", hasta: "2026-08-31" },
    { clave: "90", etiqueta: "Últimos 90 días", desde: "2026-06-14", hasta: hoy },
  ];

  it("en sep-2026 quita «Mes pasado» (agosto entero) y renombra la ventana de 90 días", () => {
    const r = recortarAtajos(atajos("2026-09-12"), INICIO, (a) => a.clave === "90");
    expect(r.map((a) => a.clave)).toEqual(["mes", "90"]);
    expect(r[1]).toEqual({ clave: "90", etiqueta: "Desde el 1-sep-2026", desde: INICIO, hasta: "2026-09-12" });
  });

  it("con null ⇒ la MISMA lista", () => {
    const lista = atajos("2026-09-12");
    expect(recortarAtajos(lista, null, () => true)).toBe(lista);
  });

  it("atajoAntesDelInicio: solo si el rango queda ENTERO antes", () => {
    expect(atajoAntesDelInicio({ hasta: "2026-08-31" }, INICIO)).toBe(true);
    expect(atajoAntesDelInicio({ hasta: "2026-09-30" }, INICIO)).toBe(false);
    expect(atajoAntesDelInicio({ hasta: "2026-08-31" }, null)).toBe(false);
    expect(atajoAntesDelInicio(null, INICIO)).toBe(false);
  });
});

describe("esAntesDelInicio (borde Cancún)", () => {
  it("date: 31-ago antes, 1-sep no", () => {
    expect(esAntesDelInicio("2026-08-31", INICIO)).toBe(true);
    expect(esAntesDelInicio("2026-09-01", INICIO)).toBe(false);
  });

  it("timestamptz: 2026-09-01T04:59:59Z es el 31-ago en Cancún; T05:00:00Z ya es el 1-sep", () => {
    expect(esAntesDelInicio("2026-09-01T04:59:59Z", INICIO)).toBe(true);
    expect(esAntesDelInicio("2026-09-01T05:00:00Z", INICIO)).toBe(false);
    expect(esAntesDelInicio("2026-08-31T23:00:00-05:00", INICIO)).toBe(true);
  });

  it("sin fecha, ilegible o null ⇒ false", () => {
    expect(esAntesDelInicio(null, INICIO)).toBe(false);
    expect(esAntesDelInicio("", INICIO)).toBe(false);
    expect(esAntesDelInicio("nada", INICIO)).toBe(false);
    expect(esAntesDelInicio("2026-08-31", null)).toBe(false);
  });
});

describe("calendario: días anteriores en gris y sin eventos", () => {
  it("vacía solo los días anteriores; null ⇒ la misma lista", () => {
    const dias = [
      { iso: "2026-08-31", events: ["a"] },
      { iso: "2026-09-01", events: ["b"] },
    ];
    expect(vaciarDiasAntesDelInicio(dias, INICIO)).toEqual([
      { iso: "2026-08-31", events: [], antesDelInicio: true },
      { iso: "2026-09-01", events: ["b"] },
    ]);
    expect(vaciarDiasAntesDelInicio(dias, null)).toBe(dias);
  });
});

describe("textos exactos (es-MX)", () => {
  it("fecha corta", () => {
    expect(fechaInicioCorta("2026-09-01")).toBe("1-sep-2026");
    expect(fechaInicioCorta("2027-01-15")).toBe("15-ene-2027");
  });

  it("chip, franja, aviso de ajuste y de captura", () => {
    expect(textoChipAntesDelInicio(INICIO)).toBe("De antes del inicio oficial (1-sep-2026)");
    expect(textoFranjaAntesDelInicio(INICIO)).toBe(
      "Este registro es de antes del inicio oficial (1-sep-2026). Se conserva solo para consulta: no aparece en listados ni reportes.",
    );
    expect(textoAvisoAjuste(INICIO)).toBe(
      "El sistema arranca el 1-sep-2026; ajustamos el periodo a partir de esa fecha.",
    );
    expect(textoAvisoCaptura(INICIO)).toBe(
      "La fecha es anterior al inicio oficial (1-sep-2026): se guardará, pero no aparecerá en listados ni reportes.",
    );
  });

  it("atajo, «todas las fechas», flecha, saldo inicial y finanzas del avión", () => {
    expect(etiquetaDesdeInicio(INICIO)).toBe("Desde el 1-sep-2026");
    expect(textoDesdeInicio(INICIO)).toBe("desde el 1-sep-2026");
    expect(textoArrancaEnMes(INICIO)).toBe("El sistema arranca en septiembre de 2026");
    expect(textoSaldoInicial(INICIO)).toBe("Saldo inicial al 1-sep-2026");
    expect(rotuloAcumuladoFinanzas(INICIO)).toBe("desde el 1-sep-2026");
    expect(rotuloAcumuladoFinanzas(undefined)).toBe("acumulado");
    expect(rotuloAcumuladoFinanzas(null)).toBe("acumulado");
  });

  it("aviso de captura: solo con fecha anterior (día o instante)", () => {
    expect(avisoCapturaAntesDelInicio("2026-08-29", INICIO)).toBe(textoAvisoCaptura(INICIO));
    expect(avisoCapturaAntesDelInicio("2026-09-01T04:00:00Z", INICIO)).toBe(textoAvisoCaptura(INICIO));
    expect(avisoCapturaAntesDelInicio("2026-09-01", INICIO)).toBeNull();
    expect(avisoCapturaAntesDelInicio("", INICIO)).toBeNull();
    expect(avisoCapturaAntesDelInicio("2026-08-29", null)).toBeNull();
  });
});
