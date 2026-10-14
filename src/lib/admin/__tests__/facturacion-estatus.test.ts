import { describe, expect, it } from "vitest";
import {
  estadoFacturacion,
  etiquetaFacturacion,
  etiquetaFacturacionTabla,
  FACTURACION_ESTADOS,
  FACTURACION_FILTRO_VALUES,
  FILTRO_NO_FACTURADA,
  opcionesFacturacionFiltro,
  opcionesFacturacionForm,
  TITULO_FACTURACION_BADGE,
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

/**
 * Tabla única de Gastos (14-oct-2026): el pill de la columna «Facturación»
 * dice «No requiere» (cabe sin ensanchar la columna); el menú, el filtro y el
 * title siguen con la etiqueta completa.
 */
describe("etiqueta corta de la tabla", () => {
  it("solo NO_FACTURABLE trae labelCorta «No requiere»", () => {
    expect(estadoFacturacion("NO_FACTURABLE").labelCorta).toBe("No requiere");
    expect(FACTURACION_ESTADOS.filter((e) => e.labelCorta).map((e) => e.value)).toEqual(["NO_FACTURABLE"]);
  });

  it("etiquetaFacturacionTabla: corta si la hay; los otros 3, su label; desconocido o ausente ⇒ «Pendiente»", () => {
    expect(etiquetaFacturacionTabla("NO_FACTURABLE")).toBe("No requiere");
    expect(etiquetaFacturacionTabla("PENDIENTE")).toBe("Pendiente");
    expect(etiquetaFacturacionTabla("SOLICITADA")).toBe("Solicitada");
    expect(etiquetaFacturacionTabla("FACTURADA")).toBe("Facturada");
    expect(etiquetaFacturacionTabla("OTRA")).toBe("Pendiente");
    expect(etiquetaFacturacionTabla(undefined)).toBe("Pendiente");
    expect(etiquetaFacturacionTabla(null)).toBe("Pendiente");
  });

  it("FACTURACION_FILTRO_VALUES: los 4 estados + NO_FACTURADA (5 valores, los que acepta el API)", () => {
    expect(FACTURACION_FILTRO_VALUES).toEqual([
      "PENDIENTE",
      "SOLICITADA",
      "FACTURADA",
      "NO_FACTURABLE",
      FILTRO_NO_FACTURADA,
    ]);
  });

  it("title del semáforo", () => {
    expect(TITULO_FACTURACION_BADGE).toBe(
      "Seguimiento de facturación de oficina (no toca el comprobante del piloto). Clic para cambiar.",
    );
  });
});
