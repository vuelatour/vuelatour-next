/**
 * `ExcelExportButton` con nombre accesible (12-oct-2026): los siete tiles de
 * «Balance por avión» dicen «Excel» y necesitan `title` + `aria-label` con la
 * matrícula. Sin esas props el marcado es byte a byte el botón de siempre
 * (Reparto, Exports e Inventario no cambian).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// La descarga real lee la sesión del navegador: aquí no es parte del test.
vi.mock("@/lib/download", () => ({ descargarDelApi: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { ExcelExportButton } = await import("../excel-export-button");

const NOMBRE = "Descargar el balance de XB-PEV en Excel";

describe("ExcelExportButton: título y nombre accesible", () => {
  it("con `title` y `aria-label` el botón los lleva, conserva «Excel» y la manita", () => {
    const html = renderToStaticMarkup(
      <ExcelExportButton path="/x" filename="x.xlsx" label="Excel" title={NOMBRE} aria-label={NOMBRE} />,
    );
    expect(html).toMatch(/<button[^>]*title="Descargar el balance de XB-PEV en Excel"/);
    expect(html).toMatch(/<button[^>]*aria-label="Descargar el balance de XB-PEV en Excel"/);
    expect(html).toContain(">Excel<");
    expect(html).toContain("cursor-pointer");
    // En reposo no hay `aria-busy` (solo aparece mientras genera).
    expect(html).not.toContain("aria-busy");
  });

  it("sin ellas el marcado no contiene `aria-label=` ni `title=` (el botón de siempre)", () => {
    const html = renderToStaticMarkup(<ExcelExportButton path="/x" filename="x.xlsx" label="Excel" />);
    expect(html).not.toContain("aria-label=");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("aria-busy");
    expect(html).toContain(">Excel<");
  });

  it("en carga, con `aria-label`, el nombre accesible antepone «Generando…» y el botón lleva `aria-busy`", () => {
    // No hay DOM para pulsar el botón: se vigila el cableado en el fuente.
    const src = readFileSync(path.resolve(__dirname, "../excel-export-button.tsx"), "utf8");
    expect(src).toContain("`Generando… ${ariaLabel}`");
    expect(src).toContain("aria-busy={loading || undefined}");
    expect(src).toContain("aria-label={nombre}");
  });
});
