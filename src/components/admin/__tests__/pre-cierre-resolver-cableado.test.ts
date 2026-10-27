/**
 * Cableado del «Resolver →» que marca en ámbar (PEDIDO 2, 15-oct-2026), por
 * regex sobre los fuentes (patrón de `conciliacion/__tests__/enfoque.test.tsx`):
 * cada pantalla destino LEE el foco y monta la franja, cada tabla destino
 * marca con la fuente única (`claseFilaResaltada` / `CLASE_FILA_RESALTADA` /
 * `CLASE_FILA_ENFOCADA`) y `DataTable` sigue sin saber nada de resaltados.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

const PAGINAS: Array<[string, string]> = [
  ["app/admin/flights/page.tsx", "/admin/flights"],
  ["app/admin/expenses/page.tsx", "/admin/expenses"],
  ["app/admin/conciliacion/page.tsx", "/admin/conciliacion"],
  ["app/admin/combustibles/page.tsx", "/admin/combustibles"],
  ["app/admin/otros-gastos/page.tsx", "/admin/otros-gastos"],
  ["app/admin/quotes/page.tsx", "/admin/quotes"],
  ["app/admin/quotes/grupo/page.tsx", "/admin/quotes/grupo"],
  ["app/admin/taco-live/page.tsx", "/admin/taco-live"],
  ["app/admin/profit-sharing/socios/page.tsx", "/admin/profit-sharing/socios"],
  ["app/admin/facturas-emitidas/page.tsx", "/admin/facturas-emitidas"],
];

const TABLAS = [
  "components/admin/flights/flights-table.tsx",
  "components/admin/expenses/expenses-table.tsx",
  "components/admin/conciliacion/movimientos-table.tsx",
  "components/admin/conciliacion/gastos-sin-banco-table.tsx",
  "components/admin/conciliacion/cobros-sin-banco-table.tsx",
  "components/admin/expenses/fuel-loads-table.tsx",
  "components/admin/expenses/otros-gastos-table.tsx",
  "components/admin/quotes/quotes-table.tsx",
  "components/admin/grupos/grupos-table.tsx",
  "components/admin/taco-live/taco-live-board.tsx",
  "components/admin/profit-sharing/socios-cuenta-table.tsx",
  "components/admin/facturas-emitidas/por-facturar-table.tsx",
];

describe("pantallas destino", () => {
  it.each(PAGINAS)("%s lee el foco y monta la franja con su «Quitar resaltado»", (rel, ruta) => {
    const src = leer(rel);
    expect(src).toContain("leerFocoPreCierre(sp)");
    expect(src).toContain("<FranjaPreCierre");
    expect(src).toContain(`hrefQuitarResaltado("${ruta}", sp)`);
    expect(src).toContain("hrefVolverPreCierre(");
    // Gastos (27-oct-2026) comparte el resaltado con `?gasto=` (el gasto que
    // se abre desde Conciliación): los ids del foco llegan vía `idsResaltados`.
    expect(src).toMatch(
      /resaltados=\{(foco|focoPc)\?\.ids\}|resaltados=\{idsPc\}|resaltados=\{idsResaltados\.length > 0 \? idsResaltados : undefined\}/,
    );
  });

  it("las listas que REORDENAN usan filasResaltadasPrimero; Combustibles y Socios NO reordenan", () => {
    for (const rel of [
      "app/admin/flights/page.tsx",
      "app/admin/expenses/page.tsx",
      "app/admin/conciliacion/page.tsx",
      "app/admin/otros-gastos/page.tsx",
      "app/admin/quotes/page.tsx",
      "app/admin/quotes/grupo/page.tsx",
    ]) {
      expect(leer(rel)).toContain("filasResaltadasPrimero(");
    }
    expect(leer("app/admin/combustibles/page.tsx")).not.toContain("filasResaltadasPrimero(");
    expect(leer("app/admin/profit-sharing/socios/page.tsx")).not.toContain("filasResaltadasPrimero(");
  });

  it("notas de la vista: mes en Combustibles y Otros gastos; un día en Tacómetros en vivo", () => {
    expect(leer("app/admin/combustibles/page.tsx")).toContain("notaVista={NOTA_VISTA_MES}");
    expect(leer("app/admin/otros-gastos/page.tsx")).toContain("notaVista={NOTA_VISTA_MES}");
    expect(leer("app/admin/taco-live/page.tsx")).toContain("notaVista={NOTA_VISTA_TACO_LIVE}");
  });

  it("Gastos: el foco NO entra a FILTROS_URL (las pestañas lo quitan) ni a la clave de la tabla", () => {
    const src = leer("app/admin/expenses/page.tsx");
    const filtros = src.slice(src.indexOf("const FILTROS_URL"), src.indexOf("] as const;"));
    for (const k of ['"pc"', '"ids"', '"pcn"', '"pct"', '"pcd"', '"pcp"', '"gasto"']) expect(filtros).not.toContain(k);
  });

  it("Gastos: el foco del pre-cierre MANDA sobre `?gasto=` y los dos resaltan con la misma mecánica", () => {
    const src = leer("app/admin/expenses/page.tsx");
    expect(src).toContain("const gastoEnfocado = foco ? null : leerGastoEnfocado(sp);");
    expect(src).toContain("const idsResaltados = foco ? foco.ids : gastoEnfocado ? [gastoEnfocado] : [];");
    expect(src).toContain("filasResaltadasPrimero(gastosLista, idsResaltados, (g) => g.id)");
    expect(src).toContain("<FranjaGastoEnfocado");
    expect(src).toContain("hrefQuitar={hrefQuitarGastoEnfocado(sp)}");
  });

  it("Conciliación: primero los del pre-cierre y DESPUÉS el `?mov=` (queda primero)", () => {
    const src = leer("app/admin/conciliacion/page.tsx");
    expect(src).toContain("filasResaltadasPrimero(movs, idsPc, (m) => m.id)");
    expect(src).toContain("filasConFoco(movsPc.filas, enfoque.mov)");
    expect(src).toContain("<GastosSinBancoTable rows={sinBancoPc.filas} resaltados={idsPc} />");
    expect(src).toContain("<CobrosSinBancoTable rows={cobrosSinBancoPc.filas} resaltados={idsPc} />");
  });

  it("Facturas emitidas: la franja dentro de «Por facturar» y las TRES tarjetas resaltan", () => {
    const src = leer("app/admin/facturas-emitidas/page.tsx");
    const seccion = src.indexOf('<section id="por-facturar"');
    expect(seccion).toBeGreaterThan(0);
    expect(src.indexOf("<FranjaPreCierre", seccion)).toBeGreaterThan(seccion);
    expect(src.match(/resaltados=\{focoPc\?\.ids\}/g)?.length).toBe(3);
    // Cambiar un filtro del registro quita también el foco.
    expect(leer("components/admin/facturas-emitidas/registro-facturas-filtros.tsx")).toContain(
      "for (const k of PARAMS_FOCO_PRE_CIERRE) sp.delete(k);",
    );
  });
});

describe("tablas destino", () => {
  it.each(TABLAS)("%s: prop `resaltados` y la marca de la fuente única", (rel) => {
    const src = leer(rel);
    expect(src).toContain("resaltados?: string[]");
    expect(src).toMatch(/claseFilaResaltada\(|CLASE_FILA_RESALTADA|CLASE_FILA_ENFOCADA|"ring-2 ring-inset ring-amber-400 bg-amber-500\/5"/);
  });

  it("las tablas de DataTable marcan por `rowClassName`", () => {
    for (const rel of [
      "components/admin/flights/flights-table.tsx",
      "components/admin/expenses/expenses-table.tsx",
      "components/admin/conciliacion/gastos-sin-banco-table.tsx",
      "components/admin/conciliacion/cobros-sin-banco-table.tsx",
      "components/admin/expenses/otros-gastos-table.tsx",
      "components/admin/quotes/quotes-table.tsx",
      "components/admin/grupos/grupos-table.tsx",
    ]) {
      expect(leer(rel)).toMatch(/rowClassName=\{[\s\S]{0,200}claseFilaResaltada\(/);
    }
  });

  it("quotes-table resalta los renglones inversos (decisión D2: TUAS / transporte se corrigen en la cotización)", () => {
    expect(leer("components/admin/quotes/quotes-table.tsx")).toContain(
      "rowClassName={(q) => claseFilaResaltada(set, q.id)}",
    );
  });

  it("DataTable no se toca", () => {
    const dt = leer("components/admin/data-table.tsx");
    expect(dt).not.toContain("resaltados");
    expect(dt).not.toContain("pre-cierre");
    expect(dt).not.toContain("CLASE_FILA_RESALTADA");
  });

  it("los 6 params son SOLO del panel: ningún cliente del API los menciona", () => {
    for (const rel of ["lib/api/flights-server.ts", "lib/api/expenses-server.ts", "lib/api/quotes-server.ts"]) {
      expect(leer(rel)).not.toContain("pre-cierre-resolver");
    }
  });
});
