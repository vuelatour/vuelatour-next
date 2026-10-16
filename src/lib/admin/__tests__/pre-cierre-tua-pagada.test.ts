/**
 * PRE-CIERRE «Vuelos con TUA pagada por Operación sin TUA cobrada al
 * cliente» (15-oct-2026, PEDIDO 4): cómo se pinta cada chip y a dónde llevan
 * el chip y «Resolver →». El API decide QUÉ vuelos entran y manda los montos
 * por moneda (los casos son los de prod: #70, #125 y #154).
 */
import { describe, expect, it } from "vitest";
import {
  CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR,
  ETIQUETA_PASE_ABORDAR,
  chipVueloTuaPagada,
  hrefPrecierreTuaPagada,
  montosPorMonedaTexto,
} from "@/lib/admin/pre-cierre-tua-pagada";

const V = "7f0c2a10-0000-4000-8000-000000000070";
const INSTRUCCION =
  "La cotización no cobra TUA: ábrela y enciende «Se cobran TUAS» o agrégala como extra con «TUA» en el concepto.";

describe("TUA pagada sin cobrar: clave y «Resolver →»", () => {
  it("clave del API", () => {
    expect(CLAVE_PRECIERRE_TUA_PAGADA_SIN_COBRAR).toBe("tua_pagada_sin_cobrar");
    expect(ETIQUETA_PASE_ABORDAR).toBe("pase de abordar");
  });

  it("«Resolver →» = la lista de Cotizaciones del periodo (solo la base)", () => {
    expect(hrefPrecierreTuaPagada({ desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "/admin/quotes?desde=2026-09-01&hasta=2026-09-30",
    );
  });
});

describe("chip del vuelo", () => {
  it("#70: 2 facturas en pesos, a la cotización del vuelo", () => {
    expect(
      chipVueloTuaPagada({
        id: V,
        folio: 70,
        matricula: "XA-VGV",
        tua_pagada_mxn: 2355.39,
        tua_pagada_usd: 0,
        pase_abordar: false,
        gastos_n: 2,
      }),
    ).toEqual({
      texto: "#70 ($2,355.39 MXN · 2 facturas)",
      href: `/admin/quotes/${V}`,
      title: `TUA pagada por Operación (IVA incluido): $2,355.39 MXN en 2 facturas del aeropuerto · XA-VGV. ${INSTRUCCION}`,
    });
  });

  it("#125: 1 factura ⇒ sin «facturas» en el chip y «en 1 factura» en el title", () => {
    const c = chipVueloTuaPagada({
      id: V,
      folio: 125,
      matricula: "N58BT",
      tua_pagada_mxn: 430.49,
      tua_pagada_usd: 0,
      pase_abordar: false,
      gastos_n: 1,
    });
    expect(c.texto).toBe("#125 ($430.49 MXN)");
    expect(c.title).toBe(
      `TUA pagada por Operación (IVA incluido): $430.49 MXN en 1 factura del aeropuerto · N58BT. ${INSTRUCCION}`,
    );
  });

  it("#154: pase de abordar va primero y el title dice revisar la factura", () => {
    const c = chipVueloTuaPagada({
      id: V,
      folio: 154,
      matricula: "XA-VGV",
      tua_pagada_mxn: 756.48,
      tua_pagada_usd: 0,
      pase_abordar: true,
      gastos_n: 1,
    });
    expect(c.texto).toBe("#154 (pase de abordar · $756.48 MXN)");
    expect(c.title).toBe(
      `TUA pagada por Operación (IVA incluido): $756.48 MXN en 1 factura del aeropuerto · XA-VGV. ${INSTRUCCION} El pasajero compró su pase de abordar: si él pagó su TUA, revisa la factura en Gastos → «Verificar / editar».`,
    );
  });

  it("dos monedas: se dicen las dos con « + », jamás sumadas", () => {
    const c = chipVueloTuaPagada({ id: V, folio: 70, tua_pagada_mxn: 1000, tua_pagada_usd: 50, gastos_n: 3 });
    expect(c.texto).toBe("#70 ($1,000 MXN + $50 USD · 3 facturas)");
    // Sin matrícula se omite « · XA-VGV».
    expect(c.title).toBe(
      `TUA pagada por Operación (IVA incluido): $1,000 MXN + $50 USD en 3 facturas del aeropuerto. ${INSTRUCCION}`,
    );
  });

  it("sin montos (API raro) ⇒ solo el folio; folio 0 ⇒ «vuelo»", () => {
    const c = chipVueloTuaPagada({ id: V, folio: 70 });
    expect(c).toEqual({
      texto: "#70",
      href: `/admin/quotes/${V}`,
      title: `TUA pagada por Operación (IVA incluido). ${INSTRUCCION}`,
    });
    expect(chipVueloTuaPagada({ id: V, folio: 0, tua_pagada_mxn: null }).texto).toBe("vuelo");
  });

  it("montosPorMonedaTexto: solo las monedas > 0, en orden MXN + USD", () => {
    expect(montosPorMonedaTexto(0, 12.5)).toBe("$12.50 USD");
    expect(montosPorMonedaTexto(null, undefined)).toBeNull();
    expect(montosPorMonedaTexto(400, 0)).toBe("$400 MXN");
  });
});
