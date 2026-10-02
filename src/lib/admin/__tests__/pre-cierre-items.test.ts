/**
 * Pre-cierre: un renglón cuya lectura FALLÓ en el API (`lectura_fallida`,
 * ADITIVO 29-sep-2026, hoy en «ajustes pendientes de reflejar en la
 * cotización») llega con `count: 0`. Ese 0 no es «no hay»: el renglón se
 * pinta con «sin verificar» en vez de desaparecer en silencio.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { itemPreCierreVisible, textoConteoPreCierre } from "@/lib/admin/pre-cierre-items";

describe("itemPreCierreVisible", () => {
  it("con pendientes se pinta; con 0 y lectura buena, no", () => {
    expect(itemPreCierreVisible({ count: 3 })).toBe(true);
    expect(itemPreCierreVisible({ count: 0 })).toBe(false);
    expect(itemPreCierreVisible({ count: 0, lectura_fallida: false })).toBe(false);
    expect(itemPreCierreVisible({ count: 0, lectura_fallida: null })).toBe(false);
  });

  it("lectura FALLIDA con count 0 se pinta igual (jamás «en orden» sin verificar)", () => {
    expect(itemPreCierreVisible({ count: 0, lectura_fallida: true })).toBe(true);
  });
});

describe("textoConteoPreCierre", () => {
  it("el número del API o «sin verificar»", () => {
    expect(textoConteoPreCierre({ count: 2 })).toBe("2");
    expect(textoConteoPreCierre({ count: 0, lectura_fallida: true })).toBe("sin verificar");
  });
});

describe("cableado de la card del pre-cierre", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../../components/admin/reportes/pre-cierre-card.tsx"),
    "utf8",
  );

  it("filtra con itemPreCierreVisible (no con count > 0 a secas) y pinta el conteo del helper", () => {
    expect(src).toContain("data.items.filter(itemPreCierreVisible)");
    expect(src).not.toMatch(/data\.items\.filter\(\(i\) => i\.count > 0\)/);
    // El conteo sale del helper (con la lectura fallida dice «sin verificar»)
    // en TODOS los renglones: el de los socios (cuenta corriente, 1-oct-2026)
    // ya cuenta SOCIOS, no necesita rótulo propio.
    expect(src).toContain("· {textoConteoPreCierre(item)}");
  });
});
