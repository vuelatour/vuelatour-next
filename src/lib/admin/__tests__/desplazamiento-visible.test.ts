import { describe, expect, it } from "vitest";
import { desplazamientoParaVer } from "../desplazamiento-visible";

/**
 * `desplazamientoParaVer` (13-oct-2026): el scroll JUSTO, en una dimensión,
 * para que un elemento quede a la vista en la banda útil del marco (lo que no
 * tapa nada fijo). Fuente única de las filas activas de las tablas y del
 * LibroExcel (por eje).
 */
describe("desplazamientoParaVer: la banda útil", () => {
  it("elemento completo dentro de la banda ⇒ null (no se toca el scroll)", () => {
    expect(desplazamientoParaVer({ inicio: 100, fin: 140, scroll: 0, alto: 300 })).toBeNull();
    // Con zona fija arriba (thead de 40): la banda útil arranca en 40.
    expect(
      desplazamientoParaVer({ inicio: 40, fin: 80, scroll: 0, alto: 300, fijoAntes: 40 }),
    ).toBeNull();
    // Bordes EXACTOS: fin == scroll + alto cuenta como visible.
    expect(desplazamientoParaVer({ inicio: 260, fin: 300, scroll: 0, alto: 300 })).toBeNull();
  });

  it("tapado por lo fijo al inicio ⇒ inicio − fijoAntes (pegado a lo fijo, no al borde del marco)", () => {
    // scroll 200, thead 40: la banda útil es [240, 500). Una fila en 220 está bajo el thead.
    expect(
      desplazamientoParaVer({ inicio: 220, fin: 260, scroll: 200, alto: 300, fijoAntes: 40 }),
    ).toBe(180);
    // Sin zona fija: queda pegada al borde (inicio).
    expect(desplazamientoParaVer({ inicio: 150, fin: 190, scroll: 200, alto: 300 })).toBe(150);
  });

  it("asomando al final ⇒ fin − alto (+ fijoDespues cuando hay)", () => {
    expect(desplazamientoParaVer({ inicio: 290, fin: 330, scroll: 0, alto: 300 })).toBe(30);
    expect(
      desplazamientoParaVer({ inicio: 290, fin: 330, scroll: 0, alto: 300, fijoDespues: 20 }),
    ).toBe(50);
  });

  it("con fijoDespues la banda se recorta por los dos lados", () => {
    // Banda útil = [scroll + 40, scroll + 300 − 20) = [40, 280) con scroll 0.
    const b = { scroll: 0, alto: 300, fijoAntes: 40, fijoDespues: 20 };
    expect(desplazamientoParaVer({ ...b, inicio: 40, fin: 280 })).toBeNull();
    expect(desplazamientoParaVer({ ...b, inicio: 30, fin: 70 })).toBe(0);
    expect(desplazamientoParaVer({ ...b, inicio: 250, fin: 290 })).toBe(10);
  });

  it("más grande que la banda ⇒ alineado al inicio (nunca al final)", () => {
    // Fila de 400 px en una banda de 260 (300 − 40): arranca en inicio − fijoAntes.
    expect(
      desplazamientoParaVer({ inicio: 500, fin: 900, scroll: 0, alto: 300, fijoAntes: 40 }),
    ).toBe(460);
    // Sin fijos: alineado a su inicio, no a 900 − 300.
    expect(desplazamientoParaVer({ inicio: 500, fin: 900, scroll: 0, alto: 300 })).toBe(500);
    // Exactamente del tamaño de la banda: también pegado al inicio.
    expect(
      desplazamientoParaVer({ inicio: 500, fin: 760, scroll: 0, alto: 300, fijoAntes: 40 }),
    ).toBe(460);
  });

  it("nunca negativo", () => {
    expect(
      desplazamientoParaVer({ inicio: 10, fin: 50, scroll: 500, alto: 300, fijoAntes: 40 }),
    ).toBe(0);
    expect(desplazamientoParaVer({ inicio: 0, fin: 20, scroll: 5000, alto: 300 })).toBe(0);
  });

  it("sin fijos (0 o ausentes) funciona como un scroll normal", () => {
    const sin = desplazamientoParaVer({ inicio: 320, fin: 360, scroll: 0, alto: 300 });
    const ceros = desplazamientoParaVer({
      inicio: 320,
      fin: 360,
      scroll: 0,
      alto: 300,
      fijoAntes: 0,
      fijoDespues: 0,
    });
    expect(sin).toBe(60);
    expect(ceros).toBe(60);
  });

  it("«lo justo»: el resultado deja el elemento exactamente al borde de la banda (estilo Excel)", () => {
    const b = { scroll: 1000, alto: 300, fijoAntes: 40, fijoDespues: 0 };
    // Por delante: tras aplicarlo, inicio == scroll' + fijoAntes.
    const antes = desplazamientoParaVer({ ...b, inicio: 700, fin: 740 });
    expect(antes).not.toBeNull();
    expect(700).toBe((antes as number) + 40);
    expect(desplazamientoParaVer({ ...b, scroll: antes as number, inicio: 700, fin: 740 })).toBeNull();
    // Por detrás: tras aplicarlo, fin == scroll' + alto.
    const despues = desplazamientoParaVer({ ...b, inicio: 1400, fin: 1440 });
    expect(despues).not.toBeNull();
    expect(1440).toBe((despues as number) + 300);
    expect(
      desplazamientoParaVer({ ...b, scroll: despues as number, inicio: 1400, fin: 1440 }),
    ).toBeNull();
  });

  it("banda degenerada (alto ≤ fijoAntes + fijoDespues) ⇒ max(0, inicio − fijoAntes), sin NaN", () => {
    expect(desplazamientoParaVer({ inicio: 100, fin: 140, scroll: 0, alto: 0 })).toBe(100);
    expect(
      desplazamientoParaVer({ inicio: 70, fin: 90, scroll: 50, alto: 10, fijoAntes: 20 }),
    ).toBe(50);
    expect(
      desplazamientoParaVer({ inicio: 5, fin: 25, scroll: 0, alto: 30, fijoAntes: 20, fijoDespues: 20 }),
    ).toBe(0);
    const r = desplazamientoParaVer({ inicio: 100, fin: 140, scroll: 0, alto: 0, fijoAntes: 0 });
    expect(Number.isNaN(r)).toBe(false);
  });
});
