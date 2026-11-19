/**
 * Inicio oficial (16-oct-2026, API 0.0.84) en cada módulo del panel: cada
 * regla con inicio y con `null` (null ⇒ salida IDÉNTICA a la de siempre, que
 * es la promesa del skew: API previo sin la llave ⇒ como hoy).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atajosPeriodoReportes } from "../reportes-ui";
import { parametrosVistaBalance, periodoDefaultVista } from "../balance-vista";
import { filtrosIngresosDeUrl, periodosRapidos } from "../ingresos-ui";
import {
  periodosRapidosConciliacion,
  rangoParaSinBanco,
  rangoVistaConciliacion,
  textoVentanaSinBanco,
} from "../conciliacion-vista";
import {
  filtrosListaDeParams,
  notaRangoCotizaciones,
  periodosRapidosCotizaciones,
  rangoListaCotizaciones,
  textoEncabezadoCotizaciones,
} from "../quote-navegacion";
import { leerFiltrosGastos, queryBaseGastos } from "../gastos-vista";
import { filtrosFacturasDeUrl, queryDeFiltros } from "../facturas-emitidas";
import {
  TITULO_LIMPIAR_PERIODO,
  filtrarHistorialPorRango,
  hayRangoHistorial,
  rangoHistorialCaja,
} from "../caja-chica-madre";
import { lineaGastoLote } from "../conciliacion-lote";
import { fmtDateOnly } from "@/lib/datetime";

const INICIO = "2026-09-01";

describe("Reportes: atajos «Este mes / Mes pasado»", () => {
  it("en sep-2026 no ofrece «Mes pasado» (agosto entero); null ⇒ los dos", () => {
    const con = atajosPeriodoReportes("2026-09-20", "2026-09-01", "2026-09-20", INICIO);
    expect(con.map((a) => a.clave)).toEqual(["este-mes"]);
    const sin = atajosPeriodoReportes("2026-09-20", "2026-09-01", "2026-09-20", null);
    expect(sin.map((a) => a.clave)).toEqual(["este-mes", "mes-pasado"]);
    expect(atajosPeriodoReportes("2026-09-20", "2026-09-01", "2026-09-20")).toEqual(sin);
  });

  it("en oct-2026 «Mes pasado» = septiembre, igual con o sin inicio", () => {
    expect(atajosPeriodoReportes("2026-10-16", "2026-10-01", "2026-10-16", INICIO)).toEqual(
      atajosPeriodoReportes("2026-10-16", "2026-10-01", "2026-10-16"),
    );
  });
});

describe("Balance en pantalla: periodo de la URL", () => {
  const def = periodoDefaultVista("2026-10-16");

  it("agosto en la URL ⇒ septiembre con `ajustado`", () => {
    const p = parametrosVistaBalance({ desde: "2026-08-01", hasta: "2026-08-31" }, def, INICIO);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30", ajustado: true });
  });

  it("sin URL o septiembre ⇒ intacto y SIN la llave `ajustado`; null ⇒ como siempre", () => {
    expect(parametrosVistaBalance({}, def, INICIO)).toEqual(parametrosVistaBalance({}, def));
    expect(parametrosVistaBalance({ desde: "2026-09-01", hasta: "2026-09-30" }, def, INICIO)).not.toHaveProperty(
      "ajustado",
    );
    expect(parametrosVistaBalance({ desde: "2026-08-01", hasta: "2026-08-31" }, def, null)).toMatchObject({
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
  });
});

describe("Ingresos: filtros y atajos", () => {
  const HOY = "2026-10-16";

  it("«Por conciliar» sin periodo: la ventana de 90 días arranca en el inicio, SIN aviso", () => {
    const f = filtrosIngresosDeUrl({ tab: "por-conciliar" }, "ADMIN", HOY, INICIO);
    expect(f.desde).toBe(INICIO);
    expect(f.hasta).toBe(HOY);
    expect(f.ajustado).toBeUndefined();
    // null ⇒ la ventana de siempre (hoy − 89).
    expect(filtrosIngresosDeUrl({ tab: "por-conciliar" }, "ADMIN", HOY, null).desde).toBe("2026-07-19");
  });

  it("agosto en la URL ⇒ septiembre con aviso; null ⇒ agosto", () => {
    const f = filtrosIngresosDeUrl({ desde: "2026-08-01", hasta: "2026-08-31" }, "ADMIN", HOY, INICIO);
    expect([f.desde, f.hasta, f.ajustado]).toEqual(["2026-09-01", "2026-09-30", true]);
    expect(filtrosIngresosDeUrl({ desde: "2026-08-01", hasta: "2026-08-31" }, "ADMIN", HOY)).toEqual(
      filtrosIngresosDeUrl({ desde: "2026-08-01", hasta: "2026-08-31" }, "ADMIN", HOY, null),
    );
  });

  it("el mes en curso por defecto no cambia", () => {
    expect(filtrosIngresosDeUrl({}, "ADMIN", HOY, INICIO)).toEqual(filtrosIngresosDeUrl({}, "ADMIN", HOY));
  });

  it("atajos: en sep-2026 sin «Mes anterior» y con «Desde el 01/09/2026»", () => {
    const r = periodosRapidos("2026-09-20", INICIO);
    expect(r.map((p) => p.etiqueta)).toEqual(["Este mes", "Desde el 01/09/2026"]);
    expect(r[1]).toMatchObject({ desde: INICIO, hasta: "2026-09-20" });
    expect(periodosRapidos("2026-09-20", null)).toEqual(periodosRapidos("2026-09-20"));
    expect(periodosRapidos("2026-09-20").map((p) => p.etiqueta)).toEqual([
      "Este mes",
      "Mes anterior",
      "Últimos 90 días",
    ]);
  });
});

describe("Conciliación: rango, «sin banco» y atajos", () => {
  const HOY = "2026-10-16";

  it("sin rango no se inventa uno; un `?desde` anterior sube con aviso", () => {
    expect(rangoVistaConciliacion(null, null, HOY, INICIO)).toEqual({});
    expect(rangoVistaConciliacion("2026-08-10", null, HOY, INICIO)).toEqual({ desde: INICIO, ajustado: true });
    expect(rangoVistaConciliacion("2026-08-10", null, HOY, null)).toEqual({ desde: "2026-08-10" });
    expect(rangoVistaConciliacion("2026-08-10", null, HOY)).toEqual({ desde: "2026-08-10" });
  });

  it("«sin banco» con solo «hasta»: la ventana anclada no baja del inicio", () => {
    expect(rangoParaSinBanco({ hasta: "2026-10-10" }, INICIO)).toEqual({ desde: INICIO, hasta: "2026-10-10" });
    expect(rangoParaSinBanco({ hasta: "2026-10-10" }, null)).toEqual(rangoParaSinBanco({ hasta: "2026-10-10" }));
    expect(rangoParaSinBanco({}, INICIO)).toEqual({});
  });

  it("texto de la ventana «sin banco»: «desde el 01/09/2026» mientras hoy − 90 caiga antes", () => {
    expect(textoVentanaSinBanco({}, INICIO, HOY)).toBe(`desde el ${fmtDateOnly(INICIO)}`);
    expect(textoVentanaSinBanco({}, INICIO, "2027-01-15")).toBe("últimos 90 días");
    expect(textoVentanaSinBanco({}, null, HOY)).toBe("últimos 90 días");
    expect(textoVentanaSinBanco({ hasta: "2026-10-10" }, INICIO)).toBe(
      `del ${fmtDateOnly(INICIO)} al ${fmtDateOnly("2026-10-10")}`,
    );
  });

  it("atajos: sep-2026 sin «Mes anterior»; null ⇒ los de siempre", () => {
    expect(periodosRapidosConciliacion("2026-09-20", INICIO).map((p) => p.etiqueta)).toEqual([
      "Este mes",
      "Desde el 01/09/2026",
    ]);
    expect(periodosRapidosConciliacion("2026-09-20", null)).toEqual(periodosRapidosConciliacion("2026-09-20"));
  });
});

describe("Cotizaciones: rango, encabezado, nota y atajos", () => {
  it("sin rango: «desde el 01/09/2026» en lugar de «(todas las fechas)»", () => {
    expect(textoEncabezadoCotizaciones(12, {}, INICIO)).toBe("12 cotizaciones (desde el 01/09/2026).");
    expect(textoEncabezadoCotizaciones(12, {}, null)).toBe("12 cotizaciones (todas las fechas).");
    expect(notaRangoCotizaciones({}, { inicio: INICIO })).toContain("se muestran las cotizaciones desde el 01/09/2026");
    expect(notaRangoCotizaciones({}, { inicio: null })).toBe(notaRangoCotizaciones({}));
  });

  it("un `?desde` anterior sube (y llega igual a las flechas del detalle)", () => {
    expect(rangoListaCotizaciones("2026-08-01", "2026-09-15", INICIO)).toEqual({
      desde: INICIO,
      hasta: "2026-09-15",
      ajustado: true,
    });
    expect(rangoListaCotizaciones("2026-08-01", "2026-08-31", INICIO)).toEqual({
      desde: INICIO,
      hasta: "2026-09-30",
      ajustado: true,
    });
    expect(filtrosListaDeParams({ desde: "2026-08-01" }, INICIO)).toEqual({ desde: INICIO });
    expect(filtrosListaDeParams({ desde: "2026-08-01" }, null)).toEqual(filtrosListaDeParams({ desde: "2026-08-01" }));
    expect(rangoListaCotizaciones(null, null, INICIO)).toEqual({});
  });

  it("atajos: sep-2026 sin «Mes pasado»", () => {
    expect(periodosRapidosCotizaciones("2026-09-12", INICIO).map((p) => p.clave)).toEqual(["mes", "30"]);
    expect(periodosRapidosCotizaciones("2026-09-12", null)).toEqual(periodosRapidosCotizaciones("2026-09-12"));
  });
});

describe("Gastos: filtros de la URL", () => {
  const get = (q: Record<string, string>) => (k: string) => q[k];

  it("un `?desde` anterior sube con aviso; `ajustado` no viaja al API", () => {
    const f = leerFiltrosGastos(get({ desde: "2026-08-01" }), INICIO);
    expect(f).toMatchObject({ desde: INICIO, ajustado: true });
    expect(queryBaseGastos(f, "2026-10-16")).not.toHaveProperty("ajustado");
    expect(queryBaseGastos(f, "2026-10-16").desde).toBe(INICIO);
  });

  it("sin rango no inventa uno; null ⇒ como siempre", () => {
    expect(leerFiltrosGastos(get({}), INICIO)).toEqual(leerFiltrosGastos(get({})));
    expect(leerFiltrosGastos(get({ desde: "2026-08-01" }), null)).toEqual(
      leerFiltrosGastos(get({ desde: "2026-08-01" })),
    );
  });
});

describe("Facturas emitidas: filtros de la URL", () => {
  it("un `?desde` anterior sube con aviso; `ajustado` no viaja al API", () => {
    const f = filtrosFacturasDeUrl({ desde: "2026-08-01" }, INICIO, "2026-10-16");
    expect(f.desde).toBe(INICIO);
    expect(f.ajustado).toBe(true);
    expect(queryDeFiltros(f)).not.toHaveProperty("ajustado");
    expect(filtrosFacturasDeUrl({ desde: "2026-08-01" }, null)).toEqual(filtrosFacturasDeUrl({ desde: "2026-08-01" }));
  });
});

describe("Caja chica: el historial NO se recorta por el inicio oficial (19-nov-2026)", () => {
  // Caso real (caja de la oficina): gastos de AGOSTO repuestos en septiembre.
  // Con el piso, la vista enseñaba la reposición sin los gastos que reponía.
  // Libro como lo manda el API: del más reciente al más viejo.
  const historial = [
    { id: "propina", fecha: "2026-11-18", saldo: 725 },
    { id: "internet", fecha: "2026-09-29", saldo: 925 },
    { id: "reposicion", fecha: "2026-09-21", saldo: 1000 },
    { id: "uber", fecha: "2026-08-24", saldo: -70 },
    { id: "taxi", fecha: "2026-08-06", saldo: 300 },
    { id: "fondo", fecha: "2026-08-04", saldo: 1000 },
  ];

  it("sin `?desde`: sin rango ⇒ se ven TODAS las filas, también las de antes del inicio", () => {
    const r = rangoHistorialCaja(null, null);
    expect(r).toEqual({});
    expect(hayRangoHistorial(r)).toBe(false);
    const vis = filtrarHistorialPorRango(historial, r);
    expect(vis.map((f) => f.id)).toEqual(historial.map((f) => f.id));
    expect(vis.some((f) => f.fecha < INICIO)).toBe(true);
  });

  it("un `?desde` anterior al inicio se RESPETA (ya no sube ni avisa)", () => {
    const r = rangoHistorialCaja("2026-08-01", "2026-08-31");
    expect(r).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(r).not.toHaveProperty("ajustado");
    expect(filtrarHistorialPorRango(historial, r).map((f) => f.id)).toEqual(["uber", "taxi", "fondo"]);
  });

  it("filtra FILAS: el saldo de cada fila visible no cambia", () => {
    const vis = filtrarHistorialPorRango(historial, rangoHistorialCaja("2026-09-01", null));
    expect(vis.map((f) => f.id)).toEqual(["propina", "internet", "reposicion"]);
    expect(vis[2].saldo).toBe(1000);
  });

  it("«Limpiar» vuelve al libro completo", () => {
    expect(TITULO_LIMPIAR_PERIODO).toBe("Quitar el filtro de fechas y ver todo el historial");
  });

  it("cableado: ni la página ni el filtro leen el inicio oficial", () => {
    const leer = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
    const pagina = leer("../../../app/admin/caja-chica/[id]/page.tsx");
    const filtro = leer("../../../components/admin/caja-chica/historial-periodo-filtro.tsx");
    for (const src of [pagina, filtro]) {
      expect(src).not.toMatch(/getInicioOficial|useInicioOficial|minFechaFiltro|AvisoPeriodoAjustado/);
      expect(src).not.toMatch(/from "@\/lib\/admin\/inicio-oficial"/);
    }
    expect(pagina).not.toContain("FilaSaldoInicial");
    expect(pagina).toContain("const rango = rangoHistorialCaja(sp.desde, sp.hasta);");
  });
});

describe("Conciliación: la línea de un gasto de lote lleva su fecha (para el chip)", () => {
  it("`fecha` = fecha_gasto del gasto", () => {
    const l = lineaGastoLote({
      id: "g1",
      monto: "2231.37",
      moneda: "MXN",
      categoria: "OPERACIONES",
      fecha_gasto: "2026-08-27",
      vuelo_id: null,
      vuelo: null,
    } as unknown as Parameters<typeof lineaGastoLote>[0]);
    expect(l.fecha).toBe("2026-08-27");
  });
});
