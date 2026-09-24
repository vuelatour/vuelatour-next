/**
 * CABLEADO de la leyenda del calendario (24-sep-2026): que la pantalla pinte
 * los SEIS renglones del semáforo con sus hex y su tooltip, en el orden del
 * cliente, la nota del color del avión y nada de la paleta vieja. Los textos
 * se prueban en `lib/admin/__tests__/calendario-semaforo.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeyendaSemaforo } from "../leyenda-semaforo";

const html = renderToStaticMarkup(<LeyendaSemaforo />);

/** Hex del API (contrato del 24-sep-2026), en el orden de la listita. */
const RENGLONES: ReadonlyArray<[string, string]> = [
  ["Tentativo", "#64748B"],
  ["Pendiente (permiso)", "#F59E0B"],
  ["Confirmado", "#22C55E"],
  ["Pagado", "#3B82F6"],
  ["Cancelado", "#EF4444"],
  ["Descanso 💤", "#8B5CF6"],
];

describe("LeyendaSemaforo", () => {
  it("pinta los seis renglones con su color", () => {
    for (const [etiqueta, hex] of RENGLONES) {
      expect(html).toContain(etiqueta);
      // React serializa el `style` en minúsculas: se compara sin distinguir.
      expect(html.toLowerCase()).toContain(hex.toLowerCase());
    }
  });

  it("respeta el orden de la listita del cliente", () => {
    const posiciones = RENGLONES.map(([etiqueta]) => html.indexOf(`${etiqueta}</span>`));
    for (const p of posiciones) expect(p).toBeGreaterThan(-1);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it("cada color va pegado a SU texto (el morado es el descanso, el azul el pagado)", () => {
    const bajo = html.toLowerCase();
    for (const [etiqueta, hex] of RENGLONES) {
      const iHex = bajo.indexOf(hex.toLowerCase());
      const iTexto = html.indexOf(`${etiqueta}</span>`);
      // El cuadrito de color precede a su texto dentro del mismo renglón y
      // ningún otro renglón se mete entre ellos.
      expect(iHex).toBeLessThan(iTexto);
      const entre = html.slice(iHex, iTexto);
      for (const [otra] of RENGLONES) {
        if (otra !== etiqueta) expect(entre).not.toContain(`${otra}</span>`);
      }
    }
  });

  it("el tooltip de «Pendiente (permiso)» menciona el vuelo sin avión o sin piloto", () => {
    const i = html.indexOf("Pendiente (permiso)</span>");
    const renglon = html.slice(html.lastIndexOf("title=", i), i);
    // Redacción compartida con el API y la app (`AYUDA_PENDIENTE`).
    expect(renglon).toContain("Permiso de pista pendiente");
    expect(renglon).toContain("no tiene avión o piloto asignado");
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
      "Permiso o asunto pendiente<",
    ]) {
      expect(html).not.toContain(viejo);
    }
    for (const hex of ["f0dcdb", "14b8a6", "0ea5e9", "9ca3af"]) {
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
