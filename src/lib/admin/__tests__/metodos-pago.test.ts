import { describe, expect, it } from "vitest";
import {
  cuentaSugeridaPorMetodo,
  METODOS_CON_CUENTA,
  METODOS_FACTURABLES,
  METODOS_PAGO,
  metodoConCuenta,
  metodoPagoLabel,
  PAYWISE_COMISION_PCT_DEFAULT,
} from "@/lib/admin/metodos-pago";

describe("metodos-pago (fuente única)", () => {
  it("ofrece PAYWISE con etiqueta es-MX y sin duplicados", () => {
    const values = METODOS_PAGO.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("PAYWISE");
    expect(metodoPagoLabel("PAYWISE")).toBe("Paywise");
    expect(metodoPagoLabel("OTRO", "PayPal")).toBe("Otro (PayPal)");
    expect(metodoPagoLabel(null)).toBe("—");
    // Código desconocido (API más nuevo): se pinta crudo, nunca "—".
    expect(metodoPagoLabel("NUEVO")).toBe("NUEVO");
  });

  it("PAYWISE toca cuenta (Paywise), factura pre-cobro y sugiere la comisión", () => {
    expect(METODOS_CON_CUENTA).toEqual(["TRANSFERENCIA", "HSBC_LINK", "CHEQUE", "PAYWISE"]);
    expect(metodoConCuenta("PAYWISE")).toBe(true);
    expect(metodoConCuenta("EFECTIVO")).toBe(false);
    expect(METODOS_FACTURABLES).toEqual([
      "TRANSFERENCIA",
      "HSBC_LINK",
      "CHEQUE",
      "BILLPOCKET",
      "PAYWISE",
    ]);
    expect(cuentaSugeridaPorMetodo("PAYWISE")).toBe("Paywise");
    expect(cuentaSugeridaPorMetodo("TRANSFERENCIA")).toBeNull();
    expect(PAYWISE_COMISION_PCT_DEFAULT).toBe(8.857);
  });
});
