/**
 * Tarjeta «Precios de este producto» (27-oct-2026): la redacción PURA de los
 * tres datos con la captura de la oficina — filtro de aceite roscado CH48108:
 * entrada del 01-sep-2026 de 3 piezas a $46.06 USD (T.C. 17.0077), salida de
 * 2 a $57.575 USD (+25 %), existencia 1 pieza.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_TARJETA_PRECIOS,
  ETIQUETA_EXISTENCIA_HOY,
  ETIQUETA_PRECIO_VIGENTE,
  ETIQUETA_SE_COBRA,
  SIN_PRECIO_VIGENTE,
  SUB_ETIQUETA_PRECIO_VIGENTE,
  SUB_ETIQUETA_SE_COBRA,
  TITULO_TARJETA_PRECIOS,
  VENTA_NO_CALCULABLE,
  subPrecioVigente,
  tarjetaPrecios,
  textoOrigenVenta,
} from "../inventario-precios";
import type { PrecioVigenteFicha } from "@/types/inventory";

const CH48108: PrecioVigenteFicha = {
  movimiento_id: "m-entrada",
  fecha: "2026-09-01",
  moneda: "USD",
  unitario: 46.06,
  unitario_usd: 46.06,
  unitario_mxn: null,
  tc_compra: 17.0077,
  unitario_mxn_hoy: 783.37,
  siguiente_salida: { venta_unitaria: 57.575, moneda: "USD", origen: "MARGEN" },
};
const TC_HOY = { tc: 17.0077, fecha_dato: "2026-10-27", fuente: "OPEN_ER_API" };

describe("tarjetaPrecios — CH48108 (la captura de la oficina)", () => {
  it("precio vigente $46.06 USD con su entrada y sus pesos de hoy; se cobra $57.575 USD (+25 %); existencia 1 pieza", () => {
    const t = tarjetaPrecios({
      pv: CH48108,
      tcHoy: TC_HOY,
      margenPct: 25,
      existencia: 1,
      unidad: "pieza",
    });
    expect(t.vigente).toEqual({
      valor: "$46.06 USD",
      sub: ["Entrada del 01 sep 2026 · T.C. 17.0077", "≈ $783.37 MXN al T.C. de hoy 17.0077"],
    });
    expect(t.venta).toEqual({
      valor: "$57.575 USD",
      sub: ["= precio vigente + 25 % (margen de la tienda, se cambia en Configuración)"],
    });
    expect(t.existencia).toEqual({ valor: "1 pieza", sub: [] });
  });

  it("textos de la tarjeta: dicen «precio vigente», «última compra» y «siguiente salida»", () => {
    expect(TITULO_TARJETA_PRECIOS).toBe("Precios de este producto");
    expect(ETIQUETA_PRECIO_VIGENTE).toBe("Precio vigente");
    expect(SUB_ETIQUETA_PRECIO_VIGENTE).toBe("último precio de compra");
    expect(ETIQUETA_SE_COBRA).toBe("Se cobra al avión");
    expect(SUB_ETIQUETA_SE_COBRA).toBe("en la siguiente salida");
    expect(ETIQUETA_EXISTENCIA_HOY).toBe("Existencia hoy");
    expect(AYUDA_TARJETA_PRECIOS).toContain("última compra");
    expect(SIN_PRECIO_VIGENTE).toContain("costo $0");
  });

  it("compra en PESOS: «captura en pesos», sin renglón de pesos de hoy; sin T.C. de hoy: «en pesos de hoy»", () => {
    expect(
      subPrecioVigente({ fecha: "2026-09-01", moneda: "MXN", tc_compra: 17.51, unitario_mxn_hoy: 350 }),
    ).toEqual(["Entrada del 01 sep 2026 · captura en pesos"]);
    expect(subPrecioVigente(CH48108, null)).toEqual([
      "Entrada del 01 sep 2026 · T.C. 17.0077",
      "≈ $783.37 MXN en pesos de hoy",
    ]);
    expect(
      subPrecioVigente({ fecha: "2026-09-01", moneda: "USD", tc_compra: null, unitario_mxn_hoy: null }),
    ).toEqual(["Entrada del 01 sep 2026"]);
  });

  it("origen de la venta: margen (con el % vigente), precio fijo del producto, a costo (ámbar)", () => {
    expect(textoOrigenVenta("MARGEN", 30)).toBe(
      "= precio vigente + 30 % (margen de la tienda, se cambia en Configuración)",
    );
    expect(textoOrigenVenta(null, undefined)).toContain("+ 25 %");
    expect(textoOrigenVenta("PRECIO_PRODUCTO")).toBe(
      "precio de venta fijo de este producto (se cambia en «Editar»)",
    );
    expect(textoOrigenVenta("PRECIO_CAPTURADO")).toContain("precio de venta fijo");
    expect(textoOrigenVenta("A_COSTO")).toBe("a costo, sin utilidad");
    const t = tarjetaPrecios({
      pv: { ...CH48108, siguiente_salida: { venta_unitaria: 46.06, moneda: "USD", origen: "A_COSTO" } },
      existencia: 1,
      unidad: "pieza",
    });
    expect(t.venta).toEqual({ valor: "$46.06 USD", sub: ["a costo, sin utilidad"], tono: "ambar" });
    const fijo = tarjetaPrecios({
      pv: { ...CH48108, siguiente_salida: { venta_unitaria: 1200, moneda: "MXN", origen: "PRECIO_PRODUCTO" } },
      existencia: 1,
      unidad: "pieza",
    });
    expect(fijo.venta?.valor).toBe("$1,200.00 MXN");
  });

  it("sin precio vigente (ninguna compra con costo): vigente y venta null; la existencia sigue", () => {
    const t = tarjetaPrecios({ pv: null, existencia: 3, unidad: "pieza" });
    expect(t.vigente).toBeNull();
    expect(t.venta).toBeNull();
    expect(t.existencia.valor).toBe("3 pieza");
  });

  it("siguiente salida sin precio calculable (forma real del API: objeto con null) ⇒ «—»", () => {
    const t = tarjetaPrecios({
      pv: { ...CH48108, siguiente_salida: { venta_unitaria: null, moneda: null, origen: "A_COSTO" } },
      existencia: 0,
      unidad: null,
    });
    expect(t.venta).toEqual({ valor: "—", sub: [VENTA_NO_CALCULABLE] });
    expect(tarjetaPrecios({ pv: { ...CH48108, siguiente_salida: null }, existencia: 0, unidad: null }).venta).toEqual({
      valor: "—",
      sub: [VENTA_NO_CALCULABLE],
    });
  });

  it("existencia bajo el mínimo: ámbar con «bajo el mínimo (mín. N)»", () => {
    const t = tarjetaPrecios({
      pv: CH48108,
      existencia: 1,
      unidad: "pieza",
      bajoStock: true,
      stockMinimo: 2,
    });
    expect(t.existencia).toEqual({ valor: "1 pieza", sub: ["bajo el mínimo (mín. 2)"], tono: "ambar" });
  });
});
