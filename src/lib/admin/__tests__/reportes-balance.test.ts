/**
 * Card «Balance mensual y balance general» de `/admin/reportes` (6-oct-2026,
 * API 0.0.64). Pedido del cliente: «me pueden poner otro botón para bajar el
 * balance general; el que ya tenemos que se renombre a "Balance mensual" y el
 * nuevo botón sea el "Balance general"». Costo por hora confirmado: «es el
 * total de todos los gastos, entre el tiempo volado, entre el tipo de cambio
 * del día, entre 1.16 (para sacar subtotal)».
 *
 * Se custodia:
 *  1. los textos (título, una línea por libro, nota y etiquetas: copia del
 *     contrato);
 *  2. archivo y parámetros de cada botón: la MISMA ruta, `modo` distinto y
 *     el periodo de la página;
 *  3. la paridad de los modos y de la ruta con el API (si el repo hermano
 *     está al lado);
 *  4. el cableado de la página: dos botones en orden, todo sale del helper y
 *     el título viejo ya no se pinta.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MODOS_BALANCE_VUELATOUR,
  NOTA_BALANCE_VUELATOUR,
  RUTA_BALANCE_VUELATOUR,
  TITULO_CARD_BALANCE_VUELATOUR,
  archivoBalanceVuelaTour,
  librosBalanceVuelaTour,
  lineaDescripcionBalance,
} from "../reportes-balance";

/** Lo que recibe cada `ExcelExportButton` de la página (testigo). */
interface PropsBotonExcel {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
}
const botonesExcel: PropsBotonExcel[] = [];

// La página real descarga con la sesión del navegador y lee el API: aquí
// solo se registra con qué se pintó cada botón y lo demás se apaga.
vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: (p: PropsBotonExcel) => {
    botonesExcel.push(p);
    return null;
  },
}));
vi.mock("@/components/admin/profit-sharing/period-selector", () => ({
  PeriodSelector: () => null,
}));
vi.mock("@/components/admin/profit-sharing/mes-reporte-select", () => ({
  CierreRepartoSection: () => null,
}));
vi.mock("@/components/admin/flights/flight-report-picker", () => ({
  FlightReportPicker: () => null,
}));
vi.mock("@/components/admin/reportes/aircraft-balance-picker", () => ({
  AircraftBalancePicker: () => null,
}));
vi.mock("@/components/admin/reportes/pre-cierre-card", () => ({
  PreCierreCard: () => null,
}));
vi.mock("@/lib/api/flights-server", () => ({
  listFlights: async () => ({ data: [], count: 0 }),
}));
vi.mock("@/lib/api/aircraft", () => ({
  listAircraft: async () => ({ data: [], count: 0 }),
}));

const { default: ReportesPage } = await import("@/app/admin/reportes/page");

/** COPIA del contrato (§4) — si cambia un texto, se cambia aquí y en el helper. */
const CONTRATO = {
  titulo: "Balance mensual y balance general",
  ruta: "/v1/aircraft/balance-general.xlsx",
  mensual: {
    etiqueta: "Descargar balance mensual (Excel)",
    linea:
      "Balance mensual: el libro completo de siempre — resumen por avión, hoja de vuelos (reporte de horas) con el desglose de operación, piloto, otros y permiso AFAC, otros movimientos, cobranza, otros gastos de la empresa, repartidos a aviones, inventario de bodega, balance por avión con sus socios y pendientes de captura.",
  },
  general: {
    etiqueta: "Descargar balance general (Excel)",
    linea:
      "Balance general: el mismo libro con la hoja de vuelos resumida a costo total y costo por hora (sin desglose de operación/piloto/AFAC). Costo por hora = costo total ÷ tiempo volado ÷ tipo de cambio ÷ 1.16 (dólares sin IVA).",
  },
  nota: "Los dos consolidan toda la flota en el periodo elegido arriba; el libro de un solo avión se descarga en «Balance por avión».",
} as const;

describe("textos de la card", () => {
  it("título nuevo (el viejo era «Balance general VuelaTour»)", () => {
    expect(TITULO_CARD_BALANCE_VUELATOUR).toBe(CONTRATO.titulo);
  });

  it("una línea por libro, en el orden de los botones, y la nota común", () => {
    const libros = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(libros.map(lineaDescripcionBalance)).toEqual([
      CONTRATO.mensual.linea,
      CONTRATO.general.linea,
    ]);
    expect(NOTA_BALANCE_VUELATOUR).toBe(CONTRATO.nota);
  });

  it("el general dice qué quita y cómo sale el costo por hora (la fórmula del cliente)", () => {
    const [mensual, general] = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(general.nombre).toBe("Balance general");
    expect(general.detalle).toContain(
      "el mismo libro con la hoja de vuelos resumida a costo total y costo por hora (sin desglose de operación/piloto/AFAC)",
    );
    expect(general.detalle).toContain("costo total ÷ tiempo volado ÷ tipo de cambio ÷ 1.16");
    // El mensual es el de siempre: sí trae el desglose.
    expect(mensual.nombre).toBe("Balance mensual");
    expect(mensual.detalle.startsWith("el libro completo de siempre")).toBe(true);
    expect(mensual.detalle).toContain("operación, piloto, otros y permiso AFAC");
  });

  it("etiquetas de los botones", () => {
    expect(librosBalanceVuelaTour("2026-09-01", "2026-09-30").map((l) => l.etiqueta)).toEqual([
      CONTRATO.mensual.etiqueta,
      CONTRATO.general.etiqueta,
    ]);
  });
});

