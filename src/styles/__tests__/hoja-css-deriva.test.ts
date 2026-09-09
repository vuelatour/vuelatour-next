import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DERIVA del CSS de la hoja (form-as-document, 8-sep-2026): la hoja que
 * edita el operador y el PDF comparten `cotizacion-fuente.css` +
 * `cotizacion-hoja.css`, que viven en pyservices y se COPIAN aquí con
 * `npm run sync:hoja-css`. Si el repo hermano está en el workspace, los
 * archivos deben ser byte-idénticos; si no está, el test se omite.
 */
const RAIZ = path.resolve(__dirname, "..", "..", "..");
const HERMANO = path.resolve(RAIZ, "..", "vuelatour-pyservices");

const PARES: Array<[string, string]> = [
  ["app/static/cotizacion-fuente.css", "src/styles/cotizacion-fuente.css"],
  ["app/static/cotizacion-hoja.css", "src/styles/cotizacion-hoja.css"],
];

const hayHermano = existsSync(path.join(HERMANO, "app", "static", "cotizacion-hoja.css"));

describe("CSS de la hoja sincronizado con pyservices", () => {
  it.skipIf(!hayHermano).each(PARES)("%s == %s", (src, dst) => {
    const a = readFileSync(path.join(HERMANO, src), "utf8");
    const b = readFileSync(path.join(RAIZ, dst), "utf8");
    expect(b, `Corre \`npm run sync:hoja-css\`: ${dst} difiere de pyservices`).toBe(a);
  });

  it("todo selector del cuerpo cuelga de .cot-hoja", () => {
    const css = readFileSync(path.join(RAIZ, "src/styles/cotizacion-hoja.css"), "utf8");
    // Quita comentarios y toma los selectores (texto antes de cada `{`).
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectores = [...sinComentarios.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    for (const sel of selectores) {
      for (const parte of sel.split(",")) {
        expect(parte.trim().startsWith(".cot-hoja"), parte).toBe(true);
      }
    }
  });
});
