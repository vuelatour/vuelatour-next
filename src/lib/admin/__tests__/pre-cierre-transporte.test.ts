/**
 * PRE-CIERRE «Vuelos con transporte pagado sin transporte cotizado»
 * (15-oct-2026, PEDIDO 4): cómo se pinta cada chip y a dónde llevan el chip y
 * «Resolver →». Es una SEÑAL: el API decide qué gasto parece transporte de
 * pasajeros y manda su texto (≤ 60) y los montos por moneda.
 */
import { describe, expect, it } from "vitest";
import {
  CHIP_TEXTO_TRANSPORTE_MAX,
  CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR,
  chipVueloTransporte,
  hrefPrecierreTransporte,
} from "@/lib/admin/pre-cierre-transporte";

const V = "3c9d1e22-0000-4000-8000-000000000190";
const QUE_HACER =
  "Revisa si se cobró; si no, agrégalo como extra en la cotización o anótalo en «Seguimiento de la cotización».";

describe("Transporte pagado sin cotizar: clave y «Resolver →»", () => {
  it("clave del API y tope del chip", () => {
    expect(CLAVE_PRECIERRE_TRANSPORTE_PAGADO_SIN_COTIZAR).toBe("transporte_pagado_sin_cotizar");
    expect(CHIP_TEXTO_TRANSPORTE_MAX).toBe(28);
  });

  it("«Resolver →» = la lista de Cotizaciones del periodo", () => {
    expect(hrefPrecierreTransporte({ desde: "2026-08-01", hasta: "2026-08-31" })).toBe(
      "/admin/quotes?desde=2026-08-01&hasta=2026-08-31",
    );
  });
});

describe("chip del vuelo", () => {
  it("#190: un gasto ⇒ monto + texto recortado a 28 + «…»; title con el texto completo", () => {
    expect(
      chipVueloTransporte({
        id: V,
        folio: 190,
        matricula: "XB-PEV",
        monto_mxn: 400,
        monto_usd: 0,
        gastos: [{ id: "66d575d8", texto: "Transporte Chetumal a Carl's Jr", monto: 400, moneda: "MXN" }],
      }),
    ).toEqual({
      texto: "#190 ($400 MXN · Transporte Chetumal a Carl's…)",
      href: `/admin/quotes/${V}`,
      title: `Transporte pagado sin cotizar · XB-PEV: $400 MXN · Transporte Chetumal a Carl's Jr. ${QUE_HACER}`,
    });
  });

  it("texto corto (≤ 28) va completo, sin «…»", () => {
    const c = chipVueloTransporte({
      id: V,
      folio: 320,
      monto_mxn: 1500,
      gastos: [{ id: "1cccba02", texto: "transporte Master Ruben", monto: 1500, moneda: "MXN" }],
    });
    expect(c.texto).toBe("#320 ($1,500 MXN · transporte Master Ruben)");
    // Sin matrícula se omite « · XB-PEV».
    expect(c.title).toBe(`Transporte pagado sin cotizar: $1,500 MXN · transporte Master Ruben. ${QUE_HACER}`);
  });

  it("varios gastos ⇒ «N gastos» con el monto del API; el title los lista con «; »", () => {
    const c = chipVueloTransporte({
      id: V,
      folio: 404,
      matricula: "N990GG",
      monto_mxn: 700,
      monto_usd: 0,
      gastos: [
        { id: "a", texto: "Servicio de taxi privado, ida", monto: 400, moneda: "MXN" },
        { id: "b", texto: "Servicio de taxi privado, regreso", monto: 300, moneda: "MXN" },
      ],
    });
    expect(c.texto).toBe("#404 ($700 MXN · 2 gastos)");
    expect(c.title).toBe(
      `Transporte pagado sin cotizar · N990GG: $400 MXN · Servicio de taxi privado, ida; $300 MXN · Servicio de taxi privado, regreso. ${QUE_HACER}`,
    );
  });

  it("dos monedas: « + » entre monedas, jamás sumadas", () => {
    const c = chipVueloTransporte({
      id: V,
      folio: 44,
      monto_mxn: 300,
      monto_usd: 45.5,
      gastos: [
        { id: "a", texto: "Taxi privado", monto: 300, moneda: "MXN" },
        { id: "b", texto: "Shuttle", monto: 45.5, moneda: "USD" },
      ],
    });
    expect(c.texto).toBe("#44 ($300 MXN + $45.50 USD · 2 gastos)");
    expect(c.title).toContain("$300 MXN · Taxi privado; $45.50 USD · Shuttle.");
  });

  it("sin gastos ni montos (API raro) ⇒ «#190»; folio 0 ⇒ «vuelo»", () => {
    expect(chipVueloTransporte({ id: V, folio: 190 })).toEqual({
      texto: "#190",
      href: `/admin/quotes/${V}`,
      title: `Transporte pagado sin cotizar. ${QUE_HACER}`,
    });
    expect(chipVueloTransporte({ id: V, folio: 0, gastos: null }).texto).toBe("vuelo");
  });
});
