import { describe, expect, it } from "vitest";
import {
  estadoFacturacion,
  etiquetaFacturacion,
  FACTURACION_ESTADOS,
  FILTRO_NO_FACTURADA,
  opcionesFacturacionFiltro,
  opcionesFacturacionForm,
} from "../facturacion-estatus";

describe("semáforo de facturación (oficina)", () => {
  it("incluye «No requiere factura» (14-sep-2026) al final del semáforo", () => {
    expect(FACTURACION_ESTADOS.map((e) => e.value)).toEqual([
      "PENDIENTE",
      "SOLICITADA",
      "FACTURADA",
      "NO_FACTURABLE",
    ]);
    expect(etiquetaFacturacion("NO_FACTURABLE")).toBe("No requiere factura");
    expect(estadoFacturacion("NO_FACTURABLE").dot).toContain("slate");
  });
  it("sin dato o valor desconocido: Pendiente (jamás afirmar «facturado» en falso)", () => {
    expect(estadoFacturacion(undefined).value).toBe("PENDIENTE");
    expect(estadoFacturacion("OTRA_COSA").value).toBe("PENDIENTE");
    // La etiqueta cruda sí distingue lo desconocido (el historial lo pinta tal cual).
    expect(etiquetaFacturacion("OTRA_COSA")).toBeNull();
  });
  it("los selectores de los diálogos ofrecen los 4 estados", () => {
    const ops = opcionesFacturacionForm();
    expect(ops).toHaveLength(4);
    expect(ops[3]).toEqual({ value: "NO_FACTURABLE", label: "⚪ No requiere factura" });
  });
  it("el filtro agrega «Sin facturar» al final y NO_FACTURABLE es su propia opción", () => {
    const ops = opcionesFacturacionFiltro();
    expect(ops.map((o) => o.value)).toEqual([
      "PENDIENTE",
      "SOLICITADA",
      "FACTURADA",
      "NO_FACTURABLE",
      FILTRO_NO_FACTURADA,
    ]);
  });
});
