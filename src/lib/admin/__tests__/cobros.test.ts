/**
 * `esCuentaCobroPasarela` (15-oct-2026, API 0.0.78, D17 de la conciliación al
 * revés de una entrada): SOLO el valor «Paywise» del catálogo `CUENTAS_COBRO`
 * (recortado) es la pasarela; las 4 de banco, vacío y un texto libre, no.
 */
import { describe, expect, it } from "vitest";
import { CUENTAS_COBRO, CUENTA_COBRO_PASARELA, esCuentaCobroPasarela } from "@/lib/admin/cobros";

describe("esCuentaCobroPasarela", () => {
  it("«Paywise» (con espacios) sí; las de banco, vacío, null y un texto fuera del catálogo, no", () => {
    expect(CUENTA_COBRO_PASARELA).toBe("Paywise");
    expect(esCuentaCobroPasarela("Paywise")).toBe(true);
    expect(esCuentaCobroPasarela("  Paywise ")).toBe(true);
    for (const banco of ["HSBC Dólares", "HSBC Pesos", "Scotiabank Dólares", "Scotiabank Pesos"]) {
      expect(esCuentaCobroPasarela(banco), banco).toBe(false);
    }
    expect(esCuentaCobroPasarela("")).toBe(false);
    expect(esCuentaCobroPasarela(null)).toBe(false);
    expect(esCuentaCobroPasarela(undefined)).toBe(false);
    expect(esCuentaCobroPasarela("paywise")).toBe(false);
    expect(esCuentaCobroPasarela("Paywise (link)")).toBe(false);
  });

  it("el catálogo sigue teniendo la pasarela (si la renombran, la nota deja de salir y esta prueba lo dice)", () => {
    expect(CUENTAS_COBRO.map((c) => c.value)).toContain(CUENTA_COBRO_PASARELA);
  });
});
