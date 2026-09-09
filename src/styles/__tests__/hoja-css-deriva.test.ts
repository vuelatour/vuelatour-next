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

/**
 * CSS de PANTALLA (`cotizacion-hoja-pantalla.css`): no se sincroniza con
 * pyservices, pero tiene invariantes propios: todo cuelga de `.cot-` (nunca
 * sale del papel/escenario) y el ACENTO de interacción (`--cot-acento`,
 * feedback del cliente 9-sep-2026) SOLO existe en edición — cada regla que
 * lo use va bajo `.cot-hoja:not(.cot-hoja--lectura)` y ninguna regla de
 * lectura pinta acento ni subrayado. En lectura bloqueada la hoja ES el PDF.
 */
describe("CSS de pantalla de la hoja (acento solo en edición)", () => {
  const css = readFileSync(path.join(RAIZ, "src/styles/cotizacion-hoja-pantalla.css"), "utf8");
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectores: m[1]
      .trim()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cuerpo: m[2],
  }));

  it("llaves balanceadas y sin bloques anidados (el parser del test es plano)", () => {
    expect((sinComentarios.match(/\{/g) ?? []).length).toBe((sinComentarios.match(/\}/g) ?? []).length);
    expect(sinComentarios).not.toMatch(/@media|@supports|@container|@layer/);
    expect(reglas.length).toBeGreaterThan(20);
  });

  it("todo selector cuelga de .cot-", () => {
    for (const r of reglas) for (const s of r.selectores) expect(s.startsWith(".cot-"), s).toBe(true);
  });

  it("toda regla que usa var(--cot-acento) va bajo :not(.cot-hoja--lectura)", () => {
    const conAcento = reglas.filter((r) => /var\(--cot-acento/.test(r.cuerpo));
    expect(conAcento.length).toBeGreaterThan(0);
    for (const r of conAcento) {
      for (const s of r.selectores) {
        expect(s.includes(":not(.cot-hoja--lectura)"), `${s} usa el acento fuera de edición`).toBe(true);
      }
    }
  });

  it("ninguna regla de lectura pinta acento ni subrayado", () => {
    // `.cot-hoja--lectura` como selector real (no dentro de `:not(...)`).
    const deLectura = reglas.filter((r) => r.selectores.some((s) => /(^|[^(])\.cot-hoja--lectura/.test(s)));
    expect(deLectura.length).toBeGreaterThan(0);
    for (const r of deLectura) {
      expect(r.cuerpo, r.selectores.join(", ")).not.toMatch(/--cot-acento|text-decoration|#dc2626|#b91c1c|220, 38, 38/);
    }
  });
});
