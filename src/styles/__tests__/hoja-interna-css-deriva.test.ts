import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DERIVA del CSS de la HOJA INTERNA (Fase 2.2, 22-sep-2026): la hoja interna
 * que edita la oficina y el PDF interno que se imprime comparten
 * `cotizacion-interna.css`, que vive en pyservices y se COPIA aquí con
 * `npm run sync:hoja-interna-css`. Si el repo hermano está en el workspace,
 * los archivos deben ser byte-idénticos; si no está, ese caso se omite.
 *
 * Hermano de `hoja-css-deriva.test.ts` (la hoja del CLIENTE, raíz
 * `.cot-hoja`). La FUENTE (`cotizacion-fuente.css`) la custodia aquel test:
 * las dos hojas incrustan la misma Arimo.
 */
const RAIZ = path.resolve(__dirname, "..", "..", "..");
const HERMANO = path.resolve(RAIZ, "..", "vuelatour-pyservices");

const PARES: Array<[string, string]> = [
  ["app/static/cotizacion-interna.css", "src/styles/cotizacion-interna.css"],
];

const hayHermano = existsSync(path.join(HERMANO, "app", "static", "cotizacion-interna.css"));

describe("CSS de la hoja interna sincronizado con pyservices", () => {
  it.skipIf(!hayHermano).each(PARES)("%s == %s", (src, dst) => {
    const a = readFileSync(path.join(HERMANO, src), "utf8");
    const b = readFileSync(path.join(RAIZ, dst), "utf8");
    expect(b, `Corre \`npm run sync:hoja-interna-css\`: ${dst} difiere de pyservices`).toBe(a);
  });

  it("todo selector del cuerpo cuelga de .cot-interna", () => {
    const css = readFileSync(path.join(RAIZ, "src/styles/cotizacion-interna.css"), "utf8");
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectores = [...sinComentarios.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectores.length).toBeGreaterThan(20);
    for (const sel of selectores) {
      for (const parte of sel.split(",")) {
        expect(parte.trim().startsWith(".cot-interna"), parte).toBe(true);
      }
    }
  });

  /**
   * El CSS del PDF interno NO puede llevar reglas de papel (`@page`, el
   * `margin: 0` del body): eso solo tiene sentido impreso y el panel lo
   * pintaría mal. Vive en `_estilos_page_interno()` de pyservices.
   */
  it("el CSS compartido no trae reglas de papel (@page, @font-face)", () => {
    const css = readFileSync(path.join(RAIZ, "src/styles/cotizacion-interna.css"), "utf8");
    // Sin comentarios: la cabecera del archivo EXPLICA que `@page` se quedó
    // en pyservices, y esa mención no es una regla.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/@page|@font-face/);
  });
});

/**
 * CSS de PANTALLA (`cotizacion-interna-pantalla.css`): no se sincroniza, pero
 * tiene los mismos invariantes que su hermano del cliente — todo cuelga de
 * `.cot-interna` (nunca sale del papel) y el ACENTO de interacción solo
 * existe en edición: en LECTURA la hoja interna es el PDF interno.
 */
describe("CSS de pantalla de la hoja interna (acento solo en edición)", () => {
  const css = readFileSync(
    path.join(RAIZ, "src/styles/cotizacion-interna-pantalla.css"),
    "utf8",
  );
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
    expect((sinComentarios.match(/\{/g) ?? []).length).toBe(
      (sinComentarios.match(/\}/g) ?? []).length,
    );
    expect(sinComentarios).not.toMatch(/@media|@supports|@container|@layer/);
    expect(reglas.length).toBeGreaterThan(20);
  });

  it("todo selector cuelga de .cot-interna", () => {
    for (const r of reglas) {
      for (const s of r.selectores) expect(s.startsWith(".cot-interna"), s).toBe(true);
    }
  });

  it("toda regla que usa var(--cot-acento) va bajo :not(.cot-interna--lectura)", () => {
    const conAcento = reglas.filter((r) => /var\(--cot-acento/.test(r.cuerpo));
    expect(conAcento.length).toBeGreaterThan(0);
    for (const r of conAcento) {
      for (const s of r.selectores) {
        // La declaración de los tokens vive en la raíz del papel.
        if (s.includes(".cot-interna--pantalla") && !s.includes(" ")) continue;
        expect(
          s.includes(":not(.cot-interna--lectura)"),
          `${s} usa el acento fuera de edición`,
        ).toBe(true);
      }
    }
  });

  it("la croma del renglón fuera del total va bajo :not(.cot-interna--lectura)", () => {
    const croma = reglas.filter((r) =>
      r.selectores.some((s) => /\.cot-fila--fuera|\.cot-aviso/.test(s)),
    );
    expect(croma.length).toBeGreaterThan(0);
    for (const r of croma) {
      for (const s of r.selectores) {
        expect(
          s.includes(":not(.cot-interna--lectura)"),
          `${s} pintaría sobre la hoja impresa`,
        ).toBe(true);
      }
    }
  });

  /**
   * La marca de agua «INTERNA» es lo que impide confundir esta vista con la
   * del cliente en un monitor compartido: tiene que existir y ser del papel,
   * no del fondo del shell.
   */
  it("la marca de agua «INTERNA» existe y es del papel", () => {
    const agua = reglas.filter((r) => r.selectores.some((s) => s.includes(".cot-marca-agua")));
    expect(agua.length).toBeGreaterThan(0);
    for (const r of agua) {
      for (const s of r.selectores) expect(s.includes(".cot-interna--pantalla"), s).toBe(true);
    }
  });
});
