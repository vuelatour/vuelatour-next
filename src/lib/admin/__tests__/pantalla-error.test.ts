import { describe, expect, it } from "vitest";
import {
  BOTON_INICIO,
  BOTON_REINTENTAR,
  MENSAJE_ERROR,
  SIN_CODIGO,
  TITULO_ERROR,
  codigoDeError,
  horaCancun,
  lineaParaSoporte,
  rutaActual,
} from "../pantalla-error";

/**
 * La pantalla que ve el operador cuando algo no cargó (21-sep-2026). El
 * reporte fue literal: «Algo se rompió — An error occurred in the Server
 * Components render… digest».
 */
describe("textos de la pantalla de error", () => {
  it("están en es-MX y dicen qué hacer", () => {
    expect(TITULO_ERROR).toBe("No pudimos cargar esta pantalla");
    expect(MENSAJE_ERROR).toContain("Suele ser momentáneo");
    expect(MENSAJE_ERROR).toContain("Reintentar");
    expect(MENSAJE_ERROR).toContain("manda este código a sistemas");
    expect(BOTON_REINTENTAR).toBe("Reintentar");
    expect(BOTON_INICIO).toBe("Volver al inicio");
  });

  it("NINGÚN texto es el de Next en inglés", () => {
    const todos = [TITULO_ERROR, MENSAJE_ERROR, BOTON_REINTENTAR, BOTON_INICIO].join(" ");
    expect(todos).not.toMatch(/An error occurred|Server Components render|Try again/i);
    expect(todos).not.toMatch(/Algo se rompió/);
  });
});

describe("datos para soporte", () => {
  it("el código es el digest de Next (lo único que sale en sus logs)", () => {
    expect(codigoDeError({ digest: "1234567890" })).toBe("1234567890");
    expect(codigoDeError({ digest: "  abc  " })).toBe("abc");
  });

  it("sin digest lo dice, no inventa un código", () => {
    expect(codigoDeError({})).toBe(SIN_CODIGO);
    expect(codigoDeError(null)).toBe(SIN_CODIGO);
    expect(codigoDeError(undefined)).toBe(SIN_CODIGO);
  });

  it("la hora es de CANCÚN, no la del navegador ni UTC", () => {
    // 21-sep-2026 15:14 UTC = 10:14 en Cancún (UTC−5, sin horario de verano).
    const texto = horaCancun(new Date("2026-09-21T15:14:00.000Z"));
    expect(texto).toContain("21/09/2026");
    expect(texto).toContain("10:14");
  });

  it("la ruta incluye los filtros (a menudo el parámetro inválido ES la causa)", () => {
    expect(rutaActual({ pathname: "/admin/flights", search: "?estado=VOLANDO" })).toBe(
      "/admin/flights?estado=VOLANDO",
    );
    expect(rutaActual({ pathname: "/admin/inventory", search: "" })).toBe("/admin/inventory");
    expect(rutaActual(null)).toBe("—");
  });

  it("la línea copiable junta código, hora y ruta", () => {
    expect(
      lineaParaSoporte({ codigo: "abc", hora: "21/09/2026, 10:14", ruta: "/admin/inventory" }),
    ).toBe("Código abc · 21/09/2026, 10:14 (Cancún) · /admin/inventory");
  });
});
