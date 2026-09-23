/**
 * «En estas ventanas no se desplaza hacia abajo para el botón de guardado, lo
 * que hago es moverme con la tecla tabulador y atinarle» (oficina,
 * 22-sep-2026, con captura del diálogo de editar hélice en una laptop).
 *
 * `DialogContent` no tenía ni alto máximo ni desbordamiento: en una pantalla
 * baja el diálogo crecía más que la ventana y su pie —donde vive «Guardar
 * cambios»— quedaba FUERA, sin forma de llegar con la rueda. Lo mismo el
 * panel lateral (`SheetContent`).
 *
 * El test lee el ARCHIVO (no el DOM): estos son primitivos de Base UI que
 * renderizan por portal y lo que se custodia es que las clases sigan ahí —
 * quitarlas devuelve el bug a TODOS los diálogos del panel a la vez.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const UI = path.resolve(__dirname, "..");
const leer = (f: string) => readFileSync(path.join(UI, f), "utf8");

describe("los diálogos del panel se desplazan", () => {
  it("DialogContent tiene alto máximo y desbordamiento vertical", () => {
    const css = leer("dialog.tsx");
    expect(css).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(css).toMatch(/\boverflow-y-auto\b/);
    // Que el gesto no se lo lleve la página de atrás.
    expect(css).toMatch(/\boverscroll-contain\b/);
  });

  it("SheetContent desplaza su cuerpo", () => {
    const css = leer("sheet.tsx");
    expect(css).toMatch(/\boverflow-y-auto\b/);
    expect(css).toMatch(/\boverscroll-contain\b/);
  });

  it("el pie del diálogo sigue existiendo (es lo que hay que alcanzar)", () => {
    expect(leer("dialog.tsx")).toContain('data-slot="dialog-footer"');
  });
});
