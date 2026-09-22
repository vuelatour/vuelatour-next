/**
 * Semáforo del calendario (22-sep-2026): CINCO colores, en el orden y con los
 * textos que pidió el cliente, y los hex EXACTOS del API
 * (`colores-calendario.util.ts`). Este test congela la leyenda: si el API
 * cambia un hex y aquí no, la leyenda mentiría sobre lo que se ve en pantalla.
 */
import { describe, expect, it } from "vitest";
import {
  AYUDA_COLOR_AVION,
  COLOR_SEMAFORO,
  ETIQUETA_COLOR_AVION,
  HINT_COLOR_AVION,
  NOTA_COLOR_AVION,
  SEMAFORO_CALENDARIO,
  tituloColorAvion,
} from "../calendario-semaforo";

/** Hex del API, copiados del contrato del 22-sep-2026. */
const HEX_API = {
  tentativo: "#64748B",
  confirmado: "#22C55E",
  pendiente: "#F59E0B",
  cancelado: "#EF4444",
  descanso: "#3B82F6",
};

/** Paleta VIEJA: ninguno de estos tonos vuelve a aparecer en la leyenda. */
const HEX_RETIRADOS = ["#8B5CF6", "#F0DCDB", "#14B8A6", "#0EA5E9", "#9CA3AF"];

describe("semáforo del calendario", () => {
  it("son cinco renglones, en el orden pedido y con los textos del cliente", () => {
    expect(SEMAFORO_CALENDARIO.map((i) => i.etiqueta)).toEqual([
      "Tentativo",
      "Confirmado",
      "Permiso o asunto pendiente",
      "Cancelado",
      "Descanso 💤",
    ]);
    expect(SEMAFORO_CALENDARIO.map((i) => i.clave)).toEqual([
      "tentativo",
      "confirmado",
      "pendiente",
      "cancelado",
      "descanso",
    ]);
  });

  it("cada renglón lleva el hex del API", () => {
    expect(SEMAFORO_CALENDARIO.map((i) => i.color)).toEqual([
      HEX_API.tentativo,
      HEX_API.confirmado,
      HEX_API.pendiente,
      HEX_API.cancelado,
      HEX_API.descanso,
    ]);
    expect(COLOR_SEMAFORO).toEqual(HEX_API);
  });

  it("los cinco colores son distintos entre sí (un color = un significado)", () => {
    const hex = SEMAFORO_CALENDARIO.map((i) => i.color.toUpperCase());
    expect(new Set(hex).size).toBe(5);
  });

  it("no queda rastro de la paleta vieja", () => {
    const todo = JSON.stringify(SEMAFORO_CALENDARIO).toUpperCase();
    for (const viejo of HEX_RETIRADOS) expect(todo).not.toContain(viejo);
    // Los renglones VIEJOS ya no son renglones. («sin asignar» sigue
    // apareciendo dentro del tooltip del ámbar, que es justo donde quedó:
    // es un asunto pendiente, no un color propio.)
    const etiquetas = SEMAFORO_CALENDARIO.map((i) => i.etiqueta);
    for (const viejo of [
      "Vuelo propio",
      "Evento (no vuelo)",
      "Sin asignar",
      "Externo",
      "Descanso",
      "Permiso pendiente",
    ]) {
      expect(etiquetas).not.toContain(viejo);
    }
  });

  it("cada renglón explica qué significa y qué hacer (tooltip)", () => {
    for (const i of SEMAFORO_CALENDARIO) {
      expect(i.titulo.length).toBeGreaterThan(30);
      expect(i.titulo).not.toBe(i.etiqueta);
    }
  });
});

describe("el color del avión vive ahora en los Excel", () => {
  it("la nota de la leyenda lo dice sin rodeos", () => {
    expect(NOTA_COLOR_AVION).toContain("ya no se usa en el calendario");
    expect(NOTA_COLOR_AVION).toContain("Excel");
    expect(NOTA_COLOR_AVION).toContain("balance individual y general");
  });

  it("la etiqueta del campo nombra al Excel, no al calendario", () => {
    expect(ETIQUETA_COLOR_AVION).toBe("Color en los reportes de Excel");
    expect(ETIQUETA_COLOR_AVION.toLowerCase()).not.toContain("calendario");
    expect(HINT_COLOR_AVION).toContain("#RRGGBB");
    expect(AYUDA_COLOR_AVION).toContain("calendario");
  });

  it("el tooltip del punto de la lista de aeronaves lleva el hex", () => {
    expect(tituloColorAvion("#F97316")).toBe(
      "Color en los reportes de Excel: #F97316",
    );
  });
});
