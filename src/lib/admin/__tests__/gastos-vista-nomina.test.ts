/**
 * Nómina fuera de Gastos (16-oct-2026, API 0.0.90) — la parte de
 * `lib/admin/gastos-vista.ts`: la lista, los contadores y el Excel excluyen
 * SIEMPRE la nómina (`excluir_categoria=NOMINA`), el filtro «Categoría» ya no
 * la ofrece, `?categoria=NOMINA` se ignora con la franja que manda al módulo,
 * y el 400 de un API previo se reconoce para releer sin el campo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { CATEGORIAS_FILTRO_GASTO } from "@/lib/admin/categorias-gasto";
import {
  CAMPOS_OPCIONALES_GASTOS,
  CAMPO_EXCLUIR_CATEGORIA,
  CATEGORIAS_FILTRO_GASTOS_VISTA,
  CATEGORIA_FUERA_DE_GASTOS,
  DESCRIPCION_NOMINA_FUERA_DE_GASTOS,
  ETIQUETA_IR_A_NOMINA,
  TITULO_NOMINA_FUERA_DE_GASTOS,
  esApiSinExcluirCategoria,
  hrefNominaDesdeGastos,
  leerFiltrosGastos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
  sinExcluirCategoria,
} from "@/lib/admin/gastos-vista";

const HOY = "2026-10-16";
const filtros = (qs: string) => {
  const p = new URLSearchParams(qs);
  return leerFiltrosGastos((k) => p.get(k));
};

describe("la nómina se excluye SIEMPRE de Gastos", () => {
  it("lista, contadores y Excel llevan `excluir_categoria: NOMINA` (también con otra categoría)", () => {
    expect(CATEGORIA_FUERA_DE_GASTOS).toBe("NOMINA");
    expect(CAMPO_EXCLUIR_CATEGORIA).toBe("excluir_categoria");
    expect(CAMPOS_OPCIONALES_GASTOS).toEqual(["excluir_categoria"]);
    const f = filtros("f=pendientes&categoria=OPERACIONES");
    expect(queryBaseGastos(f, HOY).excluir_categoria).toBe("NOMINA");
    expect(queryListaGastos(f, HOY)).toMatchObject({ excluir_categoria: "NOMINA", pendientes: true });
    expect(queryExcelGastos(f, HOY)).toMatchObject({
      excluir_categoria: "NOMINA",
      categoria: "OPERACIONES",
      pendientes: "true",
    });
  });

  it("el filtro «Categoría» ofrece las 23 restantes, en el mismo orden y sin «Nómina»", () => {
    expect(CATEGORIAS_FILTRO_GASTOS_VISTA).not.toContain("NOMINA");
    expect(CATEGORIAS_FILTRO_GASTOS_VISTA).toEqual(CATEGORIAS_FILTRO_GASTO.filter((c) => c !== "NOMINA"));
    expect(CATEGORIAS_FILTRO_GASTOS_VISTA).toHaveLength(CATEGORIAS_FILTRO_GASTO.length - 1);
  });

  it("`?categoria=NOMINA` (enlace viejo) se IGNORA y marca la franja; nada viaja al API", () => {
    const f = filtros("categoria=NOMINA&desde=2026-09-01&hasta=2026-09-30");
    expect(f.categoria).toBeUndefined();
    expect(f.nominaIgnorada).toBe(true);
    expect(queryBaseGastos(f, HOY).categoria).toBeUndefined();
    expect(queryExcelGastos(f, HOY)).not.toHaveProperty("nominaIgnorada");
    // Sin la categoría de nómina, la llave ni existe.
    expect(filtros("categoria=OPERACIONES")).not.toHaveProperty("nominaIgnorada");
  });
});

describe("franja «La nómina se lleva en su propio módulo»", () => {
  it("textos exactos", () => {
    expect(TITULO_NOMINA_FUERA_DE_GASTOS).toBe("La nómina se lleva en su propio módulo");
    expect(DESCRIPCION_NOMINA_FUERA_DE_GASTOS).toBe(
      "Los pagos de nómina ya no salen en Gastos: en Nómina se suman por mes o quincena y se reparten entre los aviones. Aquí ves todos los demás gastos.",
    );
    expect(ETIQUETA_IR_A_NOMINA).toBe("Ir a Nómina");
  });

  it("«Ir a Nómina» abre el MES del `desde` (o del `hasta`); sin fechas, el módulo", () => {
    expect(hrefNominaDesdeGastos({ desde: "2026-09-01", hasta: "2026-09-30" })).toBe("/admin/nomina?mes=2026-09");
    expect(hrefNominaDesdeGastos({ hasta: "2026-10-31" })).toBe("/admin/nomina?mes=2026-10");
    expect(hrefNominaDesdeGastos({})).toBe("/admin/nomina");
    expect(hrefNominaDesdeGastos({ desde: "basura" })).toBe("/admin/nomina");
  });
});

describe("API previo: el 400 de `excluir_categoria`", () => {
  const err400 = (m: string | string[]) => new ApiError({ statusCode: 400, code: "BAD_REQUEST", message: m as string });

  it("se reconoce SOLO el 400 de ese campo", () => {
    expect(esApiSinExcluirCategoria(err400("property excluir_categoria should not exist"))).toBe(true);
    expect(esApiSinExcluirCategoria(err400("property desde should not exist"))).toBe(false);
    expect(
      esApiSinExcluirCategoria(new ApiError({ statusCode: 502, code: "X", message: "property excluir_categoria should not exist" })),
    ).toBe(false);
    expect(esApiSinExcluirCategoria(null)).toBe(false);
    expect(esApiSinExcluirCategoria("texto")).toBe(false);
  });

  it("`sinExcluirCategoria` suelta SOLO ese campo", () => {
    expect(sinExcluirCategoria({ excluir_categoria: "NOMINA", desde: "2026-10-01", conciliado: false })).toEqual({
      desde: "2026-10-01",
      conciliado: false,
    });
  });
});

describe("cableado de la página de Gastos", () => {
  const pagina = readFileSync(path.resolve(__dirname, "../../../app/admin/expenses/page.tsx"), "utf8");
  it("el Excel declara `excluir_categoria` como campo opcional y la franja sale con `nominaIgnorada`", () => {
    expect(pagina).toMatch(/camposOpcionales=\{CAMPOS_OPCIONALES_GASTOS\}/);
    expect(pagina).toMatch(/filtros\.nominaIgnorada\s*&&/);
    expect(pagina).toMatch(/data-franja="nomina-fuera-de-gastos"/);
    expect(pagina).toMatch(/href=\{hrefNominaDesdeGastos\(filtros\)\}/);
  });
  it("la barra de filtros ofrece `CATEGORIAS_FILTRO_GASTOS_VISTA` (sin nómina)", () => {
    const barra = readFileSync(
      path.resolve(__dirname, "../../../components/admin/expenses/expenses-filter-bar.tsx"),
      "utf8",
    );
    expect(barra).toMatch(/CATEGORIAS_FILTRO_GASTOS_VISTA\.map\(opcionCategoriaGasto\)/);
    expect(barra).not.toMatch(/CATEGORIAS_FILTRO_GASTO\.map/);
  });
});
