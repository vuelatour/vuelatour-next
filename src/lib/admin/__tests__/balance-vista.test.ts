/**
 * Vista en pantalla de los balances (12-oct-2026): parámetros de la URL
 * validados, enlaces, títulos, la descarga IDÉNTICA a la de Reportes y la
 * lectura de los errores del API.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fmtDateOnly } from "@/lib/datetime";
import { RUTA_BALANCE_VUELATOUR, librosBalanceVuelaTour } from "../reportes-balance";
import {
  DESCRIPCION_VISTA_BALANCE,
  ETIQUETA_DESCARGAR_LIBRO,
  ETIQUETA_VER_EN_PANTALLA,
  ROLES_ABREN_BALANCES,
  RUTA_VISTA_BALANCE,
  TEXTO_BALANCES_SIN_PERMISO,
  descargaVistaBalance,
  errorVistaBalance,
  hrefReportesDesdeVista,
  hrefVistaBalance,
  parametrosVistaBalance,
  periodoDefaultVista,
  puedeAbrirBalances,
  textoPeriodoVista,
  tituloVistaBalance,
} from "../balance-vista";

const UUID = "3f9a1c2e-0000-4000-8000-000000000001";
const DEF = { desde: "2026-10-01", hasta: "2026-10-12" };

describe("parámetros de la URL", () => {
  it("el periodo default es el mes corriente (hoy en Cancún)", () => {
    expect(periodoDefaultVista("2026-10-12")).toEqual(DEF);
  });

  it("sin nada ⇒ Balance mensual del mes corriente", () => {
    expect(parametrosVistaBalance({}, DEF)).toEqual({
      destino: { tipo: "vuelatour", modo: "mensual" },
      ...DEF,
    });
  });

  it("`modo` solo del catálogo (otro ⇒ mensual); `avion` solo si es uuid y entonces gana", () => {
    expect(parametrosVistaBalance({ modo: "general" }, DEF).destino).toEqual({
      tipo: "vuelatour",
      modo: "general",
    });
    expect(parametrosVistaBalance({ modo: "anual" }, DEF).destino).toEqual({
      tipo: "vuelatour",
      modo: "mensual",
    });
    expect(parametrosVistaBalance({ avion: UUID, modo: "general" }, DEF).destino).toEqual({
      tipo: "avion",
      avionId: UUID,
    });
    expect(parametrosVistaBalance({ avion: "123" }, DEF).destino).toEqual({
      tipo: "vuelatour",
      modo: "mensual",
    });
  });

  it("fechas: solo días válidos (si no, el default) y el rango nunca queda invertido", () => {
    expect(parametrosVistaBalance({ desde: "2026-09-30", hasta: "2026-09-01" }, DEF)).toMatchObject({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
    expect(parametrosVistaBalance({ desde: "2026-13-45", hasta: "2026-10-05" }, DEF)).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-05",
    });
    expect(parametrosVistaBalance({ hasta: "2026-08-15" }, DEF)).toMatchObject({
      desde: "2026-08-15",
      hasta: "2026-10-01",
    });
  });
});

describe("enlaces y títulos", () => {
  it("la vista de cada libro y la de un avión, con el periodo", () => {
    expect(hrefVistaBalance({ tipo: "vuelatour", modo: "mensual" }, "2026-09-01", "2026-09-30")).toBe(
      `${RUTA_VISTA_BALANCE}?modo=mensual&desde=2026-09-01&hasta=2026-09-30`,
    );
    expect(hrefVistaBalance({ tipo: "avion", avionId: UUID }, "2026-09-01", "2026-09-30")).toBe(
      `${RUTA_VISTA_BALANCE}?avion=${UUID}&desde=2026-09-01&hasta=2026-09-30`,
    );
    expect(hrefReportesDesdeVista("2026-09-01", "2026-09-30")).toBe(
      "/admin/reportes?desde=2026-09-01&hasta=2026-09-30",
    );
    // Ida y vuelta: lo que arma el enlace lo entiende la página.
    const href = hrefVistaBalance({ tipo: "avion", avionId: UUID }, "2026-09-01", "2026-09-30");
    const sp = Object.fromEntries(new URL(`https://x${href}`).searchParams);
    expect(parametrosVistaBalance(sp, DEF)).toEqual({
      destino: { tipo: "avion", avionId: UUID },
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
  });

  it("títulos y periodo en palabras", () => {
    expect(tituloVistaBalance({ tipo: "vuelatour", modo: "mensual" })).toBe("Balance mensual");
    expect(tituloVistaBalance({ tipo: "vuelatour", modo: "general" })).toBe("Balance general");
    expect(tituloVistaBalance({ tipo: "avion", avionId: UUID }, "XB-PEV")).toBe("Balance del avión XB-PEV");
    expect(tituloVistaBalance({ tipo: "avion", avionId: UUID })).toBe("Balance del avión");
    expect(textoPeriodoVista("2026-09-01", "2026-09-30")).toBe(
      `Del ${fmtDateOnly("2026-09-01")} al ${fmtDateOnly("2026-09-30")}`,
    );
    expect(ETIQUETA_VER_EN_PANTALLA).toBe("Ver en pantalla");
    expect(DESCRIPCION_VISTA_BALANCE).toContain("Es el mismo libro que se descarga");
  });
});

describe("descarga desde la vista = la de Reportes", () => {
  it("la flota: misma ruta, mismo archivo y mismos parámetros que el botón de la card", () => {
    const [mensual, general] = librosBalanceVuelaTour("2026-09-01", "2026-09-30");
    expect(descargaVistaBalance({ tipo: "vuelatour", modo: "mensual" }, "2026-09-01", "2026-09-30")).toEqual({
      path: mensual.path,
      filename: mensual.filename,
      query: mensual.query,
      label: ETIQUETA_DESCARGAR_LIBRO,
    });
    expect(descargaVistaBalance({ tipo: "vuelatour", modo: "general" }, "2026-09-01", "2026-09-30")).toEqual({
      path: RUTA_BALANCE_VUELATOUR,
      filename: general.filename,
      query: { desde: "2026-09-01", hasta: "2026-09-30", modo: "general" },
      label: ETIQUETA_DESCARGAR_LIBRO,
    });
  });

  it("un avión: la ruta y el archivo del selector de Reportes; sin matrícula no hay botón", () => {
    expect(descargaVistaBalance({ tipo: "avion", avionId: UUID }, "2026-09-01", "2026-09-30", "XB-PEV")).toEqual({
      path: `/v1/aircraft/${UUID}/balance.xlsx`,
      filename: "balance-XB-PEV-2026-09-01-2026-09-30.xlsx",
      query: { desde: "2026-09-01", hasta: "2026-09-30" },
      label: ETIQUETA_DESCARGAR_LIBRO,
    });
    expect(descargaVistaBalance({ tipo: "avion", avionId: UUID }, "2026-09-01", "2026-09-30", null)).toBeNull();
  });
});

describe("errores del API en palabras", () => {
  it("401/403 = permiso (ADMIN y ANALISTA, como la descarga)", () => {
    expect(errorVistaBalance({ status: 403, message: "Forbidden" })).toMatchObject({
      motivo: "permiso",
      titulo: "Tu usuario no puede abrir los balances",
    });
    expect(errorVistaBalance({ status: 401 }).motivo).toBe("permiso");
    expect(errorVistaBalance({ status: 403 }).descripcion).toContain("ADMIN y ANALISTA");
  });

  it("404 «Cannot GET» = API sin desplegar; otro 404 = el avión no existe", () => {
    expect(errorVistaBalance({ status: 404, message: "Cannot GET /v1/aircraft/balance-general/libro" })).toMatchObject({
      motivo: "api-viejo",
      titulo: "Disponible cuando se actualice el servidor",
    });
    expect(errorVistaBalance({ status: 404, message: `Aircraft ${UUID} not found` })).toMatchObject({
      motivo: "no-existe",
      titulo: "Ese avión no existe",
    });
  });

  it("400 = el periodo, con el texto del API; 500/red = fallo que se reintenta", () => {
    expect(errorVistaBalance({ status: 400, message: "El modo del balance debe ser «mensual» o «general»." })).toEqual({
      motivo: "periodo",
      titulo: "El periodo no es válido",
      descripcion: "El modo del balance debe ser «mensual» o «general».",
    });
    expect(errorVistaBalance({ status: 400, message: "  " }).descripcion).toContain("Revisa las fechas");
    expect(errorVistaBalance({ status: 502 }).motivo).toBe("fallo");
    expect(errorVistaBalance({}).motivo).toBe("fallo");
    expect(errorVistaBalance({ status: 500 }).descripcion).toContain("Reintentar");
  });

  it("ningún error se disfraza de «sin movimientos»", () => {
    for (const e of [{ status: 403 }, { status: 404, message: "Cannot GET /x" }, { status: 404 }, { status: 400 }, {}]) {
      const r = errorVistaBalance(e);
      expect(`${r.titulo} ${r.descripcion}`.toLowerCase()).not.toContain("sin movimientos");
    }
  });
});

/** Repo hermano del API (solo existe en el workspace local). */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};

