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
    expect(metodoPagoLabel("PAYWISE")).toBe("Link de pago (Paywise)");
    expect(metodoPagoLabel("OTRO", "PayPal")).toBe("Otro (PayPal)");
    expect(metodoPagoLabel(null)).toBe("—");
    // Código desconocido (API más nuevo): se pinta crudo, nunca "—".
    expect(metodoPagoLabel("NUEVO")).toBe("NUEVO");
  });

  it("PAYWISE toca cuenta (Paywise), factura pre-cobro y sugiere la comisión", () => {
    expect(METODOS_CON_CUENTA).toEqual(["TRANSFERENCIA", "HSBC_LINK", "CHEQUE", "PAYWISE"]);
    expect(metodoConCuenta("PAYWISE")).toBe(true);
    expect(metodoConCuenta("EFECTIVO")).toBe(false);
    // La lista de facturables es un CONJUNTO: el orden del selector cambió
    // (22-sep-2026) y esa regla no puede depender de él.
    expect([...METODOS_FACTURABLES].sort()).toEqual(
      ["BILLPOCKET", "CHEQUE", "HSBC_LINK", "PAYWISE", "TRANSFERENCIA"].sort(),
    );
    expect(cuentaSugeridaPorMetodo("PAYWISE")).toBe("Paywise");
    expect(cuentaSugeridaPorMetodo("TRANSFERENCIA")).toBeNull();
    expect(PAYWISE_COMISION_PCT_DEFAULT).toBe(8.857);
  });

  /**
   * PARIDAD con `src/common/metodo-cobro.util.ts` del API (22-sep-2026).
   *
   * Pedido del cliente: «en vuelos, apartado COBRO, colocar las opciones link
   * de pago, transferencia, efectivo». Las etiquetas las imprime también el
   * RECIBO de pago y el PDF interno (los arma el API), así que panel y API
   * tienen que decir lo MISMO carácter por carácter: si el recibo dice «Link
   * de pago (HSBC)» y la pantalla «HSBC link», el operador cree que son dos
   * cosas. La tabla está COPIADA de `METODO_COBRO_LABELS` a propósito — es la
   * forma de que el test falle cuando alguien cambie un solo lado.
   *
   * **La ÚNICA divergencia permitida es OTRO** (revisión adversaria
   * 22-sep-2026, que encontró esta tabla mintiendo en dos renglones): en el
   * SELECTOR la opción dice «Otro (escríbelo)» porque ahí es una
   * instrucción, pero lo que se PINTA de un cobro ya registrado lo arma
   * `metodoPagoLabel`, que devuelve «Otro» o «Otro (PayPal)» — nunca el
   * texto del selector. Ese caso se prueba aparte, abajo. DOLARES sí se
   * alineó: el API decía «Dólares» y el recibo impreso no coincidía con la
   * pantalla.
   */
  it("las etiquetas son las MISMAS que las del API", () => {
    const DEL_API: Record<string, string> = {
      TRANSFERENCIA: "Transferencia",
      HSBC_LINK: "Link de pago (HSBC)",
      CHEQUE: "Cheque",
      BILLPOCKET: "BillPocket",
      PAYWISE: "Link de pago (Paywise)",
      EFECTIVO: "Efectivo",
      DOLARES: "Dólares directo",
      OTRO: "Otro",
    };
    for (const m of METODOS_PAGO) {
      if (m.value === "OTRO") continue; // ver el caso de abajo
      expect(m.label, m.value).toBe(DEL_API[m.value]);
    }
    // Ningún método del API se quedó fuera del selector.
    expect(METODOS_PAGO.map((m) => m.value).sort()).toEqual(Object.keys(DEL_API).sort());
  });

  it("OTRO: el selector instruye, pero lo PINTADO coincide con el API", () => {
    // La opción del selector es una instrucción para el operador…
    expect(METODOS_PAGO.find((m) => m.value === "OTRO")?.label).toBe("Otro (escríbelo)");
    // …y lo que se lee en un cobro registrado es lo mismo que imprime el
    // recibo del API: «Otro» a secas, o con el detalle que se capturó.
    expect(metodoPagoLabel("OTRO")).toBe("Otro");
    expect(metodoPagoLabel("OTRO", "PayPal")).toBe("Otro (PayPal)");
  });

  it("el selector arranca por lo que la oficina usa a diario", () => {
    expect(METODOS_PAGO.slice(0, 4).map((m) => m.value)).toEqual([
      "HSBC_LINK",
      "PAYWISE",
      "TRANSFERENCIA",
      "EFECTIVO",
    ]);
  });
});
