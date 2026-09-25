import { describe, expect, it } from "vitest";
import {
  ETIQUETA_A_COSTO,
  etiquetaOrigenVenta,
  hintPrecioVentaProducto,
  hintVentaSalida,
  placeholderVenta,
  textoPrecioVentaProducto,
  textoSalidaRegistrada,
  ventaDelFormulario,
} from "../inventario-salida";

/**
 * Salida de bodega a un avión (25-sep-2026). El riesgo #1: el diálogo de
 * antes mandaba `venta_unitaria: "0"` con el precio vacío ⇒ con el API nuevo
 * TODA salida del panel quedaría A COSTO (sin utilidad para la tienda).
 */
describe("ventaDelFormulario · qué viaja al API", () => {
  it("vacío ⇒ se OMITEN precio y moneda (el API aplica precio del producto o costo + margen)", () => {
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "", aCosto: false, moneda: "MXN" })).toEqual({});
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "   ", aCosto: false, moneda: "USD" })).toEqual({});
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: undefined, aCosto: false, moneda: "USD" })).toEqual({});
  });

  it("«Cargar a costo, sin utilidad» ⇒ 0 explícito (aunque el campo traiga el precio prellenado)", () => {
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "62.5", aCosto: true, moneda: "USD" })).toEqual({
      venta_unitaria: 0,
    });
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "", aCosto: true, moneda: "MXN" })).toEqual({
      venta_unitaria: 0,
    });
    expect(ETIQUETA_A_COSTO).toBe("Cargar a costo, sin utilidad");
  });

  it("precio tecleado ⇒ número + su moneda; un 0 tecleado también es «a costo»", () => {
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "26.5625", aCosto: false, moneda: "USD" })).toEqual({
      venta_unitaria: 26.5625,
      venta_moneda: "USD",
    });
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: 350, aCosto: false, moneda: "MXN" })).toEqual({
      venta_unitaria: 350,
      venta_moneda: "MXN",
    });
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "0", aCosto: false, moneda: "MXN" })).toEqual({
      venta_unitaria: 0,
    });
  });

  it("texto no numérico viaja tal cual para que el esquema lo rechace (nunca se vuelve «vacío»)", () => {
    expect(ventaDelFormulario({ tipo: "SALIDA", venta: "abc", aCosto: false, moneda: "MXN" })).toEqual({
      venta_unitaria: "abc",
    });
  });

  it("fuera de SALIDA no viaja ninguna venta (jamás se mezcla con el costo)", () => {
    for (const tipo of ["ENTRADA", "DEVOLUCION", "AJUSTE"]) {
      expect(ventaDelFormulario({ tipo, venta: "100", aCosto: true, moneda: "MXN" })).toEqual({});
    }
  });
});

describe("textos del precio", () => {
  it("placeholder: sin precio del producto «costo FIFO + margen», con precio «precio del producto»", () => {
    expect(placeholderVenta({ precioProducto: null, margenPct: 25 })).toBe("Vacío = costo FIFO + 25 %");
    expect(placeholderVenta({ precioProducto: 0, margenPct: undefined })).toBe("Vacío = costo FIFO + 25 %");
    expect(placeholderVenta({ precioProducto: 350, margenPct: 25 })).toBe("Vacío = precio del producto");
    expect(placeholderVenta({ precioProducto: null, margenPct: 30 })).toBe("Vacío = costo FIFO + 30 %");
  });

  it("hints con el margen vigente", () => {
    expect(hintVentaSalida(25)).toBe(
      "El avión paga este precio. Vacío: costo FIFO + 25 % (utilidad de la tienda).",
    );
    expect(hintPrecioVentaProducto(null)).toContain("Vacío = cada salida se cobra a costo FIFO + 25 %");
  });

  it("precio del producto en la ficha: precio · costo + margen · a costo (API previo)", () => {
    expect(textoPrecioVentaProducto({ precio: 350, moneda: "MXN", margenPct: 25 })).toBe("$350.00 MXN");
    expect(textoPrecioVentaProducto({ precio: "62.5", moneda: "USD", margenPct: 25 })).toBe("$62.50 USD");
    expect(textoPrecioVentaProducto({ precio: null, moneda: null, margenPct: 25 })).toBe("Costo FIFO + 25 %");
    expect(textoPrecioVentaProducto({ precio: 0, moneda: "MXN", margenPct: 0 })).toBe("A costo FIFO");
    expect(textoPrecioVentaProducto({ precio: null, moneda: null, margenPct: null })).toBe("A costo FIFO");
  });

  it("origen del precio", () => {
    expect(etiquetaOrigenVenta("MARGEN", 25)).toBe("costo + 25 %");
    expect(etiquetaOrigenVenta("PRECIO_PRODUCTO")).toBe("precio del producto");
    expect(etiquetaOrigenVenta("PRECIO_CAPTURADO")).toBe("precio de venta");
    expect(etiquetaOrigenVenta("A_COSTO")).toBe("a costo, sin utilidad");
    expect(etiquetaOrigenVenta(null)).toBeNull();
  });
});

describe("textoSalidaRegistrada · toast de éxito", () => {
  it("caso del contrato: aceite a XA-VGV, costo + 25 %", () => {
    expect(
      textoSalidaRegistrada(
        {
          gasto_generado: { id: "g", monto: 318.75, moneda: "USD", categoria: "REFACCION" },
          venta_origen: "MARGEN",
          margen_pct: 25,
          venta_unitaria: 26.5625,
          venta_moneda: "USD",
          moneda: "USD",
          costo_unitario_mxn: null,
        },
        "XA-VGV",
      ),
    ).toBe("Salida registrada: se cargó $318.75 USD a XA-VGV (costo + 25 %).");
  });

  it("toda la flota: el total y cuántos aviones; moneda de la venta", () => {
    expect(
      textoSalidaRegistrada(
        {
          gasto_generado: { prorrateado: true, aviones: 6, monto_total: 1200, gastos: 6 },
          venta_origen: "PRECIO_PRODUCTO",
          venta_unitaria: 100,
          venta_moneda: "MXN",
          moneda: "USD",
        },
        null,
      ),
    ).toBe("Salida registrada: se cargó $1,200.00 MXN repartido entre 6 aviones (precio del producto).");
  });

  it("a costo (casilla) y en pesos", () => {
    expect(
      textoSalidaRegistrada(
        {
          gasto_generado: { id: "g", monto: 6633.32, moneda: "MXN" },
          venta_origen: "A_COSTO",
          venta_unitaria: null,
          moneda: "MXN",
          costo_unitario_mxn: 1658.33,
        },
        "N4142R",
      ),
    ).toBe("Salida registrada: se cargó $6,633.32 MXN a N4142R (a costo, sin utilidad).");
  });

  it("API PREVIO (sin `venta_origen`): se deduce del movimiento", () => {
    expect(
      textoSalidaRegistrada({ gasto_generado: { id: "g", monto: 50, moneda: "USD" }, venta_unitaria: null }, "N4142R"),
    ).toBe("Salida registrada: se cargó $50 USD a N4142R (costo FIFO).");
    expect(
      textoSalidaRegistrada(
        { gasto_generado: { id: "g", monto: 62.5, moneda: "USD" }, venta_unitaria: 62.5, venta_moneda: "USD" },
        null,
      ),
    ).toBe("Salida registrada: se cargó $62.50 USD al avión (precio de venta).");
  });

  it("sin gasto (pieza sin costo) se DICE", () => {
    expect(textoSalidaRegistrada({ gasto_generado: null }, "XA-VGV")).toBe(
      "Salida registrada · sin cargo al avión (la pieza no tiene costo capturado).",
    );
  });
});
