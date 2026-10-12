/**
 * Fecha del vuelo junto a la del cobro (12-oct-2026). Cableado: los tres
 * sitios que listan cobros candidatos (Vincular de Ingresos, Vincular de
 * Conciliación y los candidatos del 409 al registrar un ingreso) y la ficha
 * de la IA usan la MISMA frase (`fechasCandidatoCobro`), y ninguno vuelve a
 * pintar solo la fecha del cobro.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

describe("cableado de fechasCandidatoCobro", () => {
  it("Vincular (Ingresos) y Vincular (Conciliación) describen cada candidato con vuelo y cobro", () => {
    const ingresos = leer("components/admin/ingresos/vincular-abono-dialog.tsx");
    expect(ingresos).toContain("fechasCandidatoCobro(c)");
    expect(ingresos).not.toMatch(/fmtDate\(c\.fecha_cobro\)/);
    const conciliacion = leer("components/admin/conciliacion/movimiento-actions.tsx");
    expect(conciliacion).toContain("fechasCandidatoCobro(c)");
    expect(conciliacion).toContain("fechasCandidatoCobro(seleccionado)");
    expect(conciliacion).not.toMatch(/fmtDateCancun\((c|seleccionado)\.fecha_cobro\)/);
  });

  it("los candidatos del 409 y la ficha de la IA también", () => {
    const registrar = leer("components/admin/ingresos/registrar-ingreso-dialog.tsx");
    expect(registrar).toContain("fechasCandidatoCobro(c)");
    const ui = leer("lib/admin/ingresos-ui.ts");
    expect(ui).toMatch(/descripcionFichaCandidato[\s\S]*?fechasCandidatoCobro\(c\)/);
    // El tipo de la ficha y el del candidato declaran la fecha del vuelo como ADITIVA.
    expect(leer("types/ingresos.ts")).toMatch(/fecha_vuelo\?: string \| null;/);
    expect(leer("types/conciliacion.ts")).toMatch(/fecha_vuelo\?: string \| null;/);
  });
});
