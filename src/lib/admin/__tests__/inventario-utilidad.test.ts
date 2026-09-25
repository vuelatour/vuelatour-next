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
  filaUtilidadSalida,
  lineaUnidadesTienda,
  lineasUtilidad,
  margenParaTexto,
  notaUtilidad,
  partesUtilidad,
  periodoTiendaDeUrl,
  rangoPeriodoTienda,
  textoMonto,
  textoUtilidadTienda,
  tituloUtilidad,
  tonoDe,
  utilidadDeItem,
} from "../inventario-utilidad";
import type { ResumenVenta } from "@/types/inventory";

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
      "Utilidad = lo que se cobra al avión − costo FIFO de lo que salió. Toda salida sin precio se cobra a costo + 25 % (se cambia en Configuración). Pesos y dólares nunca se suman.",
    );
    expect(notaUtilidad(30)).toContain("costo + 30 %");
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

describe("filaUtilidadSalida · filas REALES del aceite 15W-50", () => {
  const base: ResumenVenta = {
    movimiento_id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
    fecha: "2026-09-01",
    cantidad: 12,
    precio_unitario_mxn: null,
    total_mxn: null,
    venta_moneda: "USD",
    venta_unitaria_capturada: 26.5625,
    a_costo: false,
    sin_tc: true,
    costo_fifo_mxn: null,
    ganancia_mxn: null,
    venta_total: 318.75,
    costo_fifo_usd: 255,
    ganancia_usd: 63.75,
    moneda_utilidad: "USD",
    utilidad_incompleta: false,
    vendido_a: "XA-VGV",
    aeronave_id: "3d0546c3-941f-45cc-b8a9-e3ee77545e68",
    para_flota: false,
    referencia: "0",
    descripcion: "Aceite multigrado semisintético 15W-50 · sin TC · ref 0",
    remanente: 108,
    gasto_id: "127a997d-f7e4-4318-af41-e203f86fa12c",
  };

  it("venta en dólares sobre costo en dólares ⇒ utilidad USD (+63.75)", () => {
    expect(filaUtilidadSalida(base)).toEqual({
      costo: { monto: 255, moneda: "USD" },
      venta: { monto: 318.75, moneda: "USD" },
      utilidad: { monto: 63.75, moneda: "USD" },
      estado: "VENTA",
    });
  });

  it("salida vieja de jul/ago A COSTO (N990GG × 24, MXN) ⇒ sin utilidad, costo en pesos", () => {
    const aCosto: ResumenVenta = {
      ...base,
      movimiento_id: "533fce35-6088-432b-b41f-a242aa471b42",
      fecha: "2026-08-06",
      cantidad: 24,
      a_costo: true,
      sin_tc: false,
      venta_moneda: null,
      venta_unitaria_capturada: null,
      precio_unitario_mxn: 1658.33,
      total_mxn: 39799.92,
      costo_fifo_mxn: 39799.92,
      venta_total: null,
      costo_fifo_usd: 2272.98,
      ganancia_usd: null,
      moneda_utilidad: null,
      vendido_a: "N990GG",
    };
    expect(filaUtilidadSalida(aCosto)).toEqual({
      costo: { monto: 39799.92, moneda: "MXN" },
      venta: null,
      utilidad: null,
      estado: "A_COSTO",
    });
    expect(TEXTO_A_COSTO).toBe("A costo · sin utilidad");
  });

  it("venta en pesos (con T.C.) ⇒ utilidad MXN", () => {
    const mxn: ResumenVenta = {
      ...base,
      venta_moneda: "MXN",
      total_mxn: 500,
      costo_fifo_mxn: 400,
      ganancia_mxn: 100,
      venta_total: 500,
      ganancia_usd: null,
      moneda_utilidad: "MXN",
    };
    expect(filaUtilidadSalida(mxn)).toEqual({
      costo: { monto: 400, moneda: "MXN" },
      venta: { monto: 500, moneda: "MXN" },
      utilidad: { monto: 100, moneda: "MXN" },
      estado: "VENTA",
    });
  });

  it("venta en pesos sobre costo en dólares sin T.C. ⇒ INCOMPLETA (no calculable, nada se inventa)", () => {
    const inc: ResumenVenta = {
      ...base,
      venta_moneda: "MXN",
      total_mxn: 3000,
      venta_total: 3000,
      ganancia_usd: null,
      moneda_utilidad: null,
      utilidad_incompleta: true,
    };
    expect(filaUtilidadSalida(inc)).toEqual({
      costo: { monto: 255, moneda: "USD" },
      venta: { monto: 3000, moneda: "MXN" },
      utilidad: null,
      estado: "INCOMPLETA",
    });
  });

  it("API PREVIO (sin llaves nuevas): pesos si hay `ganancia_mxn`; si no, no calculable", () => {
    const { venta_total, costo_fifo_usd, ganancia_usd, moneda_utilidad, utilidad_incompleta, ...viejo } = base;
    void venta_total;
    void costo_fifo_usd;
    void ganancia_usd;
    void moneda_utilidad;
    void utilidad_incompleta;
    expect(filaUtilidadSalida(viejo as ResumenVenta).estado).toBe("INCOMPLETA");
    const conPesos = { ...viejo, ganancia_mxn: 50, total_mxn: 450, costo_fifo_mxn: 400 } as ResumenVenta;
    expect(filaUtilidadSalida(conPesos)).toEqual({
      costo: { monto: 400, moneda: "MXN" },
      venta: { monto: 450, moneda: "MXN" },
      utilidad: { monto: 50, moneda: "MXN" },
      estado: "VENTA",
    });
  });
});
