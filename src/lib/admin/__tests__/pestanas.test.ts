/**
 * Pestañas (23-oct-2026): las reglas PURAS de `lib/admin/pestanas.ts` que usa
 * `components/admin/pestanas.tsx` — qué pestaña abre, el teclado (← → Inicio
 * Fin con vuelta y activación automática) y el rótulo con conteo.
 */
import { describe, expect, it } from "vitest";
import { pestanaInicial, siguientePestana, textoPestana } from "../pestanas";

const P = [{ clave: "gastos" }, { clave: "vuelos" }, { clave: "socios" }];
const CLAVES = P.map((p) => p.clave);

describe("pestañas (reglas puras)", () => {
  it("la inicial: la pedida si existe; si no (basura, vacío, null), la primera; sin pestañas, null", () => {
    expect(pestanaInicial(P, "socios")).toBe("socios");
    expect(pestanaInicial(P, "gastos")).toBe("gastos");
    expect(pestanaInicial(P, "nada")).toBe("gastos");
    expect(pestanaInicial(P, "")).toBe("gastos");
    expect(pestanaInicial(P, null)).toBe("gastos");
    expect(pestanaInicial(P, undefined)).toBe("gastos");
    expect(pestanaInicial([], "gastos")).toBeNull();
  });

  it("teclado: → y ← con vuelta, Inicio y Fin; otra tecla o lista vacía ⇒ null; una actual desconocida parte de la primera", () => {
    expect(siguientePestana(CLAVES, "gastos", "ArrowRight")).toBe("vuelos");
    expect(siguientePestana(CLAVES, "socios", "ArrowRight")).toBe("gastos");
    expect(siguientePestana(CLAVES, "gastos", "ArrowLeft")).toBe("socios");
    expect(siguientePestana(CLAVES, "vuelos", "ArrowLeft")).toBe("gastos");
    expect(siguientePestana(CLAVES, "socios", "Home")).toBe("gastos");
    expect(siguientePestana(CLAVES, "gastos", "End")).toBe("socios");
    expect(siguientePestana(CLAVES, "gastos", "Enter")).toBeNull();
    expect(siguientePestana(CLAVES, "gastos", "ArrowDown")).toBeNull();
    expect(siguientePestana([], "gastos", "ArrowRight")).toBeNull();
    expect(siguientePestana(CLAVES, "zzz", "ArrowRight")).toBe("vuelos");
  });

  it("rótulo: el conteo entre paréntesis (el 0 también); sin conteo, solo la etiqueta", () => {
    expect(textoPestana({ etiqueta: "Gastos del periodo", conteo: 64 })).toBe("Gastos del periodo (64)");
    expect(textoPestana({ etiqueta: "Entregas", conteo: 0 })).toBe("Entregas (0)");
    expect(textoPestana({ etiqueta: "Socios" })).toBe("Socios");
    expect(textoPestana({ etiqueta: "Socios", conteo: null })).toBe("Socios");
  });
});
