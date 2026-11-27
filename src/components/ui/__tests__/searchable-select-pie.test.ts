/**
 * Selector con buscador: cuando hay más opciones de las que caben a la vista,
 * el popup lo DICE (27-nov-2026). Caso real de la oficina: «¿por qué no tengo
 * la categoría Gastos indirectos?» — estaba en el lugar 14 de 21 y la lista
 * no enseña barra de desplazamiento: parecía que terminaba en la sexta.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OPCIONES_A_LA_VISTA, textoMasOpciones } from "../searchable-select";
import { CATEGORIAS_CAPTURA_GASTO_NUEVO, categoriaGastoLabel } from "@/lib/admin/categorias-gasto";

const FUENTE = readFileSync(path.resolve(__dirname, "../searchable-select.tsx"), "utf8");

describe("pie del selector con buscador", () => {
  it("dice cuántas opciones hay y cómo llegar a ellas", () => {
    expect(textoMasOpciones(21)).toBe("21 opciones · desliza la lista o escribe para buscar");
  });

  it("solo aparece con más opciones de las que caben y se oculta cuando la búsqueda no encuentra nada", () => {
    expect(OPCIONES_A_LA_VISTA).toBe(6);
    expect(FUENTE).toContain("{options.length > OPCIONES_A_LA_VISTA && (");
    expect(FUENTE).toContain("{textoMasOpciones(options.length)}");
    expect(FUENTE).toContain("group-data-empty/combobox-content:hidden");
  });

  it("el caso de la oficina: «Gastos indirectos de avión» SÍ está en el alta de un gasto, más abajo de lo que cabe", () => {
    const lugar = CATEGORIAS_CAPTURA_GASTO_NUEVO.indexOf("INDIRECTO") + 1;
    expect(lugar).toBeGreaterThan(OPCIONES_A_LA_VISTA);
    expect(CATEGORIAS_CAPTURA_GASTO_NUEVO.length).toBeGreaterThan(OPCIONES_A_LA_VISTA);
    expect(categoriaGastoLabel("INDIRECTO")).toBe("Gastos indirectos de avión");
  });
});
