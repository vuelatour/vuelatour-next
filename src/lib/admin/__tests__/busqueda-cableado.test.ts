import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

/**
 * CABLEADO de la búsqueda «tipo Algolia» (12-oct-2026): la fuente única
 * `lib/admin/busqueda.ts` la usan la búsqueda rápida de `DataTable` y el
 * buscador de `SearchableSelect`. Sin este candado, AGENTS.md lo afirmaría
 * y una copia local (`normaliza` + `includes`) volvería a buscar peor.
 */
describe("búsqueda tipo Algolia: cableado", () => {
  it("DataTable filtra con coincideBusqueda y ya no con su normaliza local", () => {
    const src = leer("../../../components/admin/data-table.tsx");
    expect(src).toContain('from "@/lib/admin/busqueda"');
    expect(src).toMatch(/rows\.filter\(\(r\) => coincideBusqueda\(searchText\(r\), busqueda\)\)/);
    expect(src).not.toMatch(/function normaliza\(/);
    // El orden lo decide el padre: no se reordena por relevancia.
    expect(src).not.toContain("filtrarPorBusqueda(");
  });

  it("SearchableSelect pasa el filtro de la fuente única al Combobox (etiqueta + descripción)", () => {
    const src = leer("../../../components/ui/searchable-select.tsx");
    expect(src).toContain('from "@/lib/admin/busqueda"');
    expect(src).toMatch(/filter=\{filtrarOpcion\}/);
    expect(src).toMatch(/coincideBusqueda\(textoDeOpcion\(item\), query\)/);
    expect(src).toMatch(/o\.description \? `\$\{o\.label\} \$\{o\.description\}` : o\.label/);
  });
});
