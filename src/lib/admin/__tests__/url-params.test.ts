import { describe, expect, it } from "vitest";
import {
  ESTADOS_COBRO,
  ESTADOS_VUELO,
  cobroFiltro,
  esDiaValido,
  esUuid,
  estadoFiltro,
  fechaFiltro,
  rangoFiltro,
  uuidFiltro,
  valorDeCatalogo,
} from "../url-params";

/**
 * Parámetros de URL inválidos (enlaces viejos, marcadores) — 21-sep-2026.
 * Cada caso de abajo fue REPRODUCIDO tumbando una pantalla del panel al
 * error boundary.
 */
describe("ids de rutas de detalle", () => {
  it("acepta uuid y rechaza cualquier otra cosa (⇒ notFound sin llamar al API)", () => {
    expect(esUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(esUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
    for (const malo of ["", "123", "no-uuid", "../../admin", "null", "undefined"]) {
      expect(esUuid(malo)).toBe(false);
    }
    expect(esUuid(null)).toBe(false);
    expect(esUuid(undefined)).toBe(false);
  });

  it("uuidFiltro ignora un id basura en vez de mandarlo al API", () => {
    expect(uuidFiltro("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
    expect(uuidFiltro("pepe")).toBeUndefined();
    expect(uuidFiltro("")).toBeUndefined();
  });
});

describe("filtros de catálogo cerrado", () => {
  it("los 7 estados del API pasan; lo inventado se ignora", () => {
    expect(ESTADOS_VUELO).toContain("CONFIRMADO");
    expect(ESTADOS_VUELO).toHaveLength(7);
    for (const e of ESTADOS_VUELO) expect(estadoFiltro(e)).toBe(e);
    // `/admin/flights?estado=<inválido>` y `/admin/quotes?estado=<inválido>`.
    expect(estadoFiltro("VOLANDO")).toBeUndefined();
    expect(estadoFiltro("confirmado")).toBeUndefined(); // el enum va en MAYÚSCULAS
    expect(estadoFiltro("")).toBeUndefined();
  });

  it("los 4 estados de cobro del API pasan; lo inventado se ignora", () => {
    for (const c of ESTADOS_COBRO) expect(cobroFiltro(c)).toBe(c);
    // `/admin/flights?cobro=<inválido>`.
    expect(cobroFiltro("PAGADO")).toBeUndefined();
    expect(cobroFiltro("si")).toBeUndefined();
  });

  it("valorDeCatalogo es genérico (sirve para cualquier enum del API)", () => {
    const medios = ["EFECTIVO", "TARJETA"] as const;
    expect(valorDeCatalogo("EFECTIVO", medios)).toBe("EFECTIVO");
    expect(valorDeCatalogo("BITCOIN", medios)).toBeUndefined();
    expect(valorDeCatalogo(undefined, medios)).toBeUndefined();
  });
});

describe("fechas de filtro", () => {
  it("rechaza días que no existen (el 400 del API tumbaba la pantalla)", () => {
    expect(esDiaValido("2026-09-21")).toBe(true);
    expect(esDiaValido("2024-02-29")).toBe(true); // bisiesto de verdad
    expect(esDiaValido("2026-02-29")).toBe(false); // 2026 NO es bisiesto
    expect(esDiaValido("2026-13-45")).toBe(false); // `/admin/expenses?desde=2026-13-45`
    expect(esDiaValido("2026-02-30")).toBe(false);
    expect(esDiaValido("nada")).toBe(false); // `/admin/profit-sharing?desde=nada`
    expect(esDiaValido("21/09/2026")).toBe(false);
    expect(esDiaValido(undefined)).toBe(false);
  });

  it("fechaFiltro acepta día e ISO completo, y descarta lo demás", () => {
    expect(fechaFiltro("2026-09-21")).toBe("2026-09-21");
    expect(fechaFiltro("2026-09-21T10:00:00.000Z")).toBe("2026-09-21T10:00:00.000Z");
    expect(fechaFiltro("2026-13-45")).toBeUndefined();
    expect(fechaFiltro("2026-13-45T00:00:00Z")).toBeUndefined();
    expect(fechaFiltro("nada")).toBeUndefined();
    expect(fechaFiltro("")).toBeUndefined();
  });

  it("rangoFiltro endereza un rango invertido y poda lo inválido", () => {
    expect(rangoFiltro("2026-09-30", "2026-09-01")).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
    expect(rangoFiltro("nada", "2026-09-30")).toEqual({
      desde: undefined,
      hasta: "2026-09-30",
    });
    expect(rangoFiltro(undefined, undefined)).toEqual({
      desde: undefined,
      hasta: undefined,
    });
  });
});
