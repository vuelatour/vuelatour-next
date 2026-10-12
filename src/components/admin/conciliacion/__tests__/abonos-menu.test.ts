/**
 * Conciliación: los ABONOS sin identificar tienen el MISMO menú que Ingresos
 * → «Por conciliar» (12-oct-2026), «Es el pago de un vuelo» vive dentro de
 * «Vincular» y la página carga los catálogos que ese menú necesita. Cableado
 * leído del fuente (los diálogos viven en un portal).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "../../../../");
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");

describe("menú de abonos en Conciliación", () => {
  it("la fila de un ABONO pendiente monta AbonoAcciones (fuente única del menú de Ingresos) + Clasificar", () => {
    const src = leer("components/admin/conciliacion/movimiento-actions.tsx");
    expect(src).toContain('from "@/components/admin/ingresos/abono-acciones"');
    expect(src).toContain("if (abonos && esAbonoPendiente(movimiento))");
    expect(src).toMatch(/<AbonoAcciones[\s\S]*?abono=\{abonoPendienteDeMovimiento\(movimiento, abonos\.cuentas\[movimiento\.cuenta_bancaria_id\]\)\}/);
    expect(src).toMatch(/extras=\{[\s\S]*?Clasificar \(no es de un vuelo\)[\s\S]*?\}/);
    // El diálogo de clasificar se monta en los dos caminos.
    expect((src.match(/\{dialogoClasificar\}/g) ?? []).length).toBe(2);
    // Sin catálogos sigue el menú de siempre (con «Conciliar en Ingresos»).
    expect(src).toContain("Conciliar en Ingresos");
  });

  it("la tabla pasa `abonos` a cada fila y la página los arma con cuentas, clientes y aeronaves", () => {
    const tabla = leer("components/admin/conciliacion/movimientos-table.tsx");
    expect(tabla).toMatch(/<MovimientoActions\s+movimiento=\{m\}\s+gastos=\{gastos\}\s+abonos=\{abonos\}/);
    const pagina = leer("app/admin/conciliacion/page.tsx");
    expect(pagina).toContain('degradado.opcional("los clientes", listClients(');
    expect(pagina).toContain('degradado.opcional("las aeronaves", listAircraft(');
    expect(pagina).toContain("abonos={abonosConciliacion}");
    expect(pagina).toContain("cuentas: cuentasDeAbonos(cuentasRes.data)");
  });

  it("«Es el pago de un vuelo» ya no es un renglón del menú: vive en Vincular como «¿No está el cobro? Regístralo»", () => {
    const menu = leer("components/admin/ingresos/abono-acciones.tsx");
    expect(menu).not.toContain("Es el pago de un vuelo (registrar su cobro)");
    expect(menu).toContain('onRegistrarCobro={() => setAccion("cobro")}');
    expect(menu).toContain('{accion === "cobro" && <CobroDesdeAbonoDialog');
    expect(menu).toContain("{extras}");
    const vincular = leer("components/admin/ingresos/vincular-abono-dialog.tsx");
    expect(vincular).toContain("¿No está el cobro? Regístralo");
    expect(vincular).toContain("onRegistrarCobro?: () => void;");
    // El menú de Ingresos conserva el resto, en orden: vincular · anticipo · otro · traspaso · reverso · IA.
    const orden = ['setAccion("vincular")', 'setAccion("anticipo")', 'setAccion("otro")', 'setAccion("traspaso")', 'setAccion("reverso")', 'setAccion("ia")']
      .map((t) => menu.indexOf(t));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });
});
