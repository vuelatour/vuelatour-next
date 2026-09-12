import { describe, expect, it } from "vitest";
import {
  MARCA_EN_TALLER,
  avisoAeronaveEnTaller,
  chipAeronaveEnTaller,
  descripcionAeronave,
  notaAeronaveEnTaller,
} from "@/lib/admin/aviso-taller";

/**
 * Taller = ADVERTENCIA, nunca candado (pedido del cliente 11-sep-2026).
 * Lo que se prueba: el texto es el del CONTRATO entre repos (API ⇄ panel ⇄
 * app), la nota previa dice lo mismo sin mentir («se guardó» antes de
 * guardar) y NINGUNA variante contiene «no se puede» / «no disponible».
 */
describe("aviso-taller", () => {
  it("el aviso guardado es el texto exacto del contrato", () => {
    expect(avisoAeronaveEnTaller("XA-VGV")).toBe(
      "XA-VGV está en taller (mantenimiento en curso). Se guardó de todas formas: confirma con el mecánico que estará listo para el vuelo.",
    );
  });

  it("la nota al ELEGIR el avión dice lo mismo, sin afirmar que ya se guardó", () => {
    const nota = notaAeronaveEnTaller("N990GG");
    expect(nota).toBe(
      "N990GG está en taller (mantenimiento en curso). Puedes usarlo de todas formas: confirma con el mecánico que estará listo para el vuelo.",
    );
    expect(nota).not.toMatch(/se guardó/i);
  });

  it("ningún texto del módulo limita al operador", () => {
    for (const t of [
      avisoAeronaveEnTaller("XA-VGV"),
      notaAeronaveEnTaller("XA-VGV"),
      chipAeronaveEnTaller("XA-VGV"),
      MARCA_EN_TALLER,
    ]) {
      expect(t).not.toMatch(/no se puede|no disponible|elige otro avión/i);
    }
  });

  it("el chip corto solo señala, no explica", () => {
    expect(chipAeronaveEnTaller("XA-VGV")).toBe("XA-VGV está en taller");
  });
});

describe("descripcionAeronave", () => {
  it("antepone la marca «En taller» sin quitar lo que ya decía la opción", () => {
    expect(descripcionAeronave(["6 asientos", "180 kts"], true)).toBe(
      "En taller · 6 asientos · 180 kts",
    );
  });

  it("sin taller conserva la descripción tal cual y descarta huecos", () => {
    expect(descripcionAeronave(["6 asientos", null, false, "sin tarifa configurada"], false)).toBe(
      "6 asientos · sin tarifa configurada",
    );
  });

  it("sin partes ni taller no inventa descripción", () => {
    expect(descripcionAeronave([], false)).toBeUndefined();
    expect(descripcionAeronave([null, undefined])).toBeUndefined();
  });

  it("con taller y sin partes la marca sola basta", () => {
    expect(descripcionAeronave([], true)).toBe("En taller");
  });
});
