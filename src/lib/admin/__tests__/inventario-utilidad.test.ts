import { describe, expect, it } from "vitest";
import {
  AVISO_ENTRADAS_SIN_COSTO,
  AVISO_SIN_TC_API_PREVIO,
  MARGEN_VENTA_PCT_DEFAULT,
  NOTA_UTILIDAD,
  PERIODOS_TIENDA,
  TEXTO_A_COSTO,
  avisoUtilidad,
  avisoVentasSinUtilidad,
  fmtPrecioUnitario,
  lineaUsdOriginalTienda,
  lineaUnidadesTienda,
  lineasUtilidad,
  margenParaTexto,
  notaUtilidad,
  partesUtilidad,
  periodoTiendaDeUrl,
  rangoPeriodoTienda,
  textoMonto,
  textoUtilidadTienda,
  textoUtilidadUsdOriginal,
  tituloUtilidad,
  tonoDe,
  utilidadDeItem,
} from "../inventario-utilidad";

/**
 * Utilidad de la tienda (25-sep-2026). Casos REALES de prod tras el re-precio
 * de las 10 salidas del 01-sep (contrato §0): aceite 15W-50 → XA-VGV 12 ×
 * 26.5625 = 318.75 USD sobre costo 255.00 ⇒ +63.75 USD; las 3 salidas de
 * jul/ago a costo (MXN, sin venta).
 */

describe("textoMonto · la moneda SIEMPRE escrita, signo tipográfico", () => {
  it("USD con centavos y entero; MXN siempre con 2 decimales", () => {
    expect(textoMonto(63.75, "USD")).toBe("+$63.75 USD");
    expect(textoMonto(535.35, "USD")).toBe("+$535.35 USD");
    expect(textoMonto(1200, "MXN")).toBe("+$1,200.00 MXN");
    expect(textoMonto(191.25, "USD")).toBe("+$191.25 USD");
    expect(textoMonto(100, "USD")).toBe("+$100 USD");
  });

  it("negativos con «−» (no guion), cero sin signo", () => {
    expect(textoMonto(-10, "MXN")).toBe("−$10.00 MXN");
    expect(textoMonto(-2.5, "USD")).toBe("−$2.50 USD");
    expect(textoMonto(0, "USD")).toBe("$0 USD");
    expect(textoMonto(-0.001, "USD")).toBe("$0 USD");
    expect(textoMonto(0, "MXN")).toBe("$0.00 MXN");
  });

  it("sin signo cuando se pide (costos, ventas)", () => {
    expect(textoMonto(255, "USD", { signo: false })).toBe("$255 USD");
    expect(textoMonto(6633.32, "MXN", { signo: false })).toBe("$6,633.32 MXN");
  });

  it("tono por centavos", () => {
    expect(tonoDe(0.004)).toBe("neutro");
    expect(tonoDe(0.01)).toBe("positivo");
    expect(tonoDe(-3)).toBe("negativo");
    expect(tonoDe(null)).toBe("neutro");
  });
});

