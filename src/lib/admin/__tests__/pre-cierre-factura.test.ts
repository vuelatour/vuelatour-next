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

describe("FACTURAS POR COBRO (16-oct-2026, API 0.0.82): el vuelo YA tiene factura pero no ampara todos sus cobros", () => {
  it("#332 tras el backfill: «#332 (A-0420 · 3 cobros sin factura · Scotiabank Pesos)» a la card de cobros", () => {
    const c = chipVueloSinFactura({
      id: V,
      folio: 332,
      matricula: "XA-VGV",
      solicitada: false,
      cuentas: ["Scotiabank Pesos"],
      registrada: "A-0420",
      cobros_sin_factura: 3,
    });
    expect(c).toEqual({
      texto: "#332 (A-0420 · 3 cobros sin factura · Scotiabank Pesos)",
      href: `/admin/flights/${V}#cobros`,
      title:
        "Ya tiene factura, pero 3 de sus cobros que exigen factura no están amparados por ninguna · XA-VGV. Asígnala desde cada cobro o registra la que falta.",
    });
    // Singular.
    expect(chipVueloSinFactura({ id: V, folio: 364, registrada: "FA-A-0434", cobros_sin_factura: 1 }).texto).toBe(
      "#364 (FA-A-0434 · 1 cobro sin factura)",
    );
    // «pedida» no aplica (ya tiene factura); un cancelado se dice primero.
    expect(chipVueloSinFactura({ id: V, folio: 1, registrada: "A-1", cobros_sin_factura: 2, solicitada: true, estado: "CANCELADO" }).texto).toBe(
      "#1 (CANCELADO · A-1 · 2 cobros sin factura)",
    );
  });

  it("sin `registrada` (API previo o vuelo sin factura): el chip de siempre", () => {
    expect(chipVueloSinFactura({ id: V, folio: 376, cuentas: ["HSBC Pesos"], registrada: null, cobros_sin_factura: 0 }).texto).toBe(
      "#376 (HSBC Pesos)",
    );
  });
});
