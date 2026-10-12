import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import {
  DIAS_SIN_BANCO_DEFAULT,
  FILTROS_CONCILIACION,
  filtroConciliacionDeUrl,
  hayRango,
  hrefConciliacion,
  periodosRapidosConciliacion,
  rangoParaSinBanco,
  rangoVistaConciliacion,
  textoListaRecortada,
  textoRangoVista,
  textoVentanaSinBanco,
} from "../conciliacion-vista";

/**
 * Filtro de fechas de la vista de Conciliación (12-oct-2026): «de tal fecha a
 * tal fecha». El rango vive en la URL y se valida ANTES de hablar con el API.
 */
const HOY = "2026-10-12";

describe("rangoVistaConciliacion: el rango de la URL, validado para el API", () => {
  it("acepta un rango de días YYYY-MM-DD", () => {
    expect(rangoVistaConciliacion("2026-09-01", "2026-09-30", HOY)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("acepta un solo extremo", () => {
    expect(rangoVistaConciliacion("2026-09-01", undefined, HOY)).toEqual({ desde: "2026-09-01" });
    expect(rangoVistaConciliacion(null, "2026-09-30", HOY)).toEqual({ hasta: "2026-09-30" });
    expect(rangoVistaConciliacion("", "", HOY)).toEqual({});
  });

  it("ignora un día que no existe (regla de url-params: enlaces viejos no tumban la pantalla)", () => {
    expect(rangoVistaConciliacion("2026-13-45", "2026-09-30", HOY)).toEqual({ hasta: "2026-09-30" });
    expect(rangoVistaConciliacion("2026-02-30", "nada", HOY)).toEqual({});
  });

  it("rechaza un ISO con hora: el DTO de la lista solo acepta YYYY-MM-DD", () => {
    expect(rangoVistaConciliacion("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z", HOY)).toEqual({});
  });

  it("corrige un rango invertido en vez de dejar que el API responda 400", () => {
    expect(rangoVistaConciliacion("2026-09-30", "2026-09-01", HOY)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("recorta un «hasta» futuro a hoy y descarta un «desde» futuro", () => {
    expect(rangoVistaConciliacion("2026-10-01", "2026-12-31", HOY)).toEqual({
      desde: "2026-10-01",
      hasta: HOY,
    });
    // Todo el rango en el futuro: no hay movimientos ahí y «cobros-sin-banco»
    // responde 400 si desde > hasta.
    expect(rangoVistaConciliacion("2026-11-01", "2026-11-30", HOY)).toEqual({ hasta: HOY });
    expect(rangoVistaConciliacion("2026-11-01", undefined, HOY)).toEqual({});
  });

  it("hayRango", () => {
    expect(hayRango({})).toBe(false);
    expect(hayRango({ desde: "2026-09-01" })).toBe(true);
    expect(hayRango({ hasta: "2026-09-30" })).toBe(true);
  });
});

describe("rangoParaSinBanco: la ventana de «gastos/cobros sin banco»", () => {
  it("sin rango no manda nada (el API aplica sus últimos 90 días)", () => {
    expect(rangoParaSinBanco({})).toEqual({});
  });

  it("con los dos extremos los manda tal cual", () => {
    expect(rangoParaSinBanco({ desde: "2026-09-01", hasta: "2026-09-30" })).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("con solo «desde» manda solo «desde» (el API cierra en hoy)", () => {
    expect(rangoParaSinBanco({ desde: "2026-09-01" })).toEqual({ desde: "2026-09-01" });
  });

  it("con solo «hasta» ancla los 90 días a esa fecha: el default «hoy − 90» quedaría después y sería un 400", () => {
    expect(DIAS_SIN_BANCO_DEFAULT).toBe(90);
    expect(rangoParaSinBanco({ hasta: "2026-08-15" })).toEqual({
      desde: "2026-05-17",
      hasta: "2026-08-15",
    });
  });
});

describe("textos del rango", () => {
  const d = fmtDateOnly("2026-10-01");
  const h = fmtDateOnly("2026-10-12");

  it("textoRangoVista", () => {
    expect(textoRangoVista({})).toBeNull();
    expect(textoRangoVista({ desde: "2026-10-01", hasta: "2026-10-12" })).toBe(`del ${d} al ${h}`);
    expect(textoRangoVista({ desde: "2026-10-01" })).toBe(`desde el ${d}`);
    expect(textoRangoVista({ hasta: "2026-10-12" })).toBe(`hasta el ${h}`);
  });

  it("textoVentanaSinBanco es el espejo de rangoParaSinBanco", () => {
    expect(textoVentanaSinBanco({})).toBe("últimos 90 días");
    expect(textoVentanaSinBanco({ desde: "2026-10-01", hasta: "2026-10-12" })).toBe(`del ${d} al ${h}`);
    expect(textoVentanaSinBanco({ desde: "2026-10-01" })).toBe(`desde el ${d}`);
    expect(textoVentanaSinBanco({ hasta: "2026-10-12" })).toBe(`90 días hasta el ${h}`);
  });

  it("textoListaRecortada solo cuando el tope del API dejó movimientos fuera", () => {
    expect(textoListaRecortada(300, 300)).toBeNull();
    expect(textoListaRecortada(120, 120)).toBeNull();
    expect(textoListaRecortada(0, 0)).toBeNull();
    expect(textoListaRecortada(300, 945)).toBe(
      "Se muestran los 300 movimientos más recientes de 945. Acota el periodo con «Desde» y «Hasta» para ver los demás.",
    );
  });
});

describe("hrefConciliacion: la URL de la vista (fuente única)", () => {
  it("sin nada es la ruta limpia", () => {
    expect(hrefConciliacion({})).toBe("/admin/conciliacion");
    expect(hrefConciliacion({ f: "todos", cuenta: "", desde: null, hasta: undefined })).toBe(
      "/admin/conciliacion",
    );
  });

  it("pestaña + cuenta + rango, en ese orden", () => {
    expect(
      hrefConciliacion({
        f: "pendientes",
        cuenta: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        desde: "2026-09-01",
        hasta: "2026-09-30",
      }),
    ).toBe(
      "/admin/conciliacion?f=pendientes&cuenta=3f2504e0-4f89-11d3-9a0c-0305e82c3301&desde=2026-09-01&hasta=2026-09-30",
    );
  });

  it("una pestaña fuera del catálogo cae a «todos» (fuera de la URL)", () => {
    expect(hrefConciliacion({ f: "otra", desde: "2026-09-01" })).toBe(
      "/admin/conciliacion?desde=2026-09-01",
    );
  });

  it("filtroConciliacionDeUrl", () => {
    for (const f of FILTROS_CONCILIACION) expect(filtroConciliacionDeUrl(f)).toBe(f);
    expect(filtroConciliacionDeUrl("nada")).toBe("todos");
    expect(filtroConciliacionDeUrl(null)).toBe("todos");
    expect(filtroConciliacionDeUrl(undefined)).toBe("todos");
  });
});

describe("periodosRapidosConciliacion: días Cancún", () => {
  it("este mes, mes anterior y últimos 90 días", () => {
    expect(periodosRapidosConciliacion(HOY)).toEqual([
      { clave: "mes", etiqueta: "Este mes", desde: "2026-10-01", hasta: "2026-10-12" },
      { clave: "anterior", etiqueta: "Mes anterior", desde: "2026-09-01", hasta: "2026-09-30" },
      { clave: "90", etiqueta: "Últimos 90 días", desde: "2026-07-14", hasta: "2026-10-12" },
    ]);
  });

  it("cruza el año", () => {
    const p = periodosRapidosConciliacion("2027-01-05");
    expect(p[1]).toEqual({
      clave: "anterior",
      etiqueta: "Mes anterior",
      desde: "2026-12-01",
      hasta: "2026-12-31",
    });
  });
});
