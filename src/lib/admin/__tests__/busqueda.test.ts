import { describe, expect, it } from "vitest";
import {
  coincideBusqueda,
  distanciaEdicion,
  filtrarPorBusqueda,
  normalizarTexto,
  puntuacionBusqueda,
  tokensDe,
} from "../busqueda";

describe("busqueda — normalización", () => {
  it("quita acentos, mayúsculas, signos y limpia números como los escribe la oficina", () => {
    expect(normalizarTexto("  Aeropuerto de Cancún · $2,801.40  ")).toBe("aeropuerto de cancun 2801.40");
    expect(normalizarTexto("Pago VIP SAESA (vuelo #315)")).toBe("pago vip saesa vuelo #315");
    expect(normalizarTexto(null)).toBe("");
    // Una coma decimal europea NO se toca (no es separador de miles).
    expect(normalizarTexto("1,5 L")).toBe("1,5 l");
  });

  it("tokensDe: palabras distintas, sin vacíos", () => {
    expect(tokensDe("  Cancún   aeropuerto  cancun ")).toEqual(["cancun", "aeropuerto"]);
    expect(tokensDe("")).toEqual([]);
  });
});

describe("busqueda — coincidencia", () => {
  it("es insensible a acentos y mayúsculas y busca por palabras en cualquier orden (todas deben estar)", () => {
    expect(coincideBusqueda("Aeropuerto Internacional de Cancún", "cancun aeropuerto")).toBe(true);
    expect(coincideBusqueda("Aeropuerto Internacional de Cancún", "cancun merida")).toBe(false);
    expect(coincideBusqueda("ASUR MERIDA", "mérida")).toBe(true);
  });

  it("tolera un error de dedo en palabras de 5+ letras, nunca en cortas", () => {
    expect(coincideBusqueda("Aeropuerto de Cancún", "cancum")).toBe(true); // letra cambiada
    expect(coincideBusqueda("Aeropuerto de Cancún", "canucn")).toBe(true); // dos invertidas
    expect(coincideBusqueda("Aeropuerto de Cancún", "cancn")).toBe(true); // una de menos
    expect(coincideBusqueda("Aeropuerto de Cancún", "cancunn")).toBe(true); // una de más
    expect(coincideBusqueda("Aeropuerto de Cancún", "cnacnu")).toBe(false); // dos errores
    expect(coincideBusqueda("ASUR", "asru")).toBe(false); // palabra corta: exacta o nada
    expect(coincideBusqueda("Taxi Cancún", "tax")).toBe(true); // prefijo
  });

  it("entiende montos con miles y signo de pesos", () => {
    expect(coincideBusqueda("Pago VIP SAESA · $2,801.40", "2801.40")).toBe(true);
    expect(coincideBusqueda("Pago VIP SAESA · $2,801.40", "$2,801.40")).toBe(true);
    expect(coincideBusqueda("Pago VIP SAESA · $2,801.40", "2801")).toBe(true);
    expect(coincideBusqueda("Pago VIP SAESA · $2,801.40", "2802")).toBe(false);
  });

  it("la consulta vacía coincide con todo; un texto vacío con nada", () => {
    expect(coincideBusqueda("lo que sea", "")).toBe(true);
    expect(coincideBusqueda("", "algo")).toBe(false);
    expect(puntuacionBusqueda("lo que sea", "   ")).toBe(0);
  });

  it("puntúa mejor la palabra exacta que el prefijo, el prefijo que el pedazo y el pedazo que el parecido", () => {
    expect(puntuacionBusqueda("Cancún", "cancun")).toBe(3);
    expect(puntuacionBusqueda("Cancunense", "cancun")).toBe(2);
    expect(puntuacionBusqueda("xcancun", "cancun")).toBe(1);
    expect(puntuacionBusqueda("Cancum", "cancun")).toBe(0.5);
  });

  it("distanciaEdicion con tope", () => {
    expect(distanciaEdicion("abc", "abc")).toBe(0);
    expect(distanciaEdicion("abc", "acb")).toBe(1);
    expect(distanciaEdicion("abc", "abcd")).toBe(1);
    expect(distanciaEdicion("abc", "xyz", 1)).toBe(2);
    expect(distanciaEdicion("abc", "abcde", 1)).toBe(2);
  });
});

describe("filtrarPorBusqueda", () => {
  const items = [
    { n: "Aeropuerto de Cozumel" },
    { n: "Aeropuerto de Cancún" },
    { n: "Taxi Cancun" },
    { n: "Cancun" },
  ];
  it("filtra, ordena por relevancia y conserva el orden original en empates", () => {
    expect(filtrarPorBusqueda(items, "cancun", (x) => x.n).map((x) => x.n)).toEqual([
      "Aeropuerto de Cancún",
      "Taxi Cancun",
      "Cancun",
    ]);
    expect(filtrarPorBusqueda(items, "aeropuerto", (x) => x.n).map((x) => x.n)).toEqual([
      "Aeropuerto de Cozumel",
      "Aeropuerto de Cancún",
    ]);
    expect(filtrarPorBusqueda(items, "", (x) => x.n)).toEqual(items);
  });
});
