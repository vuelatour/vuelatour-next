import { describe, expect, it } from "vitest";
import {
  AYUDA_COMPROBANTE,
  COMPROBANTE_CON,
  COMPROBANTE_SIN,
  COMPROBANTE_VALE,
  etiquetaComprobante,
  hayComprobante,
  opcionesComprobante,
  textoComprobante,
} from "../comprobante-badge";

describe("etiquetaComprobante (columna Comp.)", () => {
  it("con comprobante NO pinta badge: la miniatura ya lo dice y «Factura» se confundía con «Facturada»", () => {
    expect(etiquetaComprobante(COMPROBANTE_CON)).toBeNull();
  });
  it("el legado VALE tampoco pinta badge: la columna responde «¿hay papel?», no de qué tipo", () => {
    expect(etiquetaComprobante(COMPROBANTE_VALE)).toBeNull();
  });
  it("sin comprobante sí se etiqueta", () => {
    expect(etiquetaComprobante(COMPROBANTE_SIN)).toBe("Sin comp.");
  });
  it("valor desconocido o vacío: sin badge", () => {
    expect(etiquetaComprobante(null)).toBeNull();
    expect(etiquetaComprobante("OTRA_COSA")).toBeNull();
  });
});

describe("hayComprobante", () => {
  it("todo lo que no sea SIN_COMPROBANTE cuenta como papel entregado", () => {
    expect(hayComprobante(COMPROBANTE_CON)).toBe(true);
    expect(hayComprobante(COMPROBANTE_VALE)).toBe(true);
    expect(hayComprobante(COMPROBANTE_SIN)).toBe(false);
  });
  it("sin dato NO se afirma que haya comprobante", () => {
    expect(hayComprobante(null)).toBe(false);
    expect(hayComprobante(undefined)).toBe(false);
    expect(hayComprobante("")).toBe(false);
  });
});

describe("textoComprobante (historial de cambios)", () => {
  it("FACTURA y VALE se leen igual: «Con comprobante»", () => {
    expect(textoComprobante(COMPROBANTE_CON)).toBe("Con comprobante");
    expect(textoComprobante(COMPROBANTE_VALE)).toBe("Con comprobante");
  });
  it("SIN_COMPROBANTE → «Sin comprobante»", () => {
    expect(textoComprobante(COMPROBANTE_SIN)).toBe("Sin comprobante");
  });
  it("valor desconocido: null (el llamador pinta el valor crudo)", () => {
    expect(textoComprobante("OTRA_COSA")).toBeNull();
    expect(textoComprobante(null)).toBeNull();
  });
});

describe("opcionesComprobante (selector de los diálogos)", () => {
  it("por defecto son DOS opciones y la de «con comprobante» guarda FACTURA", () => {
    const ops = opcionesComprobante();
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.value)).toEqual([COMPROBANTE_CON, COMPROBANTE_SIN]);
    expect(ops[0].label).toContain("ticket");
    expect(ops[0].label).not.toMatch(/^Factura$/);
  });
  it("un gasto que YA trae el legado VALE agrega su opción para no mutarlo al guardar", () => {
    const ops = opcionesComprobante(COMPROBANTE_VALE);
    expect(ops.map((o) => o.value)).toEqual([
      COMPROBANTE_CON,
      COMPROBANTE_VALE,
      COMPROBANTE_SIN,
    ]);
    expect(ops[1].label).toBe("Con comprobante (vale)");
  });
  it("con FACTURA o SIN_COMPROBANTE la opción legada NO aparece (nadie debe poder elegir VALE)", () => {
    for (const actual of [COMPROBANTE_CON, COMPROBANTE_SIN, null, "OTRA_COSA"]) {
      expect(opcionesComprobante(actual).some((o) => o.value === COMPROBANTE_VALE)).toBe(
        false,
      );
    }
  });
  it("la ayuda del campo manda la factura a «Facturación (oficina)»", () => {
    expect(AYUDA_COMPROBANTE).toContain("Facturación (oficina)");
  });
});
