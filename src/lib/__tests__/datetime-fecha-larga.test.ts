/**
 * `fechaLargaDia` / `MESES_LARGOS_ES` (5-oct-2026): fuente única de la fecha
 * LARGA «7 de octubre de 2026» a partir de un día de pared Cancún.
 */
import { describe, expect, it } from "vitest";
import { fechaLargaDia, MESES_LARGOS_ES } from "../datetime";

describe("fechaLargaDia — «d de mes de aaaa» sin corrimiento de día", () => {
  it("día de pared ⇒ texto largo, sin cero a la izquierda", () => {
    expect(fechaLargaDia("2026-10-07")).toBe("7 de octubre de 2026");
    expect(fechaLargaDia("2026-01-01")).toBe("1 de enero de 2026");
    expect(fechaLargaDia("2026-12-31")).toBe("31 de diciembre de 2026");
    expect(fechaLargaDia(" 2026-09-15 ")).toBe("15 de septiembre de 2026");
  });

  it("vacío, ilegible o con hora ⇒ «—» (no adivina el día)", () => {
    expect(fechaLargaDia(null)).toBe("—");
    expect(fechaLargaDia(undefined)).toBe("—");
    expect(fechaLargaDia("")).toBe("—");
    expect(fechaLargaDia("2026-13-01")).toBe("—");
    expect(fechaLargaDia("2026-10-00")).toBe("—");
    expect(fechaLargaDia("2026-10-07T03:30:00Z")).toBe("—");
  });

  it("doce meses en minúsculas", () => {
    expect(MESES_LARGOS_ES).toHaveLength(12);
    expect(MESES_LARGOS_ES[8]).toBe("septiembre");
    for (const m of MESES_LARGOS_ES) expect(m).toBe(m.toLowerCase());
  });
});
