/**
 * «Vincular a un cobro o ingreso» con VARIOS cobros (12-oct-2026): el
 * diálogo lleva casillas, la suma guía, el botón que cuenta y el cableado a
 * `ligarAbonoCobrosAction`; la bandeja de Conciliación pinta el lote y el
 * menú lo desvincula completo. Cableado leído del fuente (el diálogo vive
 * en un portal).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

describe("Vincular abono · varios cobros (cableado)", () => {
  it("el diálogo lista con casillas, marca lo que el abono ya paga y manda cobro_ids con 2+", () => {
    const src = leer("components/admin/ingresos/vincular-abono-dialog.tsx");
    expect(src).toContain('type="checkbox"');
    expect(src).toContain("alternarSeleccion(sel, o, opciones ?? [])");
    expect(src).toContain("setSel(seleccionInicial(r.data.movimiento.cobro_ids, lista))");
    expect(src).toContain("setConLote((r.data.movimiento.cobros_n ?? 0) >= 2)");
    expect(src).toContain("ligarAbonoCobrosAction(");
    // UN cobro sin lote previo sigue por la liga de siempre (API previo).
    expect(src).toContain("await ligarAbonoCobroAction(abono.id, { cobro_id: unica.c.cobro_id })");
    expect(src).toContain("{ligando ? \"Vinculando…\" : botonVincularAbono(marcadas)}");
    expect(src).toContain("textoSumaLoteAbono(");
    expect(src).toContain("mensajeErrorVincularCobros(r)");
    // El buscador local filtra con la fuente única de búsqueda.
    expect(src).toContain("coincideOpcion(o, texto)");
    // «¿No está el cobro? Regístralo» sigue ahí.
    expect(src).toContain("¿No está el cobro? Regístralo");
  });

  it("la action manda {cobro_ids} al PATCH …/cobro y traduce el 400 de un API previo", () => {
    const src = leer("app/admin/ingresos/actions.ts");
    expect(src).toContain("export async function ligarAbonoCobrosAction(");
    expect(src).toContain("body: { cobro_ids: ids }");
    expect(src).toContain('code: "API_SIN_LOTE_COBROS"');
  });

  it("la bandeja pinta el lote de cobros antes de las ramas de siempre y lo busca por folio", () => {
    const tabla = leer("components/admin/conciliacion/movimientos-table.tsx");
    const lote = tabla.indexOf("if (m.conciliado && esAbonoConLote(m))");
    const espejo = tabla.indexOf("const gasto = m.conciliado ? gastoUnicoDe(m) : null;");
    expect(lote).toBeGreaterThan(0);
    expect(lote).toBeLessThan(espejo);
    expect(tabla).toContain("resumenLoteCobrosFila(m)");
    expect(tabla).toContain("textoBusquedaCobros(m)");
  });

  it("el menú de la fila ve el lote como «vinculado a cobro» y lo desvincula completo con confirmación", () => {
    const menu = leer("components/admin/conciliacion/movimiento-actions.tsx");
    expect(menu).toContain("const cobrosDelLote = numeroCobrosDe(movimiento);");
    expect(menu).toContain("movimiento.cobro_id != null || vinculadoASobre || cobrosDelLote > 0");
    expect(menu).toContain("menuDesvincularCobros(cobrosDelLote)");
    expect(menu).toContain("tituloDesvincularCobros(cobrosDelLote)");
    expect(menu).toContain("textoConfirmarDesvincularCobros(cobrosDelLote)");
  });

  it("un abono con lote ya no cuenta como pendiente para el menú de Ingresos", () => {
    const src = leer("lib/admin/conciliacion-abonos.ts");
    expect(src).toContain("numeroCobrosDe(m) === 0");
  });
});