describe("utilidad del producto · jamás se suman las monedas", () => {
  it("utilidadDeItem: pesos (con respaldo `ganancia_mxn`) y dólares por su lado", () => {
    expect(utilidadDeItem({ utilidad_mxn: null, ganancia_mxn: null, utilidad_usd: 191.25 })).toEqual({
      mxn: null,
      usd: 191.25,
    });
    // API previo: solo `ganancia_mxn`.
    expect(utilidadDeItem({ ganancia_mxn: 400 })).toEqual({ mxn: 400, usd: null });
    // Números que llegan como texto (numeric de PostgREST).
    expect(utilidadDeItem({ utilidad_mxn: "12.5", utilidad_usd: "3" })).toEqual({ mxn: 12.5, usd: 3 });
  });

  it("lineasUtilidad: [] sin ventas · una línea · dos líneas (MXN primero), nunca una suma", () => {
    expect(lineasUtilidad({ mxn: null, usd: null })).toEqual([]);
    expect(lineasUtilidad({ mxn: 1200, usd: null })).toEqual(["+$1,200.00 MXN"]);
    expect(lineasUtilidad({ mxn: null, usd: 191.25 })).toEqual(["+$191.25 USD"]);
    expect(lineasUtilidad({ mxn: 1200, usd: 191.25 })).toEqual(["+$1,200.00 MXN", "+$191.25 USD"]);
    expect(partesUtilidad({ mxn: -5, usd: 0 }).map((p) => p.tono)).toEqual(["negativo", "neutro"]);
  });

  it("tituloUtilidad: unidades cargadas, cuántas a costo y el margen (caso aceite: 66 · 36 vendidas)", () => {
    expect(tituloUtilidad({ salidas_cant: 66, ventas_cant: 36 }, 25)).toBe(
      "66 unidades cargadas a aviones (30 a costo, sin utilidad) · margen vigente 25 % sobre el costo",
    );
    // Todo con venta: sin paréntesis.
    expect(tituloUtilidad({ salidas_cant: 2, ventas_cant: 2 }, 25)).toBe(
      "2 unidades cargadas a aviones · margen vigente 25 % sobre el costo",
    );
    expect(tituloUtilidad({ salidas_cant: 1, ventas_cant: 1 }, 12.5)).toBe(
      "1 unidad cargada a aviones · margen vigente 12.5 % sobre el costo",
    );
    // Sin salidas.
    expect(tituloUtilidad({ salidas_cant: null }, 25)).toBe(
      "Sin salidas a aviones · margen vigente 25 % sobre el costo",
    );
    // API previo: sin `ventas_cant` no se inventa cuántas fueron a costo; margen ausente ⇒ 25.
    expect(tituloUtilidad({ salidas_cant: 4 }, undefined)).toBe(
      "4 unidades cargadas a aviones · margen vigente 25 % sobre el costo",
    );
  });

  it("avisoUtilidad: entradas a $0 y ventas no calculables; «sin TC» ya NO con utilidad en dólares", () => {
    expect(avisoUtilidad({ utilidad_usd: 191.25, con_movimientos_sin_tc: true })).toBeNull();
    expect(avisoUtilidad({ utilidad_usd: null, con_entradas_sin_costo: true })).toBe(
      AVISO_ENTRADAS_SIN_COSTO,
    );
    expect(avisoUtilidad({ utilidad_usd: null, ventas_sin_utilidad: 2 })).toBe(
      avisoVentasSinUtilidad(2),
    );
    expect(avisoVentasSinUtilidad(1)).toBe(
      "1 venta en pesos sobre costo en dólares sin tipo de cambio: su utilidad no se puede calcular. Captura el T.C. de la compra con «Editar costo».",
    );
    // API previo (sin la llave `utilidad_usd`): se conserva el aviso de siempre.
    expect(avisoUtilidad({ con_movimientos_sin_tc: true })).toBe(AVISO_SIN_TC_API_PREVIO);
  });
});

describe("tarjeta «Utilidad de la tienda»", () => {
  it("MXN y USD separados; sin nada ⇒ «Sin ventas en el periodo»", () => {
    expect(textoUtilidadTienda({ utilidad_mxn: null, utilidad_usd: 535.35 })).toBe("+$535.35 USD");
    expect(textoUtilidadTienda({ utilidad_mxn: 1200, utilidad_usd: 535.35 })).toBe(
      "+$1,200.00 MXN · +$535.35 USD",
    );
    expect(textoUtilidadTienda({ utilidad_mxn: null, utilidad_usd: null })).toBe(
      "Sin ventas en el periodo",
    );
  });

  it("línea de unidades y margen", () => {
    expect(lineaUnidadesTienda(48, 25)).toBe("48 unidades vendidas a aviones · margen 25 % sobre el costo");
    expect(lineaUnidadesTienda(1, null)).toBe("1 unidad vendida a aviones · margen 25 % sobre el costo");
  });

  it("nota con el margen vigente (una sola redacción)", () => {
    expect(NOTA_UTILIDAD).toBe(
      "Utilidad = lo que se cobra al avión − el costo de la pieza. Toda salida sin precio se cobra a ese costo + 25 % (se cambia en Configuración). Pesos y dólares nunca se suman.",
    );
    expect(notaUtilidad(30)).toContain("costo + 30 %");
    // API 0.0.36: la utilidad ya cuenta en pesos (T.C. oficial de cada día).
    expect(notaUtilidad(25, { enPesos: true })).toBe(
      "Utilidad = lo que se cobra al avión − el costo de la pieza (último precio de compra). Toda salida sin precio se cobra a ese costo + 25 % (se cambia en Configuración). Las ventas en dólares se convierten a pesos con el T.C. oficial de su día.",
    );
    // Ninguna redacción dice «FIFO».
    expect(NOTA_UTILIDAD).not.toMatch(/FIFO/);
    expect(notaUtilidad(25, { enPesos: true })).not.toMatch(/FIFO/);
    expect(margenParaTexto(undefined)).toBe(MARGEN_VENTA_PCT_DEFAULT);
    expect(margenParaTexto(0)).toBe(0);
    expect(margenParaTexto(101)).toBe(25);
  });
});