describe("quién abre los balances (12-oct-2026)", () => {
  it("ADMIN y ANALISTA sí; los demás roles no; sin rol se ofrece todo (el API es el candado)", () => {
    expect(puedeAbrirBalances("ADMIN")).toBe(true);
    expect(puedeAbrirBalances("ANALISTA")).toBe(true);
    for (const rol of ["FACTURACION", "COORDINADOR", "SOCIO", "PILOTO", "MECANICO", "VISITANTE"]) {
      expect(puedeAbrirBalances(rol), rol).toBe(false);
    }
    expect(puedeAbrirBalances(null)).toBe(true);
    expect(puedeAbrirBalances(undefined)).toBe(true);
    expect(puedeAbrirBalances("")).toBe(true);
    expect(ROLES_ABREN_BALANCES).toEqual(["ADMIN", "ANALISTA"]);
  });

  it("la card con candado dice lo mismo que el 403 de la vista y nombra los roles, sin mandar a «pedirlo»", () => {
    expect(TEXTO_BALANCES_SIN_PERMISO.titulo).toBe(errorVistaBalance({ status: 403 }).titulo);
    expect(TEXTO_BALANCES_SIN_PERMISO.descripcion).toContain("ADMIN");
    expect(TEXTO_BALANCES_SIN_PERMISO.descripcion).toContain("ANALISTA");
    // No promete descargas que el rol no puede usar («PDF socios» y «Horas por
    // piloto» también se filtran por rol en esa pantalla).
    expect(TEXTO_BALANCES_SIN_PERMISO.descripcion).toContain(
      "siguen aquí, con las descargas que tu rol puede usar",
    );
    expect(TEXTO_BALANCES_SIN_PERMISO.descripcion).not.toContain("siguen disponibles");
    expect(TEXTO_BALANCES_SIN_PERMISO.descripcion.toLowerCase()).not.toContain("pedirlo a la oficina");
  });

  const controller = leerApi("modules/aircraft/aircraft.controller.ts");
  it.skipIf(!controller)("paridad con el API: los 4 endpoints de balance llevan EXACTAMENTE esos roles", () => {
    const lineas = controller!.split("\n");
    const rutas = [
      "@Get('balance-general.xlsx')",
      "@Get('balance-general/libro')",
      "@Get(':id/balance.xlsx')",
      "@Get(':id/balance/libro')",
    ];
    for (const ruta of rutas) {
      const i = lineas.findIndex((l) => l.includes(ruta));
      expect(i, `no se encontró ${ruta} en el API`).toBeGreaterThanOrEqual(0);
      const ventana = lineas.slice(i + 1, i + 5).join("\n");
      const roles = ventana.match(/@Roles\(([^)]*)\)/)?.[1];
      expect(roles, `sin @Roles tras ${ruta}`).toBeTruthy();
      const parseados = [...roles!.matchAll(/Rol\.(\w+)/g)].map((m) => m[1]);
      expect(parseados, ruta).toEqual([...ROLES_ABREN_BALANCES]);
    }
  });
});
