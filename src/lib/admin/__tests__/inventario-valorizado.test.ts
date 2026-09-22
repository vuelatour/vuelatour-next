import { describe, expect, it } from "vitest";
import {
  NOTA_VALOR_SIN_TC,
  textoValorizado,
  tieneUsdSinTc,
} from "../inventario-valorizado";

/**
 * Valorizado de la bodega — JAMÁS un USD sumado como MXN (22-sep-2026).
 *
 * Caso REAL que reportó el cliente y que se midió en producción: el aceite
 * 15W-50 tiene 84 piezas que vienen de una capa de 120 × 21.25 **USD sin
 * T.C.**, así que su valor en pesos REALES es 0 y el número de verdad son
 * 1,785 dólares. Antes el API lo mandaba como `valor_mxn: 1785` y el panel
 * pintaba «$1,785.00 MXN». Hoy `valor_mxn` llega en 0 — y pintar ese 0 solo
 * cambiaría una mentira por una cifra muda.
 */
describe("textoValorizado", () => {
  it("sin dólares se comporta EXACTAMENTE como antes", () => {
    expect(textoValorizado({ mxn: 3500 })).toBe("$3,500.00 MXN");
    expect(textoValorizado({ mxn: 0 })).toBe("$0.00 MXN");
    expect(textoValorizado({ mxn: null })).toBe("—");
  });

  it("API previo (sin el aditivo) = comportamiento de hoy, no se adivina nada", () => {
    // `pesos_exactos` ausente NO significa «hay dólares».
    expect(textoValorizado({ mxn: 1785, usdSinTc: undefined })).toBe("$1,785.00 MXN");
    expect(tieneUsdSinTc({ mxn: 1785 })).toBe(false);
  });

  it("caso REAL (15W-50): el valor vive en dólares, no en un $0.00 MXN mudo", () => {
    const v = { mxn: 0, usdSinTc: 1785, pesosExactos: false };
    expect(tieneUsdSinTc(v)).toBe(true);
    expect(textoValorizado(v)).toBe("$1,785 USD (sin T.C.)");
    // La moneda va SIEMPRE escrita: fmtUsd y fmtMxn comparten el símbolo «$».
    expect(textoValorizado(v)).toContain("USD");
    expect(textoValorizado(v)).not.toContain("MXN");
  });

  it("ítem MIXTO: las dos monedas, separadas y nunca sumadas", () => {
    const t = textoValorizado({ mxn: 2000, usdSinTc: 200, pesosExactos: false });
    expect(t).toBe("$2,000.00 MXN + $200 USD (sin T.C.)");
    // 2,200 sería justo el bug: dos monedas en un solo número.
    expect(t).not.toContain("2,200");
  });

  it("dólares en 0 no anuncia nada (una bodega en pesos no gana una nota)", () => {
    const v = { mxn: 416, usdSinTc: 0, pesosExactos: true };
    expect(tieneUsdSinTc(v)).toBe(false);
    expect(textoValorizado(v)).toBe("$416.00 MXN");
  });

  it("la nota dice qué hacer, no solo qué pasa", () => {
    expect(NOTA_VALOR_SIN_TC).toContain("dólares sin tipo de cambio");
    expect(NOTA_VALOR_SIN_TC).toContain("Editar costo");
  });
});
