/**
 * Pre-cierre «Gastos en dólares conciliados con un tipo de cambio fuera de
 * lugar» (13-oct-2026, API 0.0.75): renglones con el texto del API y sus DOS
 * enlaces (el cargo en Conciliación y el vuelo o el gasto), «y N más» contra
 * `count` y el «Resolver →» del periodo.
 */
import { describe, expect, it } from "vitest";
import {
  CLAVE_PRECIERRE_LIGAS_USD_TC,
  ETIQUETA_VER_CARGO,
  hrefLigasUsdTcPeriodo,
  lineasLigasUsdTc,
} from "@/lib/admin/pre-cierre-tc-usd";
import type { LigaUsdTcPreCierre } from "@/types/conciliacion";
import { TUBO_LEJOS } from "./tc-cruce.fixtures";

const liga = (over: Partial<LigaUsdTcPreCierre> = {}): LigaUsdTcPreCierre => ({
  gasto_id: "2d37d95e-0000-4000-8000-000000000001",
  fecha_gasto: "2026-09-01",
  monto_usd: 422.86,
  tc_gasto: 21.1403,
  categoria: "REFACCION",
  descripcion_gasto: "Aircraft Spruce & Specialty Co. · Michelin Tube 7.00-6/8.00…",
  vuelo_id: null,
  vuelo_folio: null,
  movimiento_id: "e5724490-0000-4000-8000-000000000001",
  fecha_cargo: "2026-09-01",
  monto_cargo: 8939.38,
  cuenta_bancaria_id: "c0b1e2d3-0000-4000-8000-00000000c0b1",
  cuenta: "COMBUSTIBLE",
  descripcion_cargo: "ASA CANCUN",
  tc_cruce: TUBO_LEJOS,
  texto:
    "$422.86 USD · Aircraft Spruce & Specialty Co. · Michelin Tube 7.00-6/8.00… (01 sep) ↔ cargo «ASA CANCUN» de $8,939.38 del 01 sep (COMBUSTIBLE): T.C. 21.14 · oficial 17.01 (+24.3 %): lejos del oficial",
  ...over,
});

describe("lineasLigasUsdTc", () => {
  it("el texto del API tal cual, el tooltip del T.C. y los dos enlaces", () => {
    const r = lineasLigasUsdTc([liga()], 1);
    expect(r.restantes).toBe(0);
    expect(r.lineas).toEqual([
      {
        key: "2d37d95e-0000-4000-8000-000000000001",
        texto: liga().texto,
        titulo: TUBO_LEJOS.titulo,
        hrefConciliacion:
          "/admin/conciliacion?f=conciliados&cuenta=c0b1e2d3-0000-4000-8000-00000000c0b1&desde=2026-09-01&hasta=2026-09-01",
        hrefGasto: "/admin/expenses?desde=2026-09-01&hasta=2026-09-01",
        etiquetaGasto: "Ver el gasto",
      },
    ]);
  });

  it("con vuelo: «Ver el vuelo #N» al vuelo", () => {
    const r = lineasLigasUsdTc([liga({ vuelo_id: "7d50c91c-0000-4000-8000-000000000345", vuelo_folio: 345 })], 1);
    expect(r.lineas[0].hrefGasto).toBe("/admin/flights/7d50c91c-0000-4000-8000-000000000345");
    expect(r.lineas[0].etiquetaGasto).toBe("Ver el vuelo #345");
  });

  it("máximo 8 y «restantes» contra el count del API (no contra el largo del arreglo)", () => {
    const ligas = Array.from({ length: 10 }, (_, i) => liga({ gasto_id: `g-${i}` }));
    const r = lineasLigasUsdTc(ligas, 12);
    expect(r.lineas).toHaveLength(8);
    expect(r.restantes).toBe(4);
    expect(lineasLigasUsdTc(ligas, 10, 3).restantes).toBe(7);
    expect(lineasLigasUsdTc(null, 0)).toEqual({ lineas: [], restantes: 0 });
  });

  it("«Resolver →» = Conciliación, pestaña conciliados, del periodo; clave y etiqueta del contrato", () => {
    expect(hrefLigasUsdTcPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" })).toBe(
      "/admin/conciliacion?f=conciliados&desde=2026-09-01&hasta=2026-09-30",
    );
    expect(CLAVE_PRECIERRE_LIGAS_USD_TC).toBe("gastos_usd_tc_fuera_de_lugar");
    expect(ETIQUETA_VER_CARGO).toBe("Ver el cargo");
  });
});
