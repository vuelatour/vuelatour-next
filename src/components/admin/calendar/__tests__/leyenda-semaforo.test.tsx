/**
 * CABLEADO de la leyenda del calendario (22-sep-2026): que la pantalla pinte
 * los cinco renglones del semáforo con sus hex, la nota del color del avión y
 * nada de la paleta vieja. Los textos se prueban en
 * `lib/admin/__tests__/calendario-semaforo.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeyendaSemaforo } from "../leyenda-semaforo";

const html = renderToStaticMarkup(<LeyendaSemaforo />);

describe("LeyendaSemaforo", () => {
  it("pinta los cinco renglones con su color", () => {
    for (const [etiqueta, hex] of [
      ["Tentativo", "#64748B"],
      ["Confirmado", "#22C55E"],
      ["Permiso o asunto pendiente", "#F59E0B"],
      ["Cancelado", "#EF4444"],
      ["Descanso 💤", "#3B82F6"],
    ]) {
      expect(html).toContain(etiqueta);
      // React serializa el `style` en minúsculas: se compara sin distinguir.
      expect(html.toLowerCase()).toContain(hex.toLowerCase());
    }
  });

  it("dice dónde quedó el color de cada avión", () => {
    expect(html).toContain("ya no se usa en el calendario");
    expect(html).toContain("balance individual y general");
  });

  it("no queda rastro de la leyenda vieja", () => {
    for (const viejo of [
      "Vuelo propio",
      "Evento (no vuelo)",
      "Sin asignar",
      "Externo",
      "Permiso pendiente<",
    ]) {
      expect(html).not.toContain(viejo);
    }
    for (const hex of ["8b5cf6", "f0dcdb", "14b8a6", "0ea5e9", "9ca3af"]) {
      expect(html.toLowerCase()).not.toContain(hex);
    }
  });

  it("admite notas que no hablan de color (aviso push)", () => {
    const conNota = renderToStaticMarkup(
      <LeyendaSemaforo>
        <span>Al agendar un evento se avisa por push al responsable</span>
      </LeyendaSemaforo>,
    );
    expect(conNota).toContain("se avisa por push al responsable");
  });
});
