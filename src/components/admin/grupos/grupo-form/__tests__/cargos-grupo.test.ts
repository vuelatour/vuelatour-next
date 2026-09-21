import { describe, expect, it } from "vitest";
import { TEXTO_EXTRA_FUERA } from "@/lib/admin/extras";
import {
  TEXTO_CARGO_SIN_CANTIDAD,
  avisoCargosGrupo,
  cargoGrupoCompleto,
  extrasGrupoIncompletos,
  extrasPayload,
} from "../payload";
import type { ExtraGrupoForm } from "../types";

/**
 * CARGOS DEL GRUPO A MEDIAS (21-sep-2026). Espejo del arreglo de los extras de
 * una cotización: `extrasPayload` omite en silencio todo cargo incompleto, así
 * que al guardar el renglón desaparecía sin decir nada. Aquí se congela la
 * REGLA ÚNICA de la que cuelgan las tres cosas:
 *
 * - `extrasPayload`   — qué viaja al armador y al API;
 * - `cargoGrupoCompleto` — cómo numera el editor las filas del consolidado
 *   (si divergiera, cada fila enseñaría el monto de OTRA);
 * - `extrasGrupoIncompletos` — el candado de guardado.
 */

const cargo = (e: Partial<ExtraGrupoForm>): ExtraGrupoForm => ({
  uid: "u1",
  concepto: "",
  unitario: "",
  cantidad: "",
  moneda: "USD",
  aplica_iva: true,
  por_persona: true,
  reparto: "POR_PAX",
  ...e,
});

describe("cargoGrupoCompleto = exactamente lo que manda extrasPayload", () => {
  /** Regla que vivía COPIADA en `extras-grupo-editor.tsx` (`esCompleta`). */
  const reglaVieja = (e: ExtraGrupoForm) =>
    e.concepto.trim() !== "" &&
    e.unitario !== "" &&
    Number(e.unitario) >= 0 &&
    (e.por_persona || (e.cantidad !== "" && Number(e.cantidad) >= 0));

  it("producto cartesiano: misma respuesta que la regla vieja y que el filtro", () => {
    let casos = 0;
    let completos = 0;
    for (const concepto of ["", "  ", "Tour"])
      for (const unitario of ["", 0, -1, 85.5] as Array<number | "">)
        for (const cantidad of ["", 0, -2, 4] as Array<number | "">)
          for (const por_persona of [true, false]) {
            const e = cargo({ concepto, unitario, cantidad, por_persona });
            const completo = cargoGrupoCompleto(e);
            expect(completo, JSON.stringify(e)).toBe(reglaVieja(e));
            expect(extrasPayload([e]).length, JSON.stringify(e)).toBe(completo ? 1 : 0);
            casos += 1;
            completos += completo ? 1 : 0;
          }
    expect(casos).toBe(96);
    expect(completos).toBeGreaterThan(5);
  });
});

describe("extrasGrupoIncompletos (candado de guardado del grupo)", () => {
  it("un renglón EN BLANCO no molesta", () => {
    expect(extrasGrupoIncompletos([cargo({})])).toEqual([]);
    expect(extrasGrupoIncompletos([cargo({ por_persona: false })])).toEqual([]);
  });

  it("falta el nombre, el precio o la cantidad: cada uno con su texto y su índice", () => {
    const lista = [
      cargo({ concepto: "Tour", unitario: 85 }), // ok
      cargo({ concepto: "", unitario: 85 }), // sin nombre
      cargo({ concepto: "Guía", unitario: "" }), // sin precio
      cargo({ concepto: "Camionetas", unitario: 250, por_persona: false, cantidad: "" }), // sin cantidad
      cargo({}), // en blanco: no molesta
    ];
    expect(extrasGrupoIncompletos(lista)).toEqual([
      { indice: 1, concepto: "", motivo: TEXTO_EXTRA_FUERA.sin_nombre, falta: "nombre" },
      { indice: 2, concepto: "Guía", motivo: TEXTO_EXTRA_FUERA.sin_monto, falta: "monto" },
      { indice: 3, concepto: "Camionetas", motivo: TEXTO_CARGO_SIN_CANTIDAD, falta: "cantidad" },
    ]);
  });

  it("el aviso nombra el cargo y qué le falta (sin repetir el motivo largo)", () => {
    expect(avisoCargosGrupo([])).toBe("");
    expect(avisoCargosGrupo(extrasGrupoIncompletos([cargo({ concepto: "Guía", unitario: "" })]))).toBe(
      "El cargo «Guía» no entra al total: falta el monto. Complétalo o quítalo.",
    );
    // Sin nombre no hay cómo llamarlo: se usa su número de fila.
    expect(avisoCargosGrupo(extrasGrupoIncompletos([cargo({}), cargo({ unitario: 85 })]))).toBe(
      "El cargo 2 no entra al total: falta el nombre. Complétalo o quítalo.",
    );
    expect(
      avisoCargosGrupo(extrasGrupoIncompletos([cargo({ unitario: 85 }), cargo({ concepto: "Guía" })])),
    ).toBe("Hay 2 cargos que no entran al total: complétalos o quítalos.");
  });

  it("reutiliza los textos de la cotización, no los reinventa", () => {
    expect(TEXTO_EXTRA_FUERA.sin_nombre).toBe("Falta el nombre: no se suma ni se imprime");
    expect(TEXTO_CARGO_SIN_CANTIDAD).toBe("Falta la cantidad: no se suma ni se imprime");
  });

  it("payload + incompletos + blancos = la lista entera (nada se pierde en el aire)", () => {
    const lista = [
      cargo({ concepto: "Tour", unitario: 85 }),
      cargo({ concepto: "", unitario: 85 }),
      cargo({ concepto: "Guía", unitario: "" }),
      cargo({ concepto: "Camionetas", unitario: 250, por_persona: false, cantidad: 3 }),
      cargo({ concepto: "Handler", unitario: 40, por_persona: false, cantidad: "" }),
      cargo({}),
    ];
    const blancos = lista.filter(
      (e) => !e.concepto.trim() && e.unitario === "" && e.cantidad === "",
    ).length;
    expect(extrasPayload(lista).length + extrasGrupoIncompletos(lista).length + blancos).toBe(lista.length);
  });

  it("es PURA: no toca la lista que recibe", () => {
    const lista = [cargo({ concepto: "", unitario: 85 })];
    const copia = JSON.parse(JSON.stringify(lista));
    extrasGrupoIncompletos(lista);
    expect(lista).toEqual(copia);
  });
});
