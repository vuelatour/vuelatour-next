import { describe, expect, it } from "vitest";
import {
  cubreGasto,
  estadoParcialDeGasto,
  faltanteDe,
  fmtMontoConciliacion,
  notaParcialGasto,
  textoFaltanteGasto,
  textoGastoYaCubierto,
  toastVinculoGasto,
} from "@/lib/admin/conciliacion-parcial";

describe("faltanteDe / cubreGasto", () => {
  it("resta la suma ligada y nunca devuelve negativos", () => {
    expect(faltanteDe(403.61, 277.79)).toBe(125.82);
    expect(faltanteDe("403.61", "500")).toBe(0);
    expect(faltanteDe(null, null)).toBe(0);
  });

  it("cubre con la tolerancia de 1.00 de la moneda del gasto", () => {
    expect(cubreGasto(277.79, 277.79)).toBe(true);
    expect(cubreGasto(277.79, 277.0)).toBe(true); // 0.79 de diferencia
    expect(cubreGasto(277.79, 276.0)).toBe(false);
  });
});

describe("estadoParcialDeGasto", () => {
  it("devuelve null sin los aditivos del API (skew de deploy)", () => {
    expect(estadoParcialDeGasto({ monto: "403.61" })).toBeNull();
    expect(estadoParcialDeGasto(null)).toBeNull();
  });

  it("marca parcial cuando lo ligado no cubre", () => {
    const e = estadoParcialDeGasto({
      monto: "403.61",
      moneda: "MXN",
      conciliado: false,
      monto_vinculado: "277.79",
      faltante: "125.82",
    });
    expect(e).toMatchObject({ hayLigados: true, cubierto: false, parcial: true });
    expect(e!.faltante).toBe(125.82);
  });

  it("marca cubierto cuando la suma alcanza el monto", () => {
    const e = estadoParcialDeGasto({
      monto: "403.61",
      monto_vinculado: "403.61",
      faltante: 0,
      conciliado: true,
    });
    expect(e).toMatchObject({ cubierto: true, parcial: false, hayLigados: true });
  });
});

describe("textos del pago parcial", () => {
  it("«faltan $X de $Y» solo cuando hay pago parcial", () => {
    expect(
      textoFaltanteGasto({
        monto: 403.61,
        monto_vinculado: 277.79,
        faltante: 125.82,
      }),
    ).toBe("faltan $125.82 de $403.61");
    expect(
      textoFaltanteGasto({ monto: 403.61, monto_vinculado: 403.61, faltante: 0 }),
    ).toBeNull();
    expect(textoFaltanteGasto({ monto: 403.61 })).toBeNull();
  });

  it("la nota de la tabla solo lleva el faltante, con moneda si no es MXN", () => {
    expect(
      notaParcialGasto({
        monto: 500,
        moneda: "USD",
        monto_vinculado: 200,
        faltante: 300,
      }),
    ).toBe("faltan $300.00 USD");
  });

  it("formatea montos es-MX con dos decimales", () => {
    expect(fmtMontoConciliacion("1234.5")).toBe("$1,234.50");
    expect(fmtMontoConciliacion(1234.5, "MXN")).toBe("$1,234.50");
    expect(fmtMontoConciliacion(1234.5, "USD")).toBe("$1,234.50 USD");
  });
});

describe("toastVinculoGasto", () => {
  it("dice «Gasto cubierto» cuando el API lo reporta conciliado", () => {
    const t = toastVinculoGasto({
      gasto_conciliado: true,
      monto_vinculado: 403.61,
      faltante: 0,
    });
    expect(t.titulo).toBe("Gasto cubierto");
    expect(t.descripcion).toContain("$403.61");
  });

  it("dice cuánto falta en un pago parcial", () => {
    const t = toastVinculoGasto({
      gasto_conciliado: false,
      monto_vinculado: 277.79,
      faltante: 125.82,
    });
    expect(t.titulo).toBe("Pago parcial: faltan $125.82");
    expect(t.descripcion).toContain("$277.79");
    expect(t.descripcion).toContain("Gastos sin banco");
  });

  it("con un API sin desplegar conserva el mensaje de hoy", () => {
    expect(toastVinculoGasto(null)).toEqual({ titulo: "Gasto vinculado" });
    expect(toastVinculoGasto({})).toEqual({ titulo: "Gasto vinculado" });
  });
});

describe("textoGastoYaCubierto (409)", () => {
  it("usa el mensaje del API y enumera los cargos ya ligados", () => {
    const t = textoGastoYaCubierto(
      "Ese gasto ya está cubierto: $277.79 de $277.79 (cargo del 07 sep). Si este cargo es otro pago de la misma factura, el gasto debe valer la suma de los dos.",
      {
        monto_gasto: 277.79,
        suma_ligada: 277.79,
        faltante: 0,
        movimientos: [{ id: "m1", fecha: "2026-09-07", monto: 277.79 }],
      },
    );
    expect(t.titulo).toContain("ya está cubierto");
    expect(t.descripcion).toContain("$277.79");
    expect(t.descripcion).toContain("Cargos ya ligados");
  });

  it("sin mensaje ni detalle da un texto accionable", () => {
    const t = textoGastoYaCubierto(null, undefined);
    expect(t.titulo).toContain("cubierto");
    expect(t.descripcion).toContain("Desvincula");
  });
});

/**
 * REVISIÓN 14-sep-2026 — el API también rechaza un cargo MÁS GRANDE que el
 * gasto aunque no haya ningún cargo ligado (la regla mira la SUMA). Ahí
 * `details.movimientos` llega VACÍO y mandar a «desvincular» sería mandar a
 * buscar algo que no existe. Sin `details` (API viejo) el texto genérico se
 * conserva: no se puede afirmar que no haya cargos.
 */
describe("textoGastoYaCubierto — cargo mayor que el gasto (sin cargos ligados)", () => {
  it("con movimientos:[] explícito dice que se corrija el monto, no que se desvincule", () => {
    const t = textoGastoYaCubierto(
      "Ese cargo ($1,850.00) es MAYOR que el gasto ($277.79): no se puede ligar.",
      {
        motivo: "GASTO_YA_CUBIERTO",
        monto_gasto: 277.79,
        suma_ligada: 0,
        faltante: 277.79,
        monto_nuevo: 1850,
        moneda: "MXN",
        movimientos: [],
      },
    );
    expect(t.titulo).toContain("MAYOR que el gasto");
    expect(t.descripcion).not.toContain("Desvincula");
    expect(t.descripcion).toContain("Corrige el monto del gasto");
  });

  it("sin details (API viejo) conserva el texto genérico", () => {
    const t = textoGastoYaCubierto(null, undefined);
    expect(t.descripcion).toContain("Desvincula");
  });
});
