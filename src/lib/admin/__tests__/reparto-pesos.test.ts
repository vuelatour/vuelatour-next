/**
 * Reparto EN PESOS (18-oct-2026, API 0.0.93): la fuente única pura
 * `lib/admin/reparto-pesos.ts`. Congela la bandera, la decisión principal /
 * informativo, las sumas en centavos y TODOS los textos (el panel no
 * convierte ni recalcula: formatea lo que manda el API).
 */
import { describe, expect, it } from "vitest";
import {
  ENCABEZADO_GASTOS_PESOS,
  HINT_SALDO_PESOS_INCOMPLETO,
  NOTA_REPARTO_COMO_BALANCE,
  NOTA_REPARTO_EN_PESOS,
  SUB_COLUMNA_USD,
  TEXTO_SIN_PESOS,
  TITULO_OTROS_INGRESOS_SIN_TC_PESOS,
  avisoPesosSinTc,
  gastosMxnDeAvion,
  hintKpiOtrosIngresosAvionesPesos,
  hintKpiOtrosVuelatourPesos,
  informativoUsd,
  montoPrincipal,
  pesosIncompletos,
  repartoComoBalance,
  repartoEnPesos,
  sumaCentavos,
  textoAlTc,
  textoBadgePendientePesos,
  textoCategoriaSinTcPesos,
  textoDeudaTotalPesos,
  textoPorCobrarUsd,
  textoUsd,
  tituloBadgePendientePesos,
  tituloGastosSinTcPesos,
  tituloOtrosIngresosAvionPesos,
  totalFlotaMxn,
} from "../reparto-pesos";
import { ING4, avionA, avionB, conPesos } from "@/components/admin/profit-sharing/__tests__/reparto-pesos.fixtures";

describe("bandera", () => {
  it("solo `true` estricto enciende los pesos", () => {
    expect(repartoEnPesos({ reparto_en_pesos: true })).toBe(true);
    expect(repartoEnPesos({ reparto_en_pesos: false })).toBe(false);
    expect(repartoEnPesos({})).toBe(false);
    expect(repartoEnPesos(null)).toBe(false);
    expect(repartoEnPesos(undefined)).toBe(false);
    expect(repartoEnPesos({ reparto_en_pesos: null })).toBe(false);
  });

  it("la cascada del balance (API 0.0.101) también es solo `true` estricto", () => {
    expect(repartoComoBalance({ reparto_como_balance: true })).toBe(true);
    expect(repartoComoBalance({ reparto_como_balance: false })).toBe(false);
    expect(repartoComoBalance({})).toBe(false);
    expect(repartoComoBalance(null)).toBe(false);
  });
});

describe("montoPrincipal", () => {
  it("sin bandera: fmtUsd de siempre, sin informativo (aunque vengan pesos)", () => {
    expect(montoPrincipal({ mxn: 1234.56, usd: 70.12 }, false)).toEqual({
      principal: "$70.12",
      informativo: null,
      sinPesos: false,
      valor: 70.12,
    });
    expect(montoPrincipal({ usd: 1200 }, false).principal).toBe("$1,200");
    expect(montoPrincipal({ usd: 500 }, false, { deduccion: true }).principal).toBe("−$500");
  });

  it("con bandera: pesos primero y dólares informativos", () => {
    expect(montoPrincipal({ mxn: 1234.56, usd: 70.12 }, true)).toEqual({
      principal: "$1,234.56 MXN",
      informativo: "≈ $70.12 USD",
      sinPesos: false,
      valor: 1234.56,
    });
  });

  it("deducción: «−» en las dos cifras; T.C. al final del informativo", () => {
    const r = montoPrincipal({ mxn: 8625, usd: 500 }, true, { deduccion: true, tc: 17.25 });
    expect(r.principal).toBe("−$8,625.00 MXN");
    expect(r.informativo).toBe("≈ −$500 USD · al T.C. 17.25");
  });

  it("con bandera y SIN pesos: dólares con su sufijo y lo dice (nunca un peso inventado)", () => {
    for (const mxn of [null, undefined, Number.NaN]) {
      const r = montoPrincipal({ mxn, usd: 5000 }, true, { tc: 17.25 });
      expect(r).toEqual({
        principal: "$5,000 USD",
        informativo: TEXTO_SIN_PESOS,
        sinPesos: true,
        valor: 5000,
      });
    }
  });

  it("negativos y cero", () => {
    expect(montoPrincipal({ mxn: -17250, usd: -1000 }, true).principal).toBe("-$17,250.00 MXN");
    expect(montoPrincipal({ mxn: -17250, usd: -1000 }, true).informativo).toBe("≈ -$1,000 USD");
    expect(montoPrincipal({ mxn: 0, usd: 0 }, true).valor).toBe(0);
  });
});

