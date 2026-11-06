/**
 * Fechas en DD/MM/AAAA en todo el panel (6-nov-2026). Pedido del dueño:
 * «estandarizar todas las fechas al formato DD/MM/AAAA, en todos lados».
 * `lib/datetime.ts` es la fuente única de los textos de fecha: aquí se
 * congela el formato (y que el día siga siendo el de Cancún, UTC−5).
 */
import { describe, expect, it } from "vitest";
import {
  fmtDate,
  fmtDateOnly,
  fmtDateTime,
  fmtDateTimeShort,
  fmtTime,
  fmtWeekdayDateTime,
} from "../datetime";

describe("DD/MM/AAAA en Cancún", () => {
  it("fmtDateOnly: columna date sin corrimiento de día", () => {
    expect(fmtDateOnly("2026-11-06")).toBe("06/11/2026");
    expect(fmtDateOnly("2026-01-01")).toBe("01/01/2026");
    expect(fmtDateOnly("2026-11-06T23:30:00.000Z")).toBe("06/11/2026");
    expect(fmtDateOnly(null)).toBe("—");
    expect(fmtDateOnly("")).toBe("—");
    // Ilegible: se devuelve tal cual (como siempre), nunca «Invalid Date».
    expect(fmtDateOnly("ayer")).toBe("ayer");
  });

  it("fmtDate: el día calendario en Cancún (UTC−5), no el UTC", () => {
    // 01:30 UTC del 7 de noviembre = 20:30 del 6 en Cancún.
    expect(fmtDate("2026-11-07T01:30:00.000Z")).toBe("06/11/2026");
    expect(fmtDate("2026-11-06T15:40:00Z")).toBe("06/11/2026");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("nada")).toBe("—");
  });

  it("fmtDateTime: DD/MM/AAAA y la hora de 12 h de siempre", () => {
    expect(fmtDateTime("2026-10-15T15:40:00Z")).toMatch(/^15\/10\/2026, 10:40 a\.\s?m\.$/);
    expect(fmtDateTime("2026-09-12T20:00:00Z")).toMatch(/^12\/09\/2026, 3:00 p\.\s?m\.$/);
    expect(fmtDateTime(undefined)).toBe("—");
  });

  it("fmtDateTimeShort: ahora con el año (antes solo día y mes)", () => {
    expect(fmtDateTimeShort("2026-10-15T15:40:00Z")).toMatch(/^15\/10\/2026, 10:40 a\.\s?m\.$/);
    expect(fmtDateTimeShort("2026-09-12T20:00:00Z")).toMatch(/^12\/09\/2026, 03:00 p\.\s?m\.$/);
    expect(fmtDateTimeShort(null)).toBe("—");
  });

  it("fmtWeekdayDateTime: día de la semana + DD/MM/AAAA + hora", () => {
    // 2026-09-03 es jueves.
    expect(fmtWeekdayDateTime("2026-09-03T14:45:00Z")).toMatch(/^jue 03\/09\/2026, 09:45 a\.\s?m\.$/);
    expect(fmtWeekdayDateTime(null)).toBe("—");
  });

  it("fmtTime no cambia", () => {
    expect(fmtTime("2026-10-15T15:40:00Z")).toMatch(/^10:40 a\.\s?m\.$/);
  });
});