describe("archivo y parámetros de cada libro", () => {
  it("misma ruta para los dos; el `modo` decide el libro y viaja SIEMPRE", () => {
    expect(MODOS_BALANCE_VUELATOUR).toEqual(["mensual", "general"]);
    expect(RUTA_BALANCE_VUELATOUR).toBe(CONTRATO.ruta);
    const libros = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(libros.map((l) => [l.modo, l.path, l.query])).toEqual([
      ["mensual", CONTRATO.ruta, { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" }],
      ["general", CONTRATO.ruta, { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" }],
    ]);
  });

  it("nombre del archivo con el libro y el periodo (el mismo que pone el API)", () => {
    expect(archivoBalanceVuelaTour("mensual", "2026-09-01", "2026-09-30")).toBe(
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    );
    expect(archivoBalanceVuelaTour("general", "2026-10-01", "2026-10-06")).toBe(
      "balance-general-vuelatour-2026-10-01-a-2026-10-06.xlsx",
    );
    expect(librosBalanceVuelaTour("2026-09-01", "2026-09-30").map((l) => l.filename)).toEqual([
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
      "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    ]);
  });

  it("cada llamada arma objetos nuevos (mover el periodo no arrastra el anterior)", () => {
    const a = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    const b = librosBalanceVuelaTour("2026-08-01", "2026-08-31");
    expect(a[0].query).not.toBe(b[0].query);
    expect(a[0].query.desde).toBe("2026-09-01");
    expect(b[1].filename).toBe("balance-general-vuelatour-2026-08-01-a-2026-08-31.xlsx");
  });
});

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("paridad con el API", () => {
  const utilModo = leerApi("modules/aircraft/balance-general-modo.util.ts");
  it.skipIf(!utilModo)("los modos que acepta el API (otro ⇒ 400) son los del panel, en el mismo orden", () => {
    const bloque = utilModo!.match(/MODOS_BALANCE_GENERAL\s*=\s*\[([\s\S]*?)\]/)?.[1];
    expect(bloque, "no se encontró MODOS_BALANCE_GENERAL en el API").toBeTruthy();
    const modosApi = [...bloque!.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(modosApi).toEqual([...MODOS_BALANCE_VUELATOUR]);
  });

  const controller = leerApi("modules/aircraft/aircraft.controller.ts");
  it.skipIf(!controller)("la ruta es la del controlador del API (`/v1` + aircraft + balance-general.xlsx)", () => {
    expect(controller).toMatch(/@Controller\(\{\s*path:\s*'aircraft',\s*version:\s*'1'\s*\}\)/);
    expect(controller).toContain("@Get('balance-general.xlsx')");
    expect(RUTA_BALANCE_VUELATOUR).toBe("/v1/aircraft/balance-general.xlsx");
  });
});

/** Texto visible del marcado (sin etiquetas ni entidades básicas). */
function textoVisible(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function pintarPagina(sp: { desde?: string; hasta?: string }) {
  botonesExcel.length = 0;
  const el = await ReportesPage({ searchParams: Promise.resolve(sp) });
  return textoVisible(renderToStaticMarkup(el));
}

describe("cableado de la página /admin/reportes", () => {
  it("dos botones con `modo` (mensual, general) en la card; los exports de operación siguen igual", async () => {
    await pintarPagina({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(botonesExcel.map((b) => b.path)).toEqual([
      CONTRATO.ruta,
      CONTRATO.ruta,
      "/v1/inventory/items/export",
      "/v1/inventory/movimientos/export",
      "/v1/dashboards/horas-piloto/export",
      "/v1/expenses/export",
    ]);
    const balance = botonesExcel.filter((b) => b.path === CONTRATO.ruta);
    expect(balance).toEqual([
      {
        path: CONTRATO.ruta,
        filename: "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
        label: CONTRATO.mensual.etiqueta,
        query: { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" },
      },
      {
        path: CONTRATO.ruta,
        filename: "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
        label: CONTRATO.general.etiqueta,
        query: { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" },
      },
    ]);
  });

  it("pinta el título nuevo, una línea por libro y la nota; el título y el botón viejos ya no", async () => {
    const texto = await pintarPagina({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(texto).toContain(CONTRATO.titulo);
    expect(texto).toContain(CONTRATO.mensual.linea);
    expect(texto).toContain(CONTRATO.general.linea);
    expect(texto).toContain(CONTRATO.nota);
    expect(texto).not.toContain("Balance general VuelaTour");
  });

  it("los botones reciben el periodo YA validado de la página (fechas al revés se ordenan)", async () => {
    await pintarPagina({ desde: "2026-09-30", hasta: "2026-09-01" });
    const balance = botonesExcel.filter((b) => b.path === CONTRATO.ruta);
    expect(balance.map((b) => b.query)).toEqual([
      { desde: "2026-09-01", hasta: "2026-09-30", modo: "mensual" },
      { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" },
    ]);
    expect(balance.map((b) => b.filename)).toEqual([
      "balance-mensual-vuelatour-2026-09-01-a-2026-09-30.xlsx",
      "balance-general-vuelatour-2026-09-01-a-2026-09-30.xlsx",
    ]);
  });

  it("los textos y los botones salen del helper (ni el título ni las etiquetas se escriben a mano)", () => {
    const src = readFileSync(path.resolve(__dirname, "../../../app/admin/reportes/page.tsx"), "utf8");
    expect(src).toContain('from "@/lib/admin/reportes-balance"');
    expect(src).toContain("librosBalanceVuelaTour(desde, hasta)");
    expect(src).toContain("{TITULO_CARD_BALANCE_VUELATOUR}");
    expect(src).toContain("{NOTA_BALANCE_VUELATOUR}");
    expect(src).not.toContain("Descargar balance general VuelaTour");
    expect(src).not.toContain("balance-general-vuelatour-");
    expect(src).not.toMatch(/modo[=:]\s*["']/);
  });
});