describe("piezas de texto", () => {
  it("textoUsd, informativoUsd y textoAlTc", () => {
    expect(textoUsd(8050.4)).toBe("$8,050.40 USD");
    expect(textoUsd(null)).toBe("—");
    expect(informativoUsd(70.12)).toBe("≈ $70.12 USD");
    expect(informativoUsd(null)).toBeNull();
    expect(textoAlTc(17.25)).toBe(" · al T.C. 17.25");
    expect(textoAlTc(18.012345)).toBe(" · al T.C. 18.012345");
    expect(textoAlTc(null)).toBe("");
    expect(textoAlTc(undefined)).toBe("");
  });

  it("aviso de dólares sin T.C. (texto del contrato)", () => {
    expect(avisoPesosSinTc(120)).toBe(
      "$120 USD no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.",
    );
    expect(avisoPesosSinTc(95.5)).toBe(
      "$95.50 USD no se pudieron pasar a pesos (sin tipo de cambio): el saldo en pesos está incompleto.",
    );
  });

  it("hints, badges y títulos", () => {
    expect(hintKpiOtrosIngresosAvionesPesos(46550.8)).toBe(" · + $46,550.80 MXN otros ingresos de aviones");
    expect(hintKpiOtrosIngresosAvionesPesos(0)).toBe("");
    expect(hintKpiOtrosIngresosAvionesPesos(null)).toBe("");
    expect(hintKpiOtrosVuelatourPesos(200)).toBe(
      "TUAs/extras/pernocta/comisión · no se reparten · por cobrar $200 USD",
    );
    expect(hintKpiOtrosVuelatourPesos(0)).toBe("TUAs/extras/pernocta/comisión · no se reparten");
    expect(textoBadgePendientePesos({ mxn: 51750, usd: 3000 }, 1)).toBe("Pendiente $51,750.00 MXN · 1 vuelo(s)");
    expect(textoBadgePendientePesos({ mxn: null, usd: 3000 }, 2)).toBe("Pendiente $3,000 USD · 2 vuelo(s)");
    expect(tituloBadgePendientePesos(3000)).toBe(
      "Parte del avión pendiente de cobro (≈ $3,000 USD). Los vuelos se cuentan una sola vez (en el avión que reporta el vuelo).",
    );
    expect(textoDeudaTotalPesos(3400)).toBe("deuda total del cliente $3,400 USD");
    expect(textoPorCobrarUsd(200)).toBe("· por cobrar $200 USD");
    expect(tituloGastosSinTcPesos(1740)).toBe(
      "$1,740.00 MXN en gastos sin tipo de cambio capturado ni TC oficial de referencia para su fecha: quedaron fuera del dato en dólares (USD).",
    );
    expect(TITULO_OTROS_INGRESOS_SIN_TC_PESOS).toContain("quedaron fuera del dato en dólares (USD)");
    expect(textoCategoriaSinTcPesos(1, 1740)).toBe("1 sin TC · $1,740.00 MXN fuera del dato en USD");
    expect(ENCABEZADO_GASTOS_PESOS).toBe("MXN");
    expect(SUB_COLUMNA_USD).toBe("en USD");
    expect(HINT_SALDO_PESOS_INCOMPLETO).toBe("Incompleto en pesos: revisa el aviso del avión");
    expect(NOTA_REPARTO_EN_PESOS).toBe(
      "Montos en pesos (MXN), que es como se transfiere a los socios; los dólares van en gris solo como referencia. «Pagos a socios» también está en pesos.",
    );
    expect(NOTA_REPARTO_COMO_BALANCE).toContain("la reserva de overhaul no se resta");
  });

  it("tooltip de los otros ingresos del avión en pesos", () => {
    expect(tituloOtrosIngresosAvionPesos([{ ...ING4, mxn: 46550.8 }])).toBe(
      "ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · $46,550.80 MXN (≈ $2,586.16 USD)",
    );
    expect(
      tituloOtrosIngresosAvionPesos([
        { ...ING4, clave: "ING-9", moneda: "USD", mxn: null, usd: 300, concepto: "Venta de pieza" },
      ]),
    ).toBe(`ING-9 · Venta de pieza · $300 USD (${TEXTO_SIN_PESOS})`);
    expect(tituloOtrosIngresosAvionPesos([{ ...ING4, mxn: null, usd: null }])).toBe(
      "ING-4 · TRANSF INTERBANCARIA SPEI · angel alvarez · sin T.C.",
    );
    expect(tituloOtrosIngresosAvionPesos([])).toBeUndefined();
    expect(tituloOtrosIngresosAvionPesos(null)).toBeUndefined();
  });
});

describe("sumas en centavos (solo lo que ya manda el API)", () => {
  it("exactas y null si falta alguno", () => {
    expect(sumaCentavos([0.1, 0.2])).toBe(0.3);
    expect(sumaCentavos([145050.03, -17250])).toBe(127800.03);
    expect(sumaCentavos([])).toBe(0);
    expect(sumaCentavos([1, undefined])).toBeNull();
    expect(sumaCentavos([1, null])).toBeNull();
  });

  it("total de flota y gastos del avión con los pesos de las cards", () => {
    const flota = [conPesos(avionA()), conPesos(avionB())];
    expect(totalFlotaMxn(flota, (a) => a.ingresos.cobrado_mxn)).toBe(210811.73);
    expect(totalFlotaMxn(flota, (a) => a.saldo_disponible_mxn)).toBe(127800.03);
    expect(gastosMxnDeAvion(flota[0])).toBe(103687.5);
    expect(gastosMxnDeAvion(flota[1])).toBe(17250);
    // Cascada del balance: la provisión AFAC también es gasto del periodo (y sin la llave, null).
    expect(gastosMxnDeAvion({ ...flota[0], afac_reservado_mxn: 3450 }, { conAfac: true })).toBe(107137.5);
    expect(gastosMxnDeAvion(flota[0], { conAfac: true })).toBeNull();
    // API previo en un avión ⇒ no hay total en pesos.
    expect(totalFlotaMxn([flota[0], avionB()], (a) => a.saldo_disponible_mxn)).toBeNull();
    expect(gastosMxnDeAvion(avionA())).toBeNull();
  });

  it("pesosIncompletos solo con dólares sin T.C. > 0", () => {
    expect(pesosIncompletos(conPesos(avionA()))).toBe(false);
    expect(pesosIncompletos({ ...conPesos(avionA()), pesos_sin_tc_usd: 120 })).toBe(true);
    expect(pesosIncompletos(avionA())).toBe(false);
  });
});
