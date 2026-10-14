import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import {
  DIAS_SIN_BANCO_DEFAULT,
  FILTROS_CONCILIACION,
  filtroConciliacionDeUrl,
  fusionarPaginaMovimientos,
  hayRango,
  hrefConciliacion,
  periodosRapidosConciliacion,
  rangoParaSinBanco,
  rangoVistaConciliacion,
  PAGINA_MOVIMIENTOS_API,
  textoListaRecortada,
  textoRangoVista,
  TOPE_MOVIMIENTOS_VISTA,
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
    // Con el tope de la vista los números llevan separador de miles.
    expect(textoListaRecortada(2000, 2345)).toBe(
      "Se muestran los 2,000 movimientos más recientes de 2,345. Acota el periodo con «Desde» y «Hasta» para ver los demás.",
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

/**
 * Carga COMPLETA de la lista (13-oct-2026, «¿tenemos una forma de no limitar
 * a los 300?»): paginación por VENTANA DE FECHA con dedupe por id.
 */
describe("fusionarPaginaMovimientos: la siguiente ventana de fecha", () => {
  const m = (id: string, fecha: string) => ({ id, fecha });
  const base = { limite: 3, tope: 100, total: 10, hastaPedido: null as string | null };

  it("el contrato del API: páginas de 500 y tope de la vista 2,000", () => {
    expect(PAGINA_MOVIMIENTOS_API).toBe(500);
    expect(TOPE_MOVIMIENTOS_VISTA).toBe(2000);
  });

  it("página llena ⇒ la siguiente pide `hasta` = la fecha más vieja (inclusiva)", () => {
    const r = fusionarPaginaMovimientos([], [m("a", "2026-10-12"), m("b", "2026-10-11"), m("c", "2026-10-10")], base);
    expect(r.filas.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.siguienteHasta).toBe("2026-10-10");
    expect(r.truncado).toBe(false);
  });

  it("lo que ya llegó del día frontera se descarta por id, en el orden del API", () => {
    const acumulado = [m("a", "2026-10-12"), m("b", "2026-10-10")];
    const pagina = [m("b", "2026-10-10"), m("c", "2026-10-10"), m("d", "2026-10-09")];
    const r = fusionarPaginaMovimientos(acumulado, pagina, { ...base, hastaPedido: "2026-10-10" });
    expect(r.filas.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.siguienteHasta).toBe("2026-10-09");
  });

  it("acepta `fecha` con hora (ISO) y toma el día", () => {
    const r = fusionarPaginaMovimientos([], [m("a", "2026-10-12T00:00:00"), m("b", "2026-10-11"), m("c", "2026-10-10T00:00:00Z")], base);
    expect(r.siguienteHasta).toBe("2026-10-10");
  });

  it("página incompleta ⇒ ya no hay más (sin cortar)", () => {
    const r = fusionarPaginaMovimientos([], [m("a", "2026-10-12"), m("b", "2026-10-11")], base);
    expect(r).toMatchObject({ siguienteHasta: null, truncado: false });
  });

  it("ya están los `total` del API ⇒ para aunque la página venga llena", () => {
    const r = fusionarPaginaMovimientos([], [m("a", "2026-10-12"), m("b", "2026-10-11"), m("c", "2026-10-10")], { ...base, total: 3 });
    expect(r).toMatchObject({ siguienteHasta: null, truncado: false });
  });

  it("un día con más movimientos que una página ⇒ se corta y se DICE", () => {
    // La página pedida con hasta = 10-oct regresa 3 del MISMO 10-oct: no hay avance.
    const acumulado = [m("a", "2026-10-11")];
    const pagina = [m("b", "2026-10-10"), m("c", "2026-10-10"), m("d", "2026-10-10")];
    const r = fusionarPaginaMovimientos(acumulado, pagina, { ...base, hastaPedido: "2026-10-10" });
    expect(r.filas.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(r).toMatchObject({ siguienteHasta: null, truncado: true });
  });

  it("una página que no trae NADA nuevo ⇒ se corta (jamás un bucle)", () => {
    const acumulado = [m("a", "2026-10-12"), m("b", "2026-10-11"), m("c", "2026-10-10")];
    const r = fusionarPaginaMovimientos(acumulado, acumulado, { ...base, hastaPedido: "2026-10-12" });
    expect(r).toMatchObject({ siguienteHasta: null, truncado: true });
  });

  it("el tope de la vista corta y marca truncado solo si el API tiene más", () => {
    const pagina = [m("a", "2026-10-12"), m("b", "2026-10-11"), m("c", "2026-10-10")];
    const corta = fusionarPaginaMovimientos([], pagina, { ...base, tope: 2, total: 10 });
    expect(corta.filas.map((x) => x.id)).toEqual(["a", "b"]);
    expect(corta).toMatchObject({ siguienteHasta: null, truncado: true });
    const justa = fusionarPaginaMovimientos([], pagina, { ...base, tope: 3, total: 3 });
    expect(justa).toMatchObject({ siguienteHasta: null, truncado: false });
  });

  it("no muta el acumulado", () => {
    const acumulado = [m("a", "2026-10-12")];
    fusionarPaginaMovimientos(acumulado, [m("b", "2026-10-11")], base);
    expect(acumulado).toEqual([m("a", "2026-10-12")]);
  });
});

describe("hrefConciliacion: `buscar` prellena la búsqueda de la tabla (13-oct-2026)", () => {
  it("`buscar` ⇒ `mvq` (el `${syncId}q` de la tabla «mv»), al final y recortado", () => {
    expect(hrefConciliacion({ desde: "2026-10-05", hasta: "2026-10-19", buscar: "7360" })).toBe(
      "/admin/conciliacion?desde=2026-10-05&hasta=2026-10-19&mvq=7360",
    );
    expect(hrefConciliacion({ f: "pendientes", buscar: "  8939.38 " })).toBe(
      "/admin/conciliacion?f=pendientes&mvq=8939.38",
    );
    expect(hrefConciliacion({ buscar: "x".repeat(90) })).toBe(`/admin/conciliacion?mvq=${"x".repeat(80)}`);
  });

  it("sin `buscar` (o vacío) la URL es byte a byte la de antes", () => {
    expect(hrefConciliacion({})).toBe("/admin/conciliacion");
    expect(hrefConciliacion({ f: "pendientes", cuenta: "x", desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "/admin/conciliacion?f=pendientes&cuenta=x&desde=2026-09-01&hasta=2026-09-30",
    );
    expect(hrefConciliacion({ f: "todos", desde: "2026-09-01", buscar: "   " })).toBe("/admin/conciliacion?desde=2026-09-01");
    expect(hrefConciliacion({ buscar: null })).toBe("/admin/conciliacion");
  });
});
