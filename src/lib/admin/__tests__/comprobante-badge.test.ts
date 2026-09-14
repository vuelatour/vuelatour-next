import { describe, expect, it } from "vitest";
import { etiquetaComprobante } from "../comprobante-badge";

describe("etiquetaComprobante (columna Comp.)", () => {
  it("FACTURA no pinta badge: la miniatura ya lo dice y «Factura» se confundía con «Facturada»", () => {
    expect(etiquetaComprobante("FACTURA")).toBeNull();
  });
  it("Vale y Sin comp. sí se etiquetan", () => {
    expect(etiquetaComprobante("VALE")).toBe("Vale");
    expect(etiquetaComprobante("SIN_COMPROBANTE")).toBe("Sin comp.");
  });
  it("valor desconocido o vacío: sin badge", () => {
    expect(etiquetaComprobante(null)).toBeNull();
    expect(etiquetaComprobante("OTRA_COSA")).toBeNull();
  });
});
