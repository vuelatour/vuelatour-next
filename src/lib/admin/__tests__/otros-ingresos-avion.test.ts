import { describe, expect, it } from "vitest";
import {
  ETIQUETA_FILA_OTROS_INGRESOS_AVION,
  SUBLABEL_OTROS_INGRESOS_AVION,
  TITULO_BADGE_OTROS_INGRESOS_SIN_TC,
  TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL,
  hintDashboardOtrosIngresosAviones,
  hintKpiOtrosIngresosAviones,
  textoBadgeOtrosIngresosSinTc,
  textoBadgeOtrosIngresosTcOficial,
  textoCeldaOtrosIngresosAvion,
  tituloOtrosIngresosAvion,
} from "@/lib/admin/otros-ingresos-avion";
import type { DetalleOtroIngresoAvion } from "@/types/profit-sharing";

/**
 * Otros ingresos ASIGNADOS a un avión en el reparto y los tableros
 * (13-oct-2026, API 0.0.75). Caso real ING-4: reembolso de $46,550.80 MXN
 * del servicio de 50 h de N990GG, al T.C. oficial 18 ⇒ $2,586.16 USD que
 * SUMAN al saldo del avión. Los textos se congelan aquí; los números son del
 * API.
 */

const ING4: DetalleOtroIngresoAvion = {
  id: "i-4",
  clave: "ING-4",
  fecha: "2026-09-04",
  categoria: "REEMBOLSO_DEVOLUCION",
  categoria_etiqueta: "Reembolsos y devoluciones recibidos",
  concepto: "TRANSF INTERBANCARIA SPEI · angel alvarez",
  moneda: "MXN",
  monto: 46550.8,
  comision: null,
  neto: 46550.8,
  usd: 2586.16,
  tc: 18,
  tc_oficial: true,
};

describe("la fila de la cascada y su tooltip", () => {
  it("etiqueta y sublabel literales", () => {
    expect(ETIQUETA_FILA_OTROS_INGRESOS_AVION).toBe("Otros ingresos del avión");
    expect(SUBLABEL_OTROS_INGRESOS_AVION).toBe(
      "reembolsos y ventas registrados en Ingresos con este avión, netos de comisión",
    );
  });

  it("un renglón por ingreso; el que no tiene T.C. lo dice", () => {
    expect(tituloOtrosIngresosAvion([ING4])).toBe("ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · $2,586.16");
    expect(
      tituloOtrosIngresosAvion([
        ING4,
        { ...ING4, id: "i-9", clave: "ING-9", concepto: "Intereses", usd: null, tc: null, tc_oficial: false },
      ]),
    ).toBe("ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · $2,586.16\nING-9 · Intereses · sin T.C.");
  });

  it("sin detalle (API previo o lista vacía) ⇒ sin tooltip", () => {
    expect(tituloOtrosIngresosAvion(undefined)).toBeUndefined();
    expect(tituloOtrosIngresosAvion(null)).toBeUndefined();
    expect(tituloOtrosIngresosAvion([])).toBeUndefined();
  });
});

describe("badges", () => {
  it("sin TC (ámbar) y con TC oficial (informativo)", () => {
    expect(textoBadgeOtrosIngresosSinTc(46550.8)).toBe("Otros ingresos sin TC · 46,550.80 MXN");
    expect(TITULO_BADGE_OTROS_INGRESOS_SIN_TC).toBe(
      "Ingresos del avión en MXN sin tipo de cambio propio ni T.C. oficial disponible para su fecha: no entraron al saldo.",
    );
    expect(textoBadgeOtrosIngresosTcOficial(1)).toBe("1 ingreso(s) con TC oficial");
    expect(textoBadgeOtrosIngresosTcOficial(3)).toBe("3 ingreso(s) con TC oficial");
    expect(TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL).toBe(
      "Otros ingresos del avión en MXN sin tipo de cambio capturado: se convirtieron con el T.C. oficial de referencia del día del ingreso (open.er-api / BCE). Ya suman en el saldo.",
    );
  });
});

describe("KPI del reparto y tablero ejecutivo", () => {
  it("hint del KPI de venta: solo con otros ingresos", () => {
    expect(hintKpiOtrosIngresosAviones(2586.16)).toBe(" · + $2,586.16 otros ingresos de aviones");
    expect(hintKpiOtrosIngresosAviones(0)).toBe("");
    expect(hintKpiOtrosIngresosAviones(-1)).toBe("");
  });

  it("hint del tablero y celda por avión", () => {
    expect(hintDashboardOtrosIngresosAviones(2327.54)).toBe(
      "+ $2,327.54 otros ingresos de los aviones (suman al saldo)",
    );
    expect(hintDashboardOtrosIngresosAviones(0)).toBeUndefined();
    expect(textoCeldaOtrosIngresosAvion(2327.54)).toBe("+ $2,327.54 otros");
    expect(textoCeldaOtrosIngresosAvion(1200)).toBe("+ $1,200 otros");
  });
});
