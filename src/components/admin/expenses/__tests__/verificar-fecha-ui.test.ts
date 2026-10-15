/**
 * «Verificar / editar» y la fecha que corrige Conciliación (revisión del
 * 14-oct-2026): `fecha_gasto` viaja en el PATCH SOLO si se cambió en ESTE
 * diálogo, como `estatus_facturacion`. Con la ruta nueva de «Vincular gasto»
 * (`PATCH /v1/expenses/:id/fecha`) hay un SEGUNDO escritor de la fecha:
 * mandar la que el formulario tenía al abrirse la revertía en silencio y el
 * PATCH general disparaba el auto-cruce con la fecha vieja. Cableado por
 * regex sobre el fuente (el diálogo no se monta en estas pruebas).
 *
 * «Se cambió AQUÍ» = contra la BASE de la sesión (`baseFormRef`, revisión del
 * 14-oct-2026), NUNCA contra el `gasto` vivo: el formulario conserva lo de la
 * apertura y un refresh trae la fecha que corrigió Conciliación; comparar con
 * el vivo la tomaba como cambio del usuario y la revertía.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../expense-verify-dialog.tsx"), "utf8");

describe("«Verificar / editar»: la fecha solo viaja si se cambió aquí", () => {
  it("con la misma fecha con que se abrió, se QUITA del PATCH (la de Conciliación no se revierte)", () => {
    expect(src).toMatch(
      /if \(values\.fecha_gasto === \(baseForm\.fecha_gasto \?\? ""\)\.slice\(0, 10\)\) \{\s*delete \(payload as \{ fecha_gasto\?: unknown \}\)\.fecha_gasto;\s*\}/,
    );
    // Jamás contra el gasto VIVO (un refresh lo trae con la fecha nueva).
    expect(src).not.toContain('values.fecha_gasto === (gasto.fecha_gasto ?? "")');
    expect(src).not.toContain('values.fecha_gasto !== (gasto.fecha_gasto ?? "")');
  });

  it("se quita DESPUÉS de armar el payload con los valores del formulario y ANTES de mandarlo", () => {
    const arma = src.indexOf("let payload: Record<string, unknown> = { ...values, verificado: true };");
    const quita = src.indexOf("delete (payload as { fecha_gasto?: unknown }).fecha_gasto;");
    const manda = src.indexOf("const result = await verifyGastoAction(gasto.id, payload);");
    expect(arma).toBeGreaterThan(-1);
    expect(quita).toBeGreaterThan(arma);
    expect(manda).toBeGreaterThan(quita);
  });

  it("la hora de la carga tampoco viaja sin cambio de fecha (camposCargaParaPatch compara con la BASE)", () => {
    expect(src).toContain("Object.assign(payload, camposCargaParaPatch(baseForm, values));");
  });

  it("la confirmación de fecha sospechosa también mide «cambió aquí» contra la base", () => {
    const submit = src.slice(src.indexOf("const onSubmit = handleSubmit"), src.indexOf("const fechaIaOtroAnio"));
    expect(submit).toContain('const original = (baseFormRef.current.fecha_gasto ?? "").slice(0, 10);');
  });
});
