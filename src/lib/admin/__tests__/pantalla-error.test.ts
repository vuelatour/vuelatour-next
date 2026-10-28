import { describe, expect, it } from "vitest";
import {
  BOTON_INICIO,
  BOTON_RECARGAR,
  BOTON_REINTENTAR,
  CLAVE_RECARGA_VERSION,
  MENSAJE_ERROR,
  MENSAJE_ERROR_VERSION,
  SIN_CODIGO,
  TITULO_ERROR,
  VENTANA_RECARGA_MS,
  codigoDeError,
  debeRecargarPorVersion,
  esErrorDeVersion,
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

/**
 * Error de VERSIÓN (28-oct-2026): «No pudimos cargar esta pantalla · sin
 * código» en /admin/expenses a las 12:24 con el panel desplegado a las 11:41.
 * La pestaña abierta desde antes del deploy pidió archivos de la versión
 * vieja; «Reintentar» no lo arregla, recargar sí.
 */
describe("error de versión (pestaña abierta desde antes de un deploy)", () => {
  it("reconoce los chunks/módulos de la versión vieja (webpack, React y los 3 navegadores)", () => {
    const chunk = Object.assign(new Error("Loading chunk 4521 failed."), { name: "ChunkLoadError" });
    expect(esErrorDeVersion(chunk)).toBe(true);
    expect(
      esErrorDeVersion(
        new Error(
          "Loading chunk app/admin/expenses/page failed.\n(error: https://panel/_next/static/chunks/app/admin/expenses/page-1a2b3c.js)",
        ),
      ),
    ).toBe(true);
    expect(esErrorDeVersion(new Error("Loading CSS chunk 123 failed."))).toBe(true);
    expect(
      esErrorDeVersion(
        new TypeError("Failed to fetch dynamically imported module: https://panel/_next/x.js"),
      ),
    ).toBe(true);
    expect(esErrorDeVersion(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(esErrorDeVersion(new TypeError("Importing a module script failed."))).toBe(true);
    expect(
      esErrorDeVersion(new TypeError("Cannot read properties of undefined (reading 'call')")),
    ).toBe(true);
    expect(
      esErrorDeVersion(new TypeError("undefined is not an object (evaluating 'r[e].call')")),
    ).toBe(true);
    expect(
      esErrorDeVersion(
        new Error(
          'Failed to find Server Action "a1b2c3". This request might be from an older or newer deployment.',
        ),
      ),
    ).toBe(true);
  });

  it("NO confunde un error real de datos ni del API", () => {
    expect(esErrorDeVersion(new TypeError("Cannot read properties of null (reading 'folio')"))).toBe(
      false,
    );
    expect(
      esErrorDeVersion(new Error("An error occurred in the Server Components render…")),
    ).toBe(false);
    expect(esErrorDeVersion(new Error("Application failed to respond"))).toBe(false);
    expect(esErrorDeVersion(null)).toBe(false);
    expect(esErrorDeVersion(undefined)).toBe(false);
    expect(esErrorDeVersion({})).toBe(false);
  });

  it("los textos dicen qué pasó y qué hacer, en es-MX", () => {
    expect(MENSAJE_ERROR_VERSION).toContain("se actualizó");
    expect(MENSAJE_ERROR_VERSION).toContain("Recargar");
    expect(MENSAJE_ERROR_VERSION).toContain("manda este código a sistemas");
    expect(BOTON_RECARGAR).toBe("Recargar");
  });
});

describe("recarga automática por versión (una vez; nunca un bucle)", () => {
  function almacen(inicial: Record<string, string> = {}) {
    const mapa = new Map(Object.entries(inicial));
    return {
      getItem: (k: string) => mapa.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mapa.set(k, v);
      },
      mapa,
    };
  }

  it("la primera vez recarga y deja la marca con el momento", () => {
    const a = almacen();
    expect(debeRecargarPorVersion(a, 1_000_000)).toBe(true);
    expect(a.mapa.get(CLAVE_RECARGA_VERSION)).toBe("1000000");
  });

  it("dentro del minuto NO vuelve a recargar (el error no era de versión, o la nueva también falla)", () => {
    const a = almacen({ [CLAVE_RECARGA_VERSION]: "1000000" });
    expect(debeRecargarPorVersion(a, 1_000_000 + 30_000)).toBe(false);
    // La marca se conserva: la ventana se mide desde la recarga real.
    expect(a.mapa.get(CLAVE_RECARGA_VERSION)).toBe("1000000");
  });

  it("pasado el minuto sí (otro deploy, más tarde)", () => {
    const a = almacen({ [CLAVE_RECARGA_VERSION]: "1000000" });
    expect(debeRecargarPorVersion(a, 1_000_000 + VENTANA_RECARGA_MS)).toBe(true);
    expect(a.mapa.get(CLAVE_RECARGA_VERSION)).toBe(String(1_000_000 + VENTANA_RECARGA_MS));
  });

  it("una marca basura cuenta como si no hubiera", () => {
    expect(debeRecargarPorVersion(almacen({ [CLAVE_RECARGA_VERSION]: "ayer" }), 5)).toBe(true);
  });

  it("sin almacenamiento, o bloqueado, NO recarga sola (sin marca no hay freno)", () => {
    expect(debeRecargarPorVersion(null)).toBe(false);
    expect(debeRecargarPorVersion(undefined)).toBe(false);
    expect(
      debeRecargarPorVersion({
        getItem: () => {
          throw new Error("bloqueado");
        },
        setItem: () => {},
      }),
    ).toBe(false);
  });
});
