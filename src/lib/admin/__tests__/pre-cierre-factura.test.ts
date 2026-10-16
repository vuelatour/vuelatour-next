/**
 * PRE-CIERRE «Vuelos cobrados en cuentas que exigen factura sin factura
 * registrada» (13-oct-2026, invariante 60 del API): cómo se pinta cada chip
 * y a dónde llevan el chip y «Resolver →». El API decide QUÉ vuelos entran.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAVE_PRECIERRE_VUELOS_SIN_FACTURA,
  chipVueloSinFactura,
  hrefPrecierreVuelosSinFactura,
} from "@/lib/admin/pre-cierre-factura";

const V = "eb474572-8bda-469f-adca-db556f811d86";

describe("chips de «Vuelos cobrados en cuentas que exigen factura…»", () => {
  it("clave y «Resolver →» (Facturas emitidas, sección «Por facturar»)", () => {
    expect(CLAVE_PRECIERRE_VUELOS_SIN_FACTURA).toBe("vuelos_cobrados_sin_factura");
    expect(hrefPrecierreVuelosSinFactura()).toBe("/admin/facturas-emitidas#por-facturar");
  });

  it("sin pedir: folio + cuenta; lleva a la card de cobros del vuelo y dice qué hacer", () => {
    expect(
      chipVueloSinFactura({ id: V, folio: 376, matricula: "XA-VGV", solicitada: false, cuentas: ["HSBC Pesos"] }),
    ).toEqual({
      texto: "#376 (HSBC Pesos)",
      href: `/admin/flights/${V}#cobros`,
      title:
        "Cobro en HSBC Pesos sin factura registrada · XA-VGV. Pídela con «Necesito factura» o regístrala en Facturas emitidas.",
    });
  });

  it("ya pedida: «pedida» en el chip y falta registrarla", () => {
    const c = chipVueloSinFactura({
      id: V,
      folio: 341,
      solicitada: true,
      cuentas: ["HSBC Pesos", "Transferencia sin cuenta destino"],
    });
    expect(c.texto).toBe("#341 (HSBC Pesos · Transferencia sin cuenta destino · pedida)");
    expect(c.title).toBe(
      "Cobro en HSBC Pesos y Transferencia sin cuenta destino sin factura registrada. Ya está en «Por facturar»: falta registrarla en Facturas emitidas.",
    );
  });

  it("CANCELADO (aditivo del API, solo en cancelados): primero en el chip y se registra directo", () => {
    const c = chipVueloSinFactura({ id: V, folio: 430, estado: "CANCELADO", solicitada: false, cuentas: ["HSBC Dólares"] });
    expect(c.texto).toBe("#430 (CANCELADO · HSBC Dólares)");
    expect(c.title).toContain("Vuelo cancelado: regístrala directo en Facturas emitidas.");
    expect(c.title).not.toContain("Necesito factura");
  });

  it("tolerante: sin cuentas ni banderas (API raro) sigue diciendo algo útil", () => {
    expect(chipVueloSinFactura({ id: V, folio: 12 })).toEqual({
      texto: "#12",
      href: `/admin/flights/${V}#cobros`,
      title:
        "Cobro en una cuenta que exige factura sin factura registrada. Pídela con «Necesito factura» o regístrala en Facturas emitidas.",
    });
    expect(chipVueloSinFactura({ id: V, folio: 0, cuentas: [] }).texto).toBe("vuelo");
  });
});

describe("cableado en la card del pre-cierre", () => {
  const fuente = readFileSync(
    path.resolve(__dirname, "../../../components/admin/reportes/pre-cierre-card.tsx"),
    "utf8",
  );

  it("«Resolver →» va a Facturas emitidas", () => {
    expect(fuente).toContain("[CLAVE_PRECIERRE_VUELOS_SIN_FACTURA]: hrefPrecierreVuelosSinFactura,");
  });

  it("sus chips salen del helper (con su title) y los genéricos no se repiten para este renglón", () => {
    // Desde el 15-oct-2026 el caso especial vive en `CHIP_POR_CLAVE` (junto a
    // los renglones inversos); el genérico solo pinta las claves sin helper.
    expect(fuente).toContain("[CLAVE_PRECIERRE_VUELOS_SIN_FACTURA]: chipVueloSinFactura,");
    expect(fuente).toContain("const chipDeClave = CHIP_POR_CLAVE[item.clave];");
    expect(fuente).toContain("const chip = chipDeClave(v);");
    expect(fuente).toMatch(/href=\{chip\.href\}\s*title=\{chip\.title\}/);
    expect(fuente).toMatch(/\{!chipDeClave &&\s*item\.vuelos && item\.vuelos\.length > 0 &&/);
  });
});
