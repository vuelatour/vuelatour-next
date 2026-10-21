import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NOTA_REFACCION_CON_AVION, NOTA_REFACCION_SIN_AVION, notaRefaccionAlta } from "../refaccion-alta";

/**
 * Refacción en el alta = un gasto NORMAL (21-oct-2026, invariante 101 del
 * API). Lo que se custodia: la nota dice a dónde cae y cómo se liga a la
 * bodega desde Compras, y el bloque `inventario` (deprecado) ya no existe en
 * el panel: ni en el schema, ni en la action, ni en el alta.
 */
const raiz = path.resolve(__dirname, "../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

describe("notaRefaccionAlta", () => {
  it("con avión: gasto indirecto del avión; sin avión: gasto de la empresa que se vincula desde Compras", () => {
    expect(notaRefaccionAlta({ conAvion: true })).toBe(NOTA_REFACCION_CON_AVION);
    expect(notaRefaccionAlta({ conAvion: false })).toBe(NOTA_REFACCION_SIN_AVION);
    expect(NOTA_REFACCION_CON_AVION).toContain("hoja Gastos Indirectos");
    expect(NOTA_REFACCION_CON_AVION).toContain("Inventario/Tienda → Compras");
    expect(NOTA_REFACCION_SIN_AVION).toContain("gasto de la empresa");
    expect(NOTA_REFACCION_SIN_AVION).toContain("Vincular gasto ya registrado");
    // Nada de «¿A dónde va la refacción?» ni de precio de venta obligatorio.
    for (const t of [NOTA_REFACCION_CON_AVION, NOTA_REFACCION_SIN_AVION]) {
      expect(t).not.toContain("¿A dónde va");
      expect(t).not.toContain("precio de venta");
    }
  });
});

describe("el bloque `inventario` (deprecado en el API) ya no existe en el panel", () => {
  it("ni en el schema del alta, ni en las actions, ni en la lib vieja", () => {
    expect(leer("app/admin/expenses/schema.ts")).not.toMatch(/\binventario: z/);
    expect(leer("app/admin/expenses/actions.ts")).not.toContain("listArticulosRefaccionAction");
    expect(() => leer("lib/admin/refaccion-inventario.ts")).toThrow();
  });
});
