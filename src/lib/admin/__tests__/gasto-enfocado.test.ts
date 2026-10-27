/**
 * `?gasto=` en Gastos (27-oct-2026). Pedido del cliente, con la captura de
 * Conciliación: «Cuando le pico a la conciliación no me manda al gasto
 * conciliado, solo me manda al apartado de gastos». La liga verde de la
 * columna «Conciliación» (refacción AIRCRAFT SPRUCE del 24-sep, $794.61 USD,
 * sin vuelo) iba a `/admin/expenses` a secas; ahora abre Gastos de ese día
 * con el gasto PRIMERO y en ámbar.
 */
import { describe, expect, it } from "vitest";
import { CLASE_FILA_ENFOCADA } from "../conciliacion-vista";
import {
  CLASE_FILA_GASTO_ENFOCADO,
  ETIQUETA_QUITAR_RESALTADO,
  PARAM_GASTO_ENFOCADO,
  RUTA_GASTOS,
  TEXTO_GASTO_ENFOCADO_EN_VISTA,
  TEXTO_GASTO_ENFOCADO_FUERA,
  TEXTO_GASTO_ENFOCADO_SIN_LISTA,
  TITULO_FRANJA_GASTO_ENFOCADO,
  diaDeGasto,
  hrefGastoEnfocado,
  hrefQuitarGastoEnfocado,
  leerGastoEnfocado,
  textoEstadoGastoEnfocado,
} from "../gasto-enfocado";

/** La refacción de la captura del cliente (24 sep 2026, $794.61 USD, sin vuelo). */
const G = "7f2c1b40-5a3e-4c8d-9e21-0a6b7c8d9e01";

describe("hrefGastoEnfocado — la liga «Ver el gasto con el que se concilió» sin vuelo", () => {
  it("caso del cliente: refacción del 24 sep sin vuelo ⇒ Gastos de ese día con ?gasto=", () => {
    expect(hrefGastoEnfocado({ id: G, fecha_gasto: "2026-09-24" })).toBe(
      `/admin/expenses?desde=2026-09-24&hasta=2026-09-24&gasto=${G}`,
    );
  });

  it("fecha ISO con hora: se recorta al día; el uuid viaja en minúsculas", () => {
    expect(hrefGastoEnfocado({ id: G.toUpperCase(), fecha_gasto: "2026-09-24T18:30:00Z" })).toBe(
      `/admin/expenses?desde=2026-09-24&hasta=2026-09-24&gasto=${G}`,
    );
  });

  it("sin fecha válida: solo ?gasto= (la lista completa, con el gasto arriba)", () => {
    expect(hrefGastoEnfocado({ id: G, fecha_gasto: null })).toBe(`/admin/expenses?gasto=${G}`);
    expect(hrefGastoEnfocado({ id: G, fecha_gasto: "2026-13-45" })).toBe(`/admin/expenses?gasto=${G}`);
    expect(hrefGastoEnfocado({ id: G })).toBe(`/admin/expenses?gasto=${G}`);
  });

  it("sin uuid: solo el día (nunca basura en la URL); sin nada, la lista a secas", () => {
    expect(hrefGastoEnfocado({ id: "g1", fecha_gasto: "2026-09-24" })).toBe(
      "/admin/expenses?desde=2026-09-24&hasta=2026-09-24",
    );
    expect(hrefGastoEnfocado({ id: "g1" })).toBe(RUTA_GASTOS);
    expect(hrefGastoEnfocado({})).toBe(RUTA_GASTOS);
    expect(hrefGastoEnfocado({ id: null, fecha_gasto: "" })).toBe(RUTA_GASTOS);
  });
});

describe("leerGastoEnfocado — lo que la página acepta de la URL", () => {
  it("uuid (baja a minúsculas); un arreglo toma el primero", () => {
    expect(leerGastoEnfocado({ gasto: G })).toBe(G);
    expect(leerGastoEnfocado({ gasto: G.toUpperCase() })).toBe(G);
    expect(leerGastoEnfocado({ gasto: [G, "otro"] })).toBe(G);
  });

  it("basura, vacío o ausente ⇒ null (jamás un 400 ni una fila resaltada por error)", () => {
    expect(leerGastoEnfocado({ gasto: "stock;drop" })).toBeNull();
    expect(leerGastoEnfocado({ gasto: "" })).toBeNull();
    expect(leerGastoEnfocado({ gasto: ["basura", G] })).toBeNull();
    expect(leerGastoEnfocado({})).toBeNull();
    expect(leerGastoEnfocado(null)).toBeNull();
    expect(leerGastoEnfocado(undefined)).toBeNull();
  });
});

describe("hrefQuitarGastoEnfocado — «Quitar resaltado»", () => {
  it("quita solo ?gasto= y conserva el resto (rango, pestaña, orden)", () => {
    expect(hrefQuitarGastoEnfocado({ desde: "2026-09-24", hasta: "2026-09-24", gasto: G, f: "pendientes" })).toBe(
      "/admin/expenses?desde=2026-09-24&hasta=2026-09-24&f=pendientes",
    );
  });

  it("sin más params queda la ruta a secas; los arreglos viajan completos; undefined se omite", () => {
    expect(hrefQuitarGastoEnfocado({ gasto: G })).toBe(RUTA_GASTOS);
    expect(hrefQuitarGastoEnfocado(null)).toBe(RUTA_GASTOS);
    expect(hrefQuitarGastoEnfocado({ gasto: G, categoria: ["FIJO", "GAS"], desde: undefined })).toBe(
      "/admin/expenses?categoria=FIJO&categoria=GAS",
    );
  });
});

describe("textos, marca y nombre del parámetro", () => {
  it("la MISMA marca ámbar de la fila enfocada de Conciliación y del pre-cierre", () => {
    expect(CLASE_FILA_GASTO_ENFOCADO).toBe(CLASE_FILA_ENFOCADA);
  });

  it("mismo nombre que ?gasto= de Conciliación y del balance", () => {
    expect(PARAM_GASTO_ENFOCADO).toBe("gasto");
    expect(RUTA_GASTOS).toBe("/admin/expenses");
  });

  it("la franja: en vista / fuera / lista caída (no se afirma nada)", () => {
    expect(TITULO_FRANJA_GASTO_ENFOCADO).toBe("Gasto que abriste desde Conciliación");
    expect(textoEstadoGastoEnfocado(true)).toBe(TEXTO_GASTO_ENFOCADO_EN_VISTA);
    expect(textoEstadoGastoEnfocado(false)).toBe(TEXTO_GASTO_ENFOCADO_FUERA);
    expect(textoEstadoGastoEnfocado(null)).toBe(TEXTO_GASTO_ENFOCADO_SIN_LISTA);
    expect(TEXTO_GASTO_ENFOCADO_FUERA).toContain("quita los filtros");
    expect(ETIQUETA_QUITAR_RESALTADO).toBe("Quitar resaltado");
  });

  it("diaDeGasto: día, ISO con hora, basura", () => {
    expect(diaDeGasto("2026-09-24")).toBe("2026-09-24");
    expect(diaDeGasto(" 2026-09-24T18:30:00Z ")).toBe("2026-09-24");
    expect(diaDeGasto("2026-13-45")).toBeNull();
    expect(diaDeGasto("")).toBeNull();
    expect(diaDeGasto(null)).toBeNull();
    expect(diaDeGasto(undefined)).toBeNull();
  });
});
