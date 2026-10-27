/**
 * «Es el pago al operador externo» (27-oct-2026, API 0.0.110, invariante 110
 * del API): la regla PURA del panel — qué gasto es el pago (espejo de
 * `esPagoOperadorExterno` del API), cuándo se ofrece la casilla, cuándo nace
 * marcada y qué viaja en el alta y en el PATCH. Caso real #453 (Simon
 * Herrera, 25-oct-2026): el gasto de Ale de $18,182.00 MXN.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_PAGO_OPERADOR,
  CATEGORIA_PAGO_OPERADOR_POR_DEFECTO,
  CHIP_PAGO_OPERADOR,
  ETIQUETA_HISTORIAL_PAGO_OPERADOR,
  NOTA_PAGO_OPERADOR_SE_QUITA,
  ROLES_PAGO_OPERADOR_EXTERNO,
  TITULO_CHIP_PAGO_OPERADOR,
  apiConPagoOperador,
  casillaPagoOperadorVisible,
  categoriaPuedeSerPagoOperador,
  esPagoOperadorExterno,
  etiquetaPagoOperador,
  pagoOperadorParaAlta,
  pagoOperadorParaPatch,
  pagoOperadorPorDefecto,
  pagoOperadorSeQuita,
  pagosAlOperadorPorMoneda,
  puedeMarcarPagoOperador,
  vueloExternoDe,
} from "../pago-operador-externo";

describe("esPagoOperadorExterno / apiConPagoOperador / puedeMarcarPagoOperador", () => {
  it("la marca en true es el pago; sin la llave (API previo) no", () => {
    expect(esPagoOperadorExterno({ es_pago_operador_externo: true })).toBe(true);
    expect(esPagoOperadorExterno({ es_pago_operador_externo: false })).toBe(false);
    expect(esPagoOperadorExterno({})).toBe(false);
    expect(esPagoOperadorExterno(null)).toBe(false);
    expect(apiConPagoOperador({ es_pago_operador_externo: false })).toBe(true);
    expect(apiConPagoOperador({ es_pago_operador_externo: true })).toBe(true);
    expect(apiConPagoOperador({})).toBe(false);
    expect(apiConPagoOperador({ es_pago_operador_externo: null })).toBe(false);
    expect(apiConPagoOperador(null)).toBe(false);
  });

  it("solo la oficina marca (ADMIN / FACTURACION / COORDINADOR)", () => {
    expect([...ROLES_PAGO_OPERADOR_EXTERNO]).toEqual(["ADMIN", "FACTURACION", "COORDINADOR"]);
    for (const rol of ROLES_PAGO_OPERADOR_EXTERNO) expect(puedeMarcarPagoOperador({ rol })).toBe(true);
    for (const rol of ["PILOTO", "MECANICO", "SOCIO", "ANALISTA", "VISITANTE"]) {
      expect(puedeMarcarPagoOperador({ rol })).toBe(false);
    }
    expect(puedeMarcarPagoOperador({ rol: null })).toBe(false);
    expect(puedeMarcarPagoOperador(null)).toBe(false);
  });

  it("vueloExternoDe: del selector o del embed del gasto; sin vuelo ⇒ propio", () => {
    expect(vueloExternoDe({ es_externo: true, operador_externo: " Simon Herrera " })).toEqual({
      externo: true,
      operador: "Simon Herrera",
    });
    expect(vueloExternoDe({ es_externo: true, operador_externo: "" })).toEqual({
      externo: true,
      operador: null,
    });
    expect(vueloExternoDe({ es_externo: false, operador_externo: null })).toEqual({
      externo: false,
      operador: null,
    });
    expect(vueloExternoDe(null)).toEqual({ externo: false, operador: null });
    expect(vueloExternoDe({})).toEqual({ externo: false, operador: null });
  });
});

describe("categoriaPuedeSerPagoOperador (espejo de gastoRestaEnColumnasDelVuelo del API)", () => {
  it("las categorías del vuelo sí; TUAS/GAS/PERMISO/INDIRECTO, empresa, pago al vendedor y otros movimientos no", () => {
    for (const c of ["OPERACIONES", "ATERRIZAJE", "FBO", "HOTEL", "TAXI", "COMIDA", "COMISARIATO", "PILOTO_EXTERNO"]) {
      expect(categoriaPuedeSerPagoOperador(c), c).toBe(true);
    }
    for (const c of [
      "TUAS",
      "GAS",
      "PERMISO",
      "INDIRECTO",
      "OTRO",
      "PAQUETERIA",
      "COMISION_VENDEDOR",
      "COMISION_VENDEDOR_AVION",
      "OTROS_MOVIMIENTOS",
    ]) {
      expect(categoriaPuedeSerPagoOperador(c), c).toBe(false);
    }
    expect(categoriaPuedeSerPagoOperador(null)).toBe(false);
    expect(categoriaPuedeSerPagoOperador("")).toBe(false);
  });
});

describe("la casilla: cuándo se ve, cuándo nace marcada y qué viaja", () => {
  const ok = { vueloExterno: true, categoria: "OPERACIONES", puedeMarcar: true };

  it("textos", () => {
    expect(etiquetaPagoOperador("Simon Herrera")).toBe("Es el pago al operador externo (Simon Herrera)");
    expect(etiquetaPagoOperador(null)).toBe("Es el pago al operador externo");
    expect(etiquetaPagoOperador("  ")).toBe("Es el pago al operador externo");
    expect(AYUDA_PAGO_OPERADOR).toContain("costo cotizado");
    expect(AYUDA_PAGO_OPERADOR).toContain("marca cada parte");
    expect(CHIP_PAGO_OPERADOR).toBe("Pago operador");
    expect(TITULO_CHIP_PAGO_OPERADOR).toContain("costo real");
    expect(ETIQUETA_HISTORIAL_PAGO_OPERADOR).toBe("Pago al operador externo");
    expect(NOTA_PAGO_OPERADOR_SE_QUITA).toContain("se quitará la marca");
    expect(CATEGORIA_PAGO_OPERADOR_POR_DEFECTO).toBe("OPERACIONES");
  });

  it("visible SOLO con vuelo externo + categoría del vuelo + quien puede marcar", () => {
    expect(casillaPagoOperadorVisible(ok)).toBe(true);
    expect(casillaPagoOperadorVisible({ ...ok, categoria: "FBO" })).toBe(true);
    expect(casillaPagoOperadorVisible({ ...ok, vueloExterno: false })).toBe(false);
    expect(casillaPagoOperadorVisible({ ...ok, categoria: "TUAS" })).toBe(false);
    expect(casillaPagoOperadorVisible({ ...ok, categoria: "OTRO" })).toBe(false);
    expect(casillaPagoOperadorVisible({ ...ok, puedeMarcar: false })).toBe(false);
  });

  it("nace marcada SOLO con vuelo externo y Operaciones (la oficina solo supervisa)", () => {
    expect(pagoOperadorPorDefecto({ vueloExterno: true, categoria: "OPERACIONES" })).toBe(true);
    expect(pagoOperadorPorDefecto({ vueloExterno: true, categoria: "FBO" })).toBe(false);
    expect(pagoOperadorPorDefecto({ vueloExterno: false, categoria: "OPERACIONES" })).toBe(false);
  });

  it("alta: la llave viaja SOLO marcada y visible", () => {
    expect(pagoOperadorParaAlta({ visible: true, marcado: true })).toBe(true);
    expect(pagoOperadorParaAlta({ visible: true, marcado: false })).toBeUndefined();
    expect(pagoOperadorParaAlta({ visible: false, marcado: true })).toBeUndefined();
  });

  it("PATCH: viaja SOLO visible y si cambió contra la base (marcar y desmarcar)", () => {
    expect(pagoOperadorParaPatch({ visible: true, marcado: true, actual: false })).toBe(true);
    expect(pagoOperadorParaPatch({ visible: true, marcado: false, actual: true })).toBe(false);
    expect(pagoOperadorParaPatch({ visible: true, marcado: true, actual: true })).toBeUndefined();
    expect(pagoOperadorParaPatch({ visible: false, marcado: true, actual: false })).toBeUndefined();
  });

  it("aviso «se quita»: marcado y el vuelo ya no es externo o la categoría no es del vuelo", () => {
    expect(pagoOperadorSeQuita({ actual: true, vueloExterno: false, categoria: "OPERACIONES" })).toBe(true);
    expect(pagoOperadorSeQuita({ actual: true, vueloExterno: true, categoria: "OTRO" })).toBe(true);
    expect(pagoOperadorSeQuita({ actual: true, vueloExterno: true, categoria: "OPERACIONES" })).toBe(false);
    expect(pagoOperadorSeQuita({ actual: false, vueloExterno: false, categoria: "OTRO" })).toBe(false);
  });
});

describe("pagosAlOperadorPorMoneda (ficha del vuelo)", () => {
  it("Σ por moneda de los MARCADOS, a centavos, sin convertir; sin marcados ⇒ vacío", () => {
    const simon = { es_pago_operador_externo: true, moneda: "MXN", monto: "18182.00" };
    expect(pagosAlOperadorPorMoneda([simon])).toEqual([{ moneda: "MXN", total: 18182, n: 1 }]);
    expect(
      pagosAlOperadorPorMoneda([
        { ...simon, monto: "5000.10" },
        { ...simon, monto: 13181.9 },
        { es_pago_operador_externo: true, moneda: "USD", monto: 100 },
        { es_pago_operador_externo: false, moneda: "MXN", monto: 999 },
        { moneda: "MXN", monto: 1 },
      ]),
    ).toEqual([
      { moneda: "MXN", total: 18182, n: 2 },
      { moneda: "USD", total: 100, n: 1 },
    ]);
    expect(pagosAlOperadorPorMoneda([{ moneda: "MXN", monto: 1 }])).toEqual([]);
    expect(pagosAlOperadorPorMoneda([])).toEqual([]);
  });
});
