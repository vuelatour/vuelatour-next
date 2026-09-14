import { describe, expect, it } from "vitest";
import {
  lineasTramosTacos,
  MAX_TRAMOS_TACOS,
  rutaTramo,
  type PreCierreTacoTramo,
} from "../pre-cierre-tacos";

const tramo = (p: Partial<PreCierreTacoTramo>): PreCierreTacoTramo => ({
  vuelo_id: "v1",
  folio: 248,
  orden: 1,
  origen_iata: "CUN",
  destino_iata: "CZM",
  fecha_salida_plan: null,
  motivo: null,
  piloto_nombre: null,
  ...p,
});

describe("rutaTramo", () => {
  it("arma la ruta y no inventa el extremo que falta", () => {
    expect(rutaTramo("CUN", "CZM")).toBe("CUN → CZM");
    expect(rutaTramo("CUN", null)).toBe("CUN → ?");
    expect(rutaTramo(null, null)).toBe("");
  });
});

describe("lineasTramosTacos (pre-cierre: cuáles son los tacos en revisión)", () => {
  it("línea completa: tramo, ruta, fecha Cancún, piloto y motivo", () => {
    const { lineas, restantes } = lineasTramosTacos([
      tramo({
        fecha_salida_plan: "2026-09-14T18:30:00Z",
        piloto_nombre: "Juan Pérez",
        motivo: "Sin lectura de llegada",
      }),
    ]);
    expect(restantes).toBe(0);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].folio).toBe("#248");
    expect(lineas[0].href).toBe("/admin/flights/v1");
    // 18:30 UTC = 13:30 en Cancún (UTC−5, sin horario de verano).
    expect(lineas[0].texto).toBe(
      "T1 CUN → CZM · 14 sep, 01:30 p.m. · Juan Pérez · Sin lectura de llegada",
    );
  });

  it("sin fecha/piloto/motivo la línea no deja separadores vacíos", () => {
    const { lineas } = lineasTramosTacos([tramo({ orden: 2 })]);
    expect(lineas[0].texto).toBe("T2 CUN → CZM");
  });

  it("solo la PRIMERA línea del motivo y recortada", () => {
    const { lineas } = lineasTramosTacos([
      tramo({ motivo: "Lectura corregida a la baja\nel piloto bajó 3.2 hrs" }),
    ]);
    expect(lineas[0].texto).toContain("Lectura corregida a la baja");
    expect(lineas[0].texto).not.toContain("3.2 hrs");
    const largo = "x".repeat(200);
    const { lineas: l2 } = lineasTramosTacos([tramo({ motivo: largo })]);
    expect(l2[0].texto.length).toBeLessThan(140);
    expect(l2[0].texto.endsWith("…")).toBe(true);
  });

  it("sin folio no se inventa un número (el API manda 0, no null)", () => {
    expect(lineasTramosTacos([tramo({ folio: null })]).lineas[0].folio).toBe(
      "vuelo",
    );
    // Caso REAL: `resumenTacosEnRevision` del API emite 0 cuando no resolvió
    // el folio — «#0» sería un vuelo que no existe.
    expect(lineasTramosTacos([tramo({ folio: 0 })]).lineas[0].folio).toBe(
      "vuelo",
    );
    // Y un tramo sin orden (0) no se pinta «T0»: los tramos arrancan en 1.
    expect(lineasTramosTacos([tramo({ orden: 0 })]).lineas[0].texto).toBe(
      "Tramo CUN → CZM",
    );
  });

  it("sin folio va al FINAL de la lista (0 y null cuentan igual)", () => {
    const { lineas } = lineasTramosTacos([
      tramo({ vuelo_id: "v0", folio: 0 }),
      tramo({ vuelo_id: "v1", folio: 248 }),
    ]);
    expect(lineas.map((l) => l.folio)).toEqual(["#248", "vuelo"]);
  });

  it("deduplica por vuelo+tramo y agrupa por vuelo (folio ascendente)", () => {
    const { lineas } = lineasTramosTacos([
      tramo({ vuelo_id: "v2", folio: 300, orden: 1 }),
      tramo({ vuelo_id: "v1", folio: 248, orden: 2 }),
      tramo({ vuelo_id: "v1", folio: 248, orden: 1 }),
      tramo({ vuelo_id: "v1", folio: 248, orden: 1 }),
    ]);
    expect(lineas.map((l) => l.key)).toEqual(["v1#1", "v1#2", "v2#1"]);
  });

  it("más de 12 tramos: muestra 12 y dice cuántos faltan", () => {
    const muchos = Array.from({ length: 15 }, (_, i) =>
      tramo({ vuelo_id: `v${i}`, folio: 100 + i }),
    );
    const { lineas, restantes } = lineasTramosTacos(muchos);
    expect(lineas).toHaveLength(MAX_TRAMOS_TACOS);
    expect(restantes).toBe(3);
  });

  it("«y N más…» sale del count del API, no del arreglo topado en 200", () => {
    // El API topa `tramos` en 200 pero `count` es el total REAL: sin pasarlo,
    // un periodo con 260 amarillos diría "y 188 más…" en vez de "y 248 más…".
    const doscientos = Array.from({ length: 200 }, (_, i) =>
      tramo({ vuelo_id: `v${i}`, folio: 100 + i }),
    );
    const { lineas, restantes } = lineasTramosTacos(
      doscientos,
      MAX_TRAMOS_TACOS,
      260,
    );
    expect(lineas).toHaveLength(MAX_TRAMOS_TACOS);
    expect(restantes).toBe(260 - MAX_TRAMOS_TACOS);
  });

  it("un count viejo o menor JAMÁS esconde líneas ya pintadas", () => {
    const quince = Array.from({ length: 15 }, (_, i) =>
      tramo({ vuelo_id: `v${i}`, folio: 100 + i }),
    );
    // count desfasado (más chico que lo recibido): gana lo que sí llegó.
    expect(lineasTramosTacos(quince, MAX_TRAMOS_TACOS, 3).restantes).toBe(3);
    expect(lineasTramosTacos(quince, MAX_TRAMOS_TACOS, null).restantes).toBe(3);
    expect(
      lineasTramosTacos(quince, MAX_TRAMOS_TACOS, undefined).restantes,
    ).toBe(3);
  });

  it("API sin el aditivo (skew de deploy): ni lista ni ruido", () => {
    expect(lineasTramosTacos(undefined)).toEqual({ lineas: [], restantes: 0 });
    expect(lineasTramosTacos([])).toEqual({ lineas: [], restantes: 0 });
  });
});