describe("periodos de la tarjeta · días Cancún", () => {
  it("catálogo y URL (fuera de catálogo ⇒ Todo)", () => {
    expect(PERIODOS_TIENDA.map((p) => p.etiqueta)).toEqual(["Todo", "Este mes", "Mes pasado"]);
    expect(periodoTiendaDeUrl(undefined)).toBe("todo");
    expect(periodoTiendaDeUrl("mes")).toBe("mes");
    expect(periodoTiendaDeUrl(["mes-anterior", "mes"])).toBe("mes-anterior");
    expect(periodoTiendaDeUrl("año")).toBe("todo");
  });

  it("rangos: todo ⇒ null · mes ⇒ 1.º..hoy · mes pasado completo (incluye cruce de año y febrero)", () => {
    expect(rangoPeriodoTienda("todo", "2026-09-25")).toBeNull();
    expect(rangoPeriodoTienda("mes", "2026-09-25")).toEqual({ desde: "2026-09-01", hasta: "2026-09-25" });
    expect(rangoPeriodoTienda("mes-anterior", "2026-09-25")).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
    expect(rangoPeriodoTienda("mes-anterior", "2027-01-03")).toEqual({
      desde: "2026-12-01",
      hasta: "2026-12-31",
    });
    expect(rangoPeriodoTienda("mes-anterior", "2028-03-10")).toEqual({
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
  });
});

describe("API 0.0.36 · utilidad en pesos con el dólar original aparte", () => {
  it("tooltip de la celda: + «En dólares: …» con `utilidad_usd_original` (aceite 15W-50)", () => {
    const it15w50 = {
      utilidad_mxn: 3252.72,
      utilidad_usd: null,
      utilidad_usd_original: 191.25,
      salidas_cant: 66,
      ventas_cant: 36,
    };
    expect(utilidadDeItem(it15w50)).toEqual({ mxn: 3252.72, usd: null });
    expect(tituloUtilidad(it15w50, 25)).toBe(
      "66 unidades cargadas a aviones (30 a costo, sin utilidad) · margen vigente 25 % sobre el costo. " +
        "En dólares: +$191.25 USD (al T.C. de cada venta)",
    );
    // Sin el dato (API previo): el tooltip de siempre.
    expect(tituloUtilidad({ ...it15w50, utilidad_usd_original: undefined }, 25)).not.toContain("En dólares");
    expect(textoUtilidadUsdOriginal(null)).toBeNull();
  });

  it("tarjeta: línea tenue «≈ +$535.35 USD al T.C. de cada venta» (jamás sumada)", () => {
    expect(lineaUsdOriginalTienda(535.35)).toBe("≈ +$535.35 USD al T.C. de cada venta");
    expect(lineaUsdOriginalTienda(null)).toBeNull();
    expect(lineaUsdOriginalTienda(undefined)).toBeNull();
    // La cifra grande es SOLO pesos: 9,105.07 MXN (las 10 salidas del 01-sep a 17.0077).
    expect(textoUtilidadTienda({ utilidad_mxn: 9105.07, utilidad_usd: null })).toBe("+$9,105.07 MXN");
  });

  it("precio unitario: 2 a 4 decimales y SIEMPRE con moneda", () => {
    expect(fmtPrecioUnitario(26.5625, "USD")).toBe("$26.5625 USD");
    expect(fmtPrecioUnitario(21.25, "USD")).toBe("$21.25 USD");
    expect(fmtPrecioUnitario(30, "USD")).toBe("$30.00 USD");
    expect(fmtPrecioUnitario("1658.3300", "MXN")).toBe("$1,658.33 MXN");
    expect(fmtPrecioUnitario(37.5, "USD")).toBe("$37.50 USD");
    expect(fmtPrecioUnitario(null, "USD")).toBe("—");
    expect(TEXTO_A_COSTO).toBe("A costo · sin utilidad");
  });
});
