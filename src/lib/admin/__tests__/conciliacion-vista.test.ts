import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import {
  CLASE_FILA_ENFOCADA,
  DIAS_SIN_BANCO_DEFAULT,
  PARAM_BUSQUEDA_MOVIMIENTOS,
  SYNC_ID_MOVIMIENTOS,
  enfoqueConciliacionDeUrl,
  filasConFoco,
  textoMovimientoEnfocado,
  textoMovimientoNoEncontrado,
  TEXTO_MOVIMIENTO_NO_ENCONTRADO,
  PARAM_COBRO_FOCO,
  FILTROS_CONCILIACION,
  filtroConciliacionDeUrl,
  filtroReporteDeVista,
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

  it("«omitidos» (14-oct-2026, API 0.0.77): en el catálogo, después de «conciliados», y su URL", () => {
    expect(FILTROS_CONCILIACION).toEqual([
      "todos",
      "pendientes",
      "conciliados",
      "omitidos",
      "sin_banco",
      "cobros_sin_banco",
      "paywise",
    ]);
    expect(filtroConciliacionDeUrl("omitidos")).toBe("omitidos");
    expect(filtroConciliacionDeUrl("Omitidos")).toBe("todos");
    expect(hrefConciliacion({ f: "omitidos", cuenta: "76a931e0-7c06-47c6-a574-6c7d4a698c14" })).toBe(
      "/admin/conciliacion?f=omitidos&cuenta=76a931e0-7c06-47c6-a574-6c7d4a698c14",
    );
  });

  it("filtroReporteDeVista: «Omitidos» preselecciona «Conciliados» en el Excel", () => {
    expect(filtroReporteDeVista("omitidos")).toBe("conciliados");
    expect(filtroReporteDeVista("conciliados")).toBe("conciliados");
    expect(filtroReporteDeVista("pendientes")).toBe("pendientes");
    expect(filtroReporteDeVista("todos")).toBe("todos");
    expect(filtroReporteDeVista("sin_banco")).toBe("sin_banco");
    expect(filtroReporteDeVista("cobros_sin_banco")).toBe("todos");
    expect(filtroReporteDeVista("paywise")).toBe("todos");
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

describe("enfoque desde Gastos: ?mov= y ?gasto= (13-oct-2026, conciliación al revés)", () => {
  const MOV = "73a8d809-6468-4554-add4-f874a0c4ed9c";
  const GASTO = "4e29c476-a956-440f-bd83-2c70f78279d4";
  const CUENTA = "212add6c-c4e5-44cc-a30c-0635c0ab3036";

  it("hrefConciliacion: orden f, cuenta, desde, hasta, mov, gasto, mvq", () => {
    expect(
      hrefConciliacion({ f: "conciliados", cuenta: CUENTA, desde: "2026-09-30", hasta: "2026-09-30", mov: MOV, gasto: GASTO, buscar: "2801.4" }),
    ).toBe(`/admin/conciliacion?f=conciliados&cuenta=${CUENTA}&desde=2026-09-30&hasta=2026-09-30&mov=${MOV}&gasto=${GASTO}&mvq=2801.4`);
    expect(hrefConciliacion({ f: "todos", cuenta: CUENTA, desde: "2026-09-30", hasta: "2026-09-30", mov: MOV, gasto: GASTO })).toBe(
      `/admin/conciliacion?cuenta=${CUENTA}&desde=2026-09-30&hasta=2026-09-30&mov=${MOV}&gasto=${GASTO}`,
    );
  });

  it("un uuid inválido se descarta; sin los parámetros nuevos, la URL de antes", () => {
    expect(hrefConciliacion({ mov: "nada", gasto: "1 OR 1=1" })).toBe("/admin/conciliacion");
    expect(hrefConciliacion({ f: "pendientes", cuenta: "x", desde: "2026-09-01", hasta: "2026-09-30", mov: null, gasto: undefined })).toBe(
      "/admin/conciliacion?f=pendientes&cuenta=x&desde=2026-09-01&hasta=2026-09-30",
    );
  });

  it("enfoqueConciliacionDeUrl: válido, inválido, ausente y en mayúsculas", () => {
    // 15-oct-2026: también `cobro` (null sin él).
    expect(enfoqueConciliacionDeUrl({ mov: MOV, gasto: GASTO })).toEqual({ mov: MOV, gasto: GASTO, cobro: null });
    expect(enfoqueConciliacionDeUrl({ mov: "nada", gasto: "123" })).toEqual({ mov: null, gasto: null, cobro: null });
    expect(enfoqueConciliacionDeUrl({})).toEqual({ mov: null, gasto: null, cobro: null });
    expect(enfoqueConciliacionDeUrl({ mov: MOV.toUpperCase() })).toEqual({ mov: MOV, gasto: null, cobro: null });
  });

  it("filasConFoco: la enfocada PRIMERO sin mover a las demás; sin foco o sin encontrarla, el mismo arreglo", () => {
    const filas = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(filasConFoco(filas, "c")).toEqual({ filas: [{ id: "c" }, { id: "a" }, { id: "b" }, { id: "d" }], encontrado: true });
    expect(filasConFoco(filas, "a")).toEqual({ filas, encontrado: true });
    const sinFoco = filasConFoco(filas, null);
    expect(sinFoco.filas).toBe(filas);
    expect(sinFoco.encontrado).toBe(false);
    const noEsta = filasConFoco(filas, "z");
    expect(noEsta.filas).toBe(filas);
    expect(noEsta.encontrado).toBe(false);
    expect(filas.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("textoMovimientoEnfocado con y sin alias; la búsqueda de la tabla es `mvq`", () => {
    expect(textoMovimientoEnfocado({ fecha: "2026-09-30", monto: "-11205.60" }, "EJE SCOTIA")).toBe(
      `Primero en la lista y resaltado: el cargo del ${fmtDateOnly("2026-09-30")} por $11,205.60 (EJE SCOTIA) que abriste desde Gastos.`,
    );
    expect(textoMovimientoEnfocado({ fecha: "2026-09-30", monto: 11205.6 })).toBe(
      `Primero en la lista y resaltado: el cargo del ${fmtDateOnly("2026-09-30")} por $11,205.60 que abriste desde Gastos.`,
    );
    expect(PARAM_BUSQUEDA_MOVIMIENTOS).toBe("mvq");
    expect(SYNC_ID_MOVIMIENTOS).toBe("mv");
    expect(CLASE_FILA_ENFOCADA).toBe("ring-2 ring-inset ring-amber-400 bg-amber-500/5");
  });
});

describe("enfoque desde la hoja de una ENTRADA: ?cobro= (15-oct-2026, API 0.0.78)", () => {
  const MOV = "8a7eff81-6b8c-469e-a74d-2b0f4b631b08";
  const COBRO = "d7b0890c-9d0f-441f-a5cd-edd27fa50f0f";
  const CUENTA = "212add6c-c4e5-44cc-a30c-0635c0ab3036";
  const GASTO = "4e29c476-a956-440f-bd83-2c70f78279d4";

  it("hrefConciliacion: `cobro` después de `gasto` y antes de `mvq`; sin él, la URL de antes byte a byte", () => {
    expect(PARAM_COBRO_FOCO).toBe("cobro");
    expect(
      hrefConciliacion({ f: "conciliados", cuenta: CUENTA, desde: "2026-09-15", hasta: "2026-09-15", mov: MOV, cobro: COBRO }),
    ).toBe(`/admin/conciliacion?f=conciliados&cuenta=${CUENTA}&desde=2026-09-15&hasta=2026-09-15&mov=${MOV}&cobro=${COBRO}`);
    expect(hrefConciliacion({ mov: MOV, gasto: GASTO, cobro: COBRO, buscar: "977.45" })).toBe(
      `/admin/conciliacion?mov=${MOV}&gasto=${GASTO}&cobro=${COBRO}&mvq=977.45`,
    );
    expect(hrefConciliacion({ f: "conciliados", mov: MOV, cobro: null })).toBe(`/admin/conciliacion?f=conciliados&mov=${MOV}`);
    expect(hrefConciliacion({ cobro: "1 OR 1=1" })).toBe("/admin/conciliacion");
  });

  it("enfoqueConciliacionDeUrl devuelve el `cobro` validado y en minúsculas", () => {
    expect(enfoqueConciliacionDeUrl({ mov: MOV, cobro: COBRO.toUpperCase() })).toEqual({ mov: MOV, gasto: null, cobro: COBRO });
    expect(enfoqueConciliacionDeUrl({ cobro: "nada" })).toEqual({ mov: null, gasto: null, cobro: null });
  });

  it("textoMovimientoEnfocado decide por `tipo`: ABONO ⇒ «el abono … que abriste.»; CARGO, el de Gastos", () => {
    expect(textoMovimientoEnfocado({ fecha: "2026-09-15", monto: "69183", tipo: "ABONO" }, "EJE SCOTIA")).toBe(
      `Primero en la lista y resaltado: el abono del ${fmtDateOnly("2026-09-15")} por $69,183.00 (EJE SCOTIA) que abriste.`,
    );
    expect(textoMovimientoEnfocado({ fecha: "2026-09-30", monto: "-11205.60", tipo: "CARGO" }, "EJE SCOTIA")).toBe(
      `Primero en la lista y resaltado: el cargo del ${fmtDateOnly("2026-09-30")} por $11,205.60 (EJE SCOTIA) que abriste desde Gastos.`,
    );
  });

  it("no encontrado: con `?gasto=` el texto de Gastos de siempre; sin él, el genérico", () => {
    expect(textoMovimientoNoEncontrado({ gasto: GASTO })).toBe(TEXTO_MOVIMIENTO_NO_ENCONTRADO);
    expect(textoMovimientoNoEncontrado({ gasto: null })).toBe(
      "No encontramos en esta vista el movimiento que abriste: puede estar en otra cuenta u otras fechas, o ya lo desvincularon. Quita los filtros para buscarlo.",
    );
  });
});
