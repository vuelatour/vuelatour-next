import { describe, expect, it } from "vitest";
import {
  APODO_API_VIEJO,
  APODO_HINT,
  APODO_MAX,
  apodoParaPayload,
  esRechazoPorApodo,
  normalizarApodo,
} from "@/lib/admin/usuario-apodo";

/**
 * Apodo del piloto = primera pieza del título del evento de Google
 * (`Saab N4142R cun-mid-cun 10:00`). Lo que se prueba: la normalización no
 * deja espacios que rompan el título, el delta manda la llave SOLO si cambió
 * (y `null` al vaciarla, que es lo único que sobrevive al `stripEmpty` de las
 * actions) y el 400 de un API sin el campo se distingue de un 400 real.
 */
describe("usuario-apodo", () => {
  it("normaliza: recorta y colapsa espacios", () => {
    expect(normalizarApodo("  Saab ")).toBe("Saab");
    expect(normalizarApodo("Jose   Luis")).toBe("Jose Luis");
    expect(normalizarApodo(null)).toBe("");
    expect(normalizarApodo(undefined)).toBe("");
  });

  it("sin cambio ⇒ la llave no viaja", () => {
    expect(apodoParaPayload("Saab", "Saab")).toEqual({ cambio: false, valor: "Saab" });
    // Solo espacios de más: sigue siendo el mismo apodo.
    expect(apodoParaPayload("Zamora", " Zamora ").cambio).toBe(false);
    // Nunca capturado y se deja vacío: tampoco viaja.
    expect(apodoParaPayload(null, "")).toEqual({ cambio: false, valor: null });
  });

  it("capturar, cambiar y BORRAR el apodo sí viajan (borrar = null explícito)", () => {
    expect(apodoParaPayload(null, "Pab")).toEqual({ cambio: true, valor: "Pab" });
    expect(apodoParaPayload("Pab", "Zamora")).toEqual({ cambio: true, valor: "Zamora" });
    expect(apodoParaPayload("Saab", "")).toEqual({ cambio: true, valor: null });
    expect(apodoParaPayload("Saab", "   ")).toEqual({ cambio: true, valor: null });
  });

  it("distingue el API viejo de un error real de validación", () => {
    expect(esRechazoPorApodo("property apodo should not exist")).toBe(true);
    expect(
      esRechazoPorApodo("apodo must be shorter than or equal to 20 characters"),
    ).toBe(false);
    expect(esRechazoPorApodo("property telefono should not exist")).toBe(false);
    expect(esRechazoPorApodo(undefined)).toBe(false);
    expect(APODO_API_VIEJO).toMatch(/nombre corto/i);
  });

  it("el tope y el ejemplo de ayuda son los del contrato con el API", () => {
    expect(APODO_MAX).toBe(20);
    expect(APODO_HINT).toContain("Saab N4142R cun-mid-cun 10:00");
  });
});
