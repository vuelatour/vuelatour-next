/**
 * Ningún componente del calendario escribe un hex a mano (24-sep-2026).
 *
 * El color de cada evento lo decide el API (`ev.color` de `GET /v1/calendar`)
 * y la leyenda sale de `lib/admin/calendario-semaforo.ts`. Cuando el cliente
 * movió el descanso del azul `#3B82F6` al morado `#8B5CF6` (y el azul pasó a
 * «Pagado»), un hex suelto en un chip habría dejado al descanso pintado de
 * «pagado» sin que nadie lo notara. El test lee los ARCHIVOS (no el DOM): lo
 * que se custodia es que no haya literales de color en los componentes.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "..");
const componentes = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

describe("componentes del calendario sin hex sueltos", () => {
  it("hay componentes que revisar", () => {
    expect(componentes).toContain("calendar-grid.tsx");
    expect(componentes).toContain("leyenda-semaforo.tsx");
  });

  it.each(componentes)("%s no escribe colores #RRGGBB a mano", (archivo) => {
    const fuente = readFileSync(path.join(DIR, archivo), "utf8");
    // Se quitan los comentarios: documentar un hex está bien, pintarlo no.
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(codigo).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("el grid pinta el color que manda el API", () => {
    const grid = readFileSync(path.join(DIR, "calendar-grid.tsx"), "utf8");
    expect(grid).toContain("backgroundColor: ev.color");
    // Y no decide colores por su cuenta (p. ej. por `pagado`).
    expect(grid).not.toMatch(/ev\.pagado\s*\?\s*["'#]/);
  });
});
