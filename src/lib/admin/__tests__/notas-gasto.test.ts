/**
 * Notas del GASTO: qué ⚠ es una discrepancia (revisión 6-oct-2026).
 *
 * Caso real: el estacionamiento del 28-sep (EFECTIVO, vuelo #330) se liga al
 * cargo de $212.00 del 07-sep con una justificación y el API le anota «⚠
 * Conciliado con el cargo bancario del …». «Verificar / editar» trataba
 * cualquier ⚠ como discrepancia de la IA y pintaba «La IA detectó
 * discrepancias… corrige monto, fecha y moneda». Esa línea es la constancia
 * de la liga, no una discrepancia.
 */
import { describe, expect, it } from "vitest";
import { tieneDiscrepanciaIa } from "@/lib/admin/notas-gasto";

/** La línea EXACTA que escribe el API (`lineaNotaGasto`) en el caso real. */
const VINCULO =
  "⚠ Conciliado con el cargo bancario del 07-sep-2026 ($212.00 · ASUR CANCUN) sin cambiar el medio de pago (EFECTIVO): Nadie capturó el estacionamiento del 7 de septiembre; se usa el ticket facturado del 28 — Itzi, 06-oct-2026";

/** Discrepancias reales que escribe el API («⚠ … — revisar»). */
const IA = "⚠ el ticket dice $250.00 y se capturó $212.00 — revisar";
const COMBUSTIBLE = "⚠ se capturó Turbosina pero el XB-PEV carga Gasavión: se corrigió a Gasavión — revisar";

describe("tieneDiscrepanciaIa", () => {
  it("la línea del vínculo no bancario NO es discrepancia (sola, con notas del piloto o con blancos)", () => {
    expect(tieneDiscrepanciaIa(VINCULO)).toBe(false);
    expect(tieneDiscrepanciaIa(`Estacionamiento ASUR\n\n${VINCULO}`)).toBe(false);
    expect(tieneDiscrepanciaIa(`Estacionamiento ASUR\r\n\r\n  ${VINCULO}  `)).toBe(false);
    // Dos cargos ligados al mismo gasto: dos líneas, ninguna discrepancia.
    expect(tieneDiscrepanciaIa(`${VINCULO}\n${VINCULO.replace("07-sep-2026", "08-sep-2026")}`)).toBe(false);
    // Aunque la razón tecleada traiga un ⚠: la línea entera es del vínculo.
    expect(tieneDiscrepanciaIa(VINCULO.replace("Nadie capturó", "⚠ Nadie capturó"))).toBe(false);
  });

  it("una discrepancia de verdad sí cuenta, también junto a la línea del vínculo", () => {
    expect(tieneDiscrepanciaIa(IA)).toBe(true);
    expect(tieneDiscrepanciaIa(COMBUSTIBLE)).toBe(true);
    expect(tieneDiscrepanciaIa(`Estacionamiento ASUR\n${IA}\n\n${VINCULO}`)).toBe(true);
    expect(tieneDiscrepanciaIa(`${VINCULO}\n${IA}`)).toBe(true);
    // Un ⚠ a media línea (lo de siempre: cualquier ⚠ fuera del vínculo cuenta).
    expect(tieneDiscrepanciaIa("Pagó el piloto ⚠ sin ticket")).toBe(true);
  });

  it("sin ⚠ o sin notas: nada", () => {
    expect(tieneDiscrepanciaIa("Estacionamiento ASUR")).toBe(false);
    expect(tieneDiscrepanciaIa("")).toBe(false);
    expect(tieneDiscrepanciaIa(null)).toBe(false);
    expect(tieneDiscrepanciaIa(undefined)).toBe(false);
  });
});
