/**
 * Fechas capturadas en DD/MM/AAAA (6-nov-2026): la máscara y las conversiones
 * puras que usa `components/ui/input.tsx` para `type="date"` y
 * `type="datetime-local"`. El valor que viaja sigue siendo el ISO de siempre.
 */
import { describe, expect, it } from "vitest";
import {
  LARGO_FECHA,
  LARGO_FECHA_HORA,
  PLACEHOLDER_FECHA,
  PLACEHOLDER_FECHA_HORA,
  fechaValida,
  isoDeTexto,
  largoFecha,
  mascaraFecha,
  placeholderFecha,
  textoDeIso,
} from "../fecha-input";

describe("mascaraFecha — solo dígitos, separadores solos", () => {
  it("fecha: va poniendo las diagonales y corta en 8 dígitos", () => {
    expect(mascaraFecha("")).toBe("");
    expect(mascaraFecha("0")).toBe("0");
    expect(mascaraFecha("06")).toBe("06");
    expect(mascaraFecha("061")).toBe("06/1");
    expect(mascaraFecha("0611")).toBe("06/11");
    expect(mascaraFecha("06112")).toBe("06/11/2");
    expect(mascaraFecha("06112026")).toBe("06/11/2026");
    expect(mascaraFecha("061120269")).toBe("06/11/2026");
    // Pegado con separadores propios o espacios: se normaliza.
    expect(mascaraFecha("6/11/2026")).toBe("61/12/026");
    expect(mascaraFecha("06-11-2026")).toBe("06/11/2026");
    expect(mascaraFecha(" 06 11 2026 ")).toBe("06/11/2026");
  });

  it("fecha y hora: espacio y dos puntos; corta en 12 dígitos", () => {
    expect(mascaraFecha("061120261", "datetime-local")).toBe("06/11/2026 1");
    expect(mascaraFecha("06112026143", "datetime-local")).toBe("06/11/2026 14:3");
    expect(mascaraFecha("061120261430", "datetime-local")).toBe("06/11/2026 14:30");
    expect(mascaraFecha("0611202614305", "datetime-local")).toBe("06/11/2026 14:30");
  });

  it("placeholders y largos por tipo", () => {
    expect(placeholderFecha("date")).toBe(PLACEHOLDER_FECHA);
    expect(placeholderFecha("datetime-local")).toBe(PLACEHOLDER_FECHA_HORA);
    expect(PLACEHOLDER_FECHA).toBe("DD/MM/AAAA");
    expect(PLACEHOLDER_FECHA_HORA).toBe("DD/MM/AAAA HH:MM");
    expect(largoFecha("date")).toBe(LARGO_FECHA);
    expect(largoFecha("datetime-local")).toBe(LARGO_FECHA_HORA);
    expect(mascaraFecha("06112026")).toHaveLength(LARGO_FECHA);
    expect(mascaraFecha("061120261430", "datetime-local")).toHaveLength(LARGO_FECHA_HORA);
  });
});

describe("isoDeTexto — solo texto completo y válido", () => {
  it("fecha DD/MM/AAAA ⇒ YYYY-MM-DD; incompleta o inválida ⇒ null", () => {
    expect(isoDeTexto("06/11/2026")).toBe("2026-11-06");
    expect(isoDeTexto("31/12/2026")).toBe("2026-12-31");
    expect(isoDeTexto("29/02/2028")).toBe("2028-02-29");
    expect(isoDeTexto("06/11/202")).toBeNull();
    expect(isoDeTexto("06/11")).toBeNull();
    expect(isoDeTexto("")).toBeNull();
    expect(isoDeTexto("31/02/2026")).toBeNull();
    expect(isoDeTexto("29/02/2026")).toBeNull();
    expect(isoDeTexto("00/11/2026")).toBeNull();
    expect(isoDeTexto("06/13/2026")).toBeNull();
    // La captura MM/DD que confundía a la oficina NO se acepta al revés.
    expect(isoDeTexto("11/06/2026")).toBe("2026-06-11");
    expect(isoDeTexto("06/11/1850")).toBeNull();
  });

  it("fecha y hora ⇒ YYYY-MM-DDTHH:mm; hora fuera de rango ⇒ null", () => {
    expect(isoDeTexto("06/11/2026 14:30", "datetime-local")).toBe("2026-11-06T14:30");
    expect(isoDeTexto("06/11/2026 00:00", "datetime-local")).toBe("2026-11-06T00:00");
    expect(isoDeTexto("06/11/2026 24:00", "datetime-local")).toBeNull();
    expect(isoDeTexto("06/11/2026 14:60", "datetime-local")).toBeNull();
    expect(isoDeTexto("06/11/2026", "datetime-local")).toBeNull();
    expect(isoDeTexto("06/11/2026 14:3", "datetime-local")).toBeNull();
  });
});

describe("textoDeIso — lo que se enseña", () => {
  it("ISO ⇒ DD/MM/AAAA; vacío o ilegible ⇒ «»", () => {
    expect(textoDeIso("2026-11-06")).toBe("06/11/2026");
    expect(textoDeIso("2026-11-06T14:30")).toBe("06/11/2026");
    expect(textoDeIso("2026-11-06T14:30:00.000Z")).toBe("06/11/2026");
    expect(textoDeIso("")).toBe("");
    expect(textoDeIso(null)).toBe("");
    expect(textoDeIso(undefined)).toBe("");
    expect(textoDeIso("06/11/2026")).toBe("");
    expect(textoDeIso("hoy")).toBe("");
  });

  it("datetime-local: con hora la enseña; sin hora, solo el día", () => {
    expect(textoDeIso("2026-11-06T14:30", "datetime-local")).toBe("06/11/2026 14:30");
    expect(textoDeIso("2026-11-06T09:05", "datetime-local")).toBe("06/11/2026 09:05");
    expect(textoDeIso("2026-11-06", "datetime-local")).toBe("06/11/2026");
  });

  it("ida y vuelta: textoDeIso(isoDeTexto(t)) === t para textos completos", () => {
    for (const t of ["06/11/2026", "01/01/2026", "29/02/2028"]) {
      expect(textoDeIso(isoDeTexto(t) ?? "")).toBe(t);
    }
    for (const t of ["06/11/2026 14:30", "31/12/2026 23:59"]) {
      expect(textoDeIso(isoDeTexto(t, "datetime-local") ?? "", "datetime-local")).toBe(t);
    }
  });

  it("fechaValida: calendario real", () => {
    expect(fechaValida(2026, 11, 6)).toBe(true);
    expect(fechaValida(2026, 2, 29)).toBe(false);
    expect(fechaValida(2028, 2, 29)).toBe(true);
    expect(fechaValida(2026, 4, 31)).toBe(false);
    expect(fechaValida(2101, 1, 1)).toBe(false);
    expect(fechaValida(2026.5, 1, 1)).toBe(false);
  });
});
