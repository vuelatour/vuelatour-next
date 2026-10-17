/**
 * `lib/api/campo-opcional.ts` (16-oct-2026, API 0.0.90): ¿el 400 es el de un
 * API que todavía NO conoce un campo nuevo de la consulta? Lo usan la lectura
 * de Gastos en el servidor y la descarga del Excel. Cualquier otro status o
 * un 400 de OTRO campo ⇒ false (sube como siempre).
 */
import { describe, expect, it } from "vitest";
import { esCampoDesconocidoParaApi, sinCampos } from "@/lib/api/campo-opcional";

describe("esCampoDesconocidoParaApi", () => {
  it("400 «property excluir_categoria should not exist» ⇒ true (texto o lista)", () => {
    expect(esCampoDesconocidoParaApi(400, "property excluir_categoria should not exist", "excluir_categoria")).toBe(true);
    expect(
      esCampoDesconocidoParaApi(400, ["property excluir_categoria should not exist"], "excluir_categoria"),
    ).toBe(true);
    expect(esCampoDesconocidoParaApi(400, "Property EXCLUIR_CATEGORIA no debe existir", "excluir_categoria")).toBe(
      true,
    );
  });

  it("un 400 de OTRO campo, otro status o sin campo ⇒ false", () => {
    expect(esCampoDesconocidoParaApi(400, "property desde should not exist", "excluir_categoria")).toBe(false);
    expect(esCampoDesconocidoParaApi(502, "property excluir_categoria should not exist", "excluir_categoria")).toBe(
      false,
    );
    expect(esCampoDesconocidoParaApi(400, "excluir_categoria must be one of …", "excluir_categoria")).toBe(false);
    expect(esCampoDesconocidoParaApi(400, "property excluir_categoria should not exist", "")).toBe(false);
    expect(esCampoDesconocidoParaApi(undefined, undefined, "excluir_categoria")).toBe(false);
  });

  it("el nombre del campo se compara como palabra (no un pedazo)", () => {
    expect(esCampoDesconocidoParaApi(400, "property excluir_categoria_x should not exist", "excluir_categoria")).toBe(
      false,
    );
  });
});

describe("sinCampos", () => {
  it("quita SOLO los campos pedidos y no muta la consulta original", () => {
    const q = { excluir_categoria: "NOMINA", desde: "2026-10-01", limit: 200 };
    const sin = sinCampos(q, ["excluir_categoria"]);
    expect(sin).toEqual({ desde: "2026-10-01", limit: 200 });
    expect(q).toEqual({ excluir_categoria: "NOMINA", desde: "2026-10-01", limit: 200 });
  });
});
