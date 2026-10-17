/**
 * «Es pago de AFAC» (16-oct-2026, API 0.0.89, invariante 90 del API): la regla
 * PURA del panel — qué es un pago de AFAC (espejo de `esPagoAfac` del API),
 * cuándo se ofrece la casilla y qué viaja en el alta y en el PATCH.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_PAGO_AFAC,
  CATEGORIA_PAGO_AFAC,
  CHIP_PAGO_AFAC,
  ETIQUETA_HISTORIAL_PAGO_AFAC,
  ETIQUETA_PAGO_AFAC,
  NOTA_PAGO_AFAC_SE_QUITA,
  TITULO_CHIP_PAGO_AFAC,
  apiConPagoAfac,
  casillaPagoAfacVisible,
  esPagoAfac,
  pagoAfacParaAlta,
  pagoAfacParaPatch,
  pagoAfacSeQuita,
} from "../pago-afac";

describe("esPagoAfac (espejo del API)", () => {
  it("solo un PERMISO con la marca en true", () => {
    expect(CATEGORIA_PAGO_AFAC).toBe("PERMISO");
    expect(esPagoAfac({ categoria: "PERMISO", es_pago_afac: true })).toBe(true);
    expect(esPagoAfac({ categoria: "PERMISO", es_pago_afac: false })).toBe(false);
    expect(esPagoAfac({ categoria: "PERMISO" })).toBe(false);
    // Defensa: la marca fuera de Permiso no cuenta (el trigger de la BD la quita).
    expect(esPagoAfac({ categoria: "OTRO", es_pago_afac: true })).toBe(false);
    expect(esPagoAfac(null)).toBe(false);
  });

  it("apiConPagoAfac: la LLAVE booleana del API (= la columna existe)", () => {
    expect(apiConPagoAfac({ es_pago_afac: false })).toBe(true);
    expect(apiConPagoAfac({ es_pago_afac: true })).toBe(true);
    expect(apiConPagoAfac({})).toBe(false);
    expect(apiConPagoAfac({ es_pago_afac: null })).toBe(false);
    expect(apiConPagoAfac(null)).toBe(false);
  });
});

describe("la casilla y lo que viaja", () => {
  it("visible SOLO en Permiso y para quien puede marcar", () => {
    expect(casillaPagoAfacVisible({ categoria: "PERMISO", puedeMarcar: true })).toBe(true);
    expect(casillaPagoAfacVisible({ categoria: "PERMISO", puedeMarcar: false })).toBe(false);
    expect(casillaPagoAfacVisible({ categoria: "SERVICIOS", puedeMarcar: true })).toBe(false);
    expect(casillaPagoAfacVisible({ categoria: "", puedeMarcar: true })).toBe(false);
  });

  it("alta: la llave viaja SOLO marcada y visible (el default del API es false)", () => {
    expect(pagoAfacParaAlta({ visible: true, marcado: true })).toBe(true);
    expect(pagoAfacParaAlta({ visible: true, marcado: false })).toBeUndefined();
    expect(pagoAfacParaAlta({ visible: false, marcado: true })).toBeUndefined();
  });

  it("PATCH: SOLO visible y si cambió (un eco no toca el candado del mes ni la bitácora)", () => {
    expect(pagoAfacParaPatch({ visible: true, marcado: true, actual: false })).toBe(true);
    expect(pagoAfacParaPatch({ visible: true, marcado: false, actual: true })).toBe(false);
    expect(pagoAfacParaPatch({ visible: true, marcado: true, actual: true })).toBeUndefined();
    expect(pagoAfacParaPatch({ visible: true, marcado: false, actual: false })).toBeUndefined();
    // Oculta (otra categoría, API viejo o sin permiso): no viaja; el trigger del API quita la marca.
    expect(pagoAfacParaPatch({ visible: false, marcado: false, actual: true })).toBeUndefined();
  });

  it("aviso de que se quita: estaba marcado y la categoría ya no es Permiso", () => {
    expect(pagoAfacSeQuita({ actual: true, categoria: "OTRO" })).toBe(true);
    expect(pagoAfacSeQuita({ actual: true, categoria: "PERMISO" })).toBe(false);
    expect(pagoAfacSeQuita({ actual: false, categoria: "OTRO" })).toBe(false);
  });
});

describe("textos EXACTOS (es-MX)", () => {
  it("casilla, ayuda, chip, historial y aviso", () => {
    expect(ETIQUETA_PAGO_AFAC).toBe("Es pago de AFAC (lo paga VuelaTour; no le resta al avión)");
    expect(AYUDA_PAGO_AFAC).toBe(
      "Márcalo en los pagos al gestor de AFAC. El costo de cada vuelo se captura en el Balance general (otros movimientos).",
    );
    expect(CHIP_PAGO_AFAC).toBe("AFAC");
    expect(TITULO_CHIP_PAGO_AFAC).toBe("Pago de AFAC: lo paga VuelaTour; no resta al avión");
    expect(ETIQUETA_HISTORIAL_PAGO_AFAC).toBe("Pago de AFAC");
    expect(NOTA_PAGO_AFAC_SE_QUITA).toBe(
      "Al guardar se quitará la marca «Pago de AFAC»: solo un gasto de Permiso puede serlo (volverá a restarle a su avión).",
    );
  });
});
