/**
 * Conciliación → balance (13-oct-2026, API 0.0.75, punto 5): los enlaces
 * «Ver en balance…» de un gasto ligado salen SOLO del campo `balance` del
 * API. Casos reales de prod (SELECT del 13-oct-2026).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MovimientoGasto, UbicacionBalanceGasto } from "@/types/conciliacion";
import { RUTA_VISTA_BALANCE } from "../balance-vista";
import {
  ETIQUETA_VER_BALANCE_GENERAL,
  MAX_ENLACES_AVION,
  MODO_BALANCE_DESDE_GASTO,
  TEXTO_PESTANA_NUEVA_SR,
  enlacesBalanceDeGasto,
  etiquetaVerBalanceAvion,
  hayEnlacesBalance,
  textoEjeBalance,
} from "../conciliacion-balance";

// Caso de QA: OPERACIONES $1,899.09 del vuelo #430 de N4142R (10-oct-2026).
const G_430 = "2a3e7a09-5d1c-4b7e-9f00-000000000430";
const N4142R = "4142a000-0000-4000-8000-000000000001";
const XA_VGV = "a0a0a0a0-0000-4000-8000-000000000002";
const XB_PEV = "b0b0b0b0-0000-4000-8000-000000000003";
const N621TX = "621a0000-0000-4000-8000-000000000004";
const N990GG = "990a0000-0000-4000-8000-000000000005";

const OCTUBRE = { desde: "2026-10-01", hasta: "2026-10-31" };
const SEPTIEMBRE = { desde: "2026-09-01", hasta: "2026-09-30" };

const gasto = (balance: UbicacionBalanceGasto | null | undefined, id = G_430): Pick<MovimientoGasto, "id" | "balance"> =>
  balance === undefined ? { id } : { id, balance };

const ubicacion = (u: Partial<UbicacionBalanceGasto>): UbicacionBalanceGasto => ({
  periodo: OCTUBRE,
  eje: "vuelo",
  aviones: [],
  general: false,
  hoja_avion: null,
  hoja_general: null,
  ...u,
});

const VACIO = { aviones: [], masAviones: null, general: null };

describe("enlacesBalanceDeGasto", () => {
  it("sin `balance` (API previo o lectura fallida) o con `balance: null` (no vive en ningún libro) ⇒ nada", () => {
    expect(enlacesBalanceDeGasto(gasto(undefined))).toEqual(VACIO);
    expect(enlacesBalanceDeGasto(gasto(null))).toEqual(VACIO);
    expect(hayEnlacesBalance(enlacesBalanceDeGasto(gasto(null)))).toBe(false);
    expect(hayEnlacesBalance(null)).toBe(false);
  });

  it("el gasto del vuelo #430 de N4142R en octubre: su balance y el de la flota, con `gasto=` y el mes del vuelo", () => {
    const e = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          aviones: [{ id: N4142R, matricula: "N4142R" }],
          general: true,
          hoja_avion: "reporte_horas",
          hoja_general: "reporte_horas",
        }),
      ),
    );
    expect(e.aviones).toEqual([
      {
        key: `avion-${N4142R}`,
        href: `${RUTA_VISTA_BALANCE}?avion=${N4142R}&desde=2026-10-01&hasta=2026-10-31&gasto=${G_430}`,
        etiqueta: "Ver en balance del avión N4142R",
        title:
          "Abre en una pestaña nueva el balance de N4142R (del 01 oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto",
      },
    ]);
    expect(e.general).toEqual({
      key: "general",
      href: `${RUTA_VISTA_BALANCE}?modo=mensual&desde=2026-10-01&hasta=2026-10-31&gasto=${G_430}`,
      etiqueta: "Ver en balance general",
      title:
        "Abre en una pestaña nueva el Balance mensual de la flota (del 01 oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto",
    });
    expect(e.masAviones).toBeNull();
    expect(hayEnlacesBalance(e)).toBe(true);
    expect(MODO_BALANCE_DESDE_GASTO).toBe("mensual");
    expect(ETIQUETA_VER_BALANCE_GENERAL).toBe("Ver en balance general");
    expect(TEXTO_PESTANA_NUEVA_SR).toBe(" (se abre en una pestaña nueva)");
  });

  it("eje gasto (INDIRECTO «gestoria cramex sep», $16,240 al 50/50): dos aviones, sin general, «mes de la fecha del gasto»", () => {
    const e = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          eje: "gasto",
          aviones: [
            { id: XA_VGV, matricula: "XA-VGV" },
            { id: XB_PEV, matricula: "XB-PEV" },
          ],
          general: false,
          hoja_avion: "gastos_indirectos",
        }),
        "37471011-0000-4000-8000-000000016240",
      ),
    );
    expect(e.aviones.map((a) => a.etiqueta)).toEqual([
      "Ver en balance del avión XA-VGV",
      "Ver en balance del avión XB-PEV",
    ]);
    expect(e.aviones[1].title).toContain("(del 01 oct 2026 al 31 oct 2026, mes de la fecha del gasto)");
    expect(e.general).toBeNull();
    expect(e.masAviones).toBeNull();
  });

  it("repartido a 5 aviones (OTRO $890 del 15-sep): 2 enlaces y «y 3 aviones más» con las matrículas en el tooltip", () => {
    const e = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          periodo: SEPTIEMBRE,
          eje: "gasto",
          aviones: [
            { id: N4142R, matricula: "N4142R" },
            { id: N621TX, matricula: "N621TX" },
            { id: N990GG, matricula: "N990GG" },
            { id: XA_VGV, matricula: "XA-VGV" },
            { id: XB_PEV, matricula: "XB-PEV" },
          ],
          general: true,
          hoja_avion: "gastos_indirectos",
          hoja_general: "repartidos",
        }),
      ),
    );
    expect(MAX_ENLACES_AVION).toBe(2);
    expect(e.aviones.map((a) => a.etiqueta)).toEqual([
      "Ver en balance del avión N4142R",
      "Ver en balance del avión N621TX",
    ]);
    expect(e.masAviones).toEqual({
      texto: "y 3 aviones más",
      title:
        "También está repartido a N990GG, XA-VGV y XB-PEV: ábrelo desde Reportes → Balance por avión (del 01 sep 2026 al 30 sep 2026).",
    });
    expect(e.general?.href).toBe(`${RUTA_VISTA_BALANCE}?modo=mensual&desde=2026-09-01&hasta=2026-09-30&gasto=${G_430}`);
    // Uno solo de más: singular.
    const tres = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          aviones: [
            { id: N4142R, matricula: "N4142R" },
            { id: N621TX, matricula: "N621TX" },
            { id: XA_VGV, matricula: "XA-VGV" },
          ],
        }),
      ),
    );
    expect(tres.masAviones?.texto).toBe("y 1 avión más");
    expect(tres.masAviones?.title).toContain("También está repartido a XA-VGV:");
  });

  it("matrícula que no se pudo leer (es cosmética) ⇒ «Ver en balance del avión» y «ese avión»", () => {
    const e = enlacesBalanceDeGasto(gasto(ubicacion({ aviones: [{ id: N4142R, matricula: null }] })));
    expect(e.aviones[0].etiqueta).toBe("Ver en balance del avión");
    expect(e.aviones[0].title).toContain("el balance de ese avión (");
    expect(e.aviones[0].href).toContain(`avion=${N4142R}`);
    const muchos = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          aviones: [N4142R, N621TX, N990GG, XA_VGV].map((id) => ({ id, matricula: null })),
        }),
      ),
    );
    expect(muchos.masAviones?.title).toContain("También está repartido a otros 2 aviones:");
    expect(etiquetaVerBalanceAvion("XB-PEV")).toBe("Ver en balance del avión XB-PEV");
    expect(etiquetaVerBalanceAvion(undefined)).toBe("Ver en balance del avión");
  });

  it("fechas que no son días válidos, periodo invertido o un id que no es uuid ⇒ nada (jamás un enlace al libro equivocado)", () => {
    const ok = ubicacion({ aviones: [{ id: N4142R, matricula: "N4142R" }], general: true });
    expect(hayEnlacesBalance(enlacesBalanceDeGasto(gasto(ok)))).toBe(true);
    expect(enlacesBalanceDeGasto(gasto({ ...ok, periodo: { desde: "2026-10-01", hasta: "2026-10-32" } }))).toEqual(VACIO);
    expect(enlacesBalanceDeGasto(gasto({ ...ok, periodo: { desde: "oct", hasta: "2026-10-31" } }))).toEqual(VACIO);
    expect(enlacesBalanceDeGasto(gasto({ ...ok, periodo: { desde: "2026-10-31", hasta: "2026-10-01" } }))).toEqual(VACIO);
    expect(
      enlacesBalanceDeGasto(gasto({ ...ok, periodo: undefined as unknown as UbicacionBalanceGasto["periodo"] })),
    ).toEqual(VACIO);
    expect(enlacesBalanceDeGasto(gasto(ok, "no-es-uuid"))).toEqual(VACIO);
    expect(enlacesBalanceDeGasto(gasto(ok, ""))).toEqual(VACIO);
  });

  it("un avión sin uuid se descarta y uno repetido cuenta una vez; solo `general: true` enlaza la flota", () => {
    const e = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          aviones: [
            { id: "N4142R", matricula: "N4142R" },
            { id: XA_VGV, matricula: "XA-VGV" },
            { id: XA_VGV, matricula: "XA-VGV" },
          ],
          general: "true" as unknown as boolean,
        }),
      ),
    );
    expect(e.aviones.map((a) => a.key)).toEqual([`avion-${XA_VGV}`]);
    expect(e.masAviones).toBeNull();
    expect(e.general).toBeNull();
    const sinAviones = enlacesBalanceDeGasto(gasto(ubicacion({ aviones: null as unknown as [], general: true })));
    expect(sinAviones.aviones).toEqual([]);
    expect(sinAviones.general?.key).toBe("general");
  });
});

describe("textos", () => {
  it("el eje dice de qué fecha sale el mes", () => {
    expect(textoEjeBalance("vuelo")).toBe("mes del vuelo");
    expect(textoEjeBalance("gasto")).toBe("mes de la fecha del gasto");
  });
});

/**
 * PARIDAD con el API (repo hermano; en Vercel no existe y se omite). Se
 * omite también hasta que el API traiga el punto 5
 * (`common/ubicacion-balance-gasto.util.ts`): ahí se vuelven obligatorias.
 */
const API = path.resolve(__dirname, "../../../../../vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
};
const TIPOS_PANEL = readFileSync(path.resolve(__dirname, "../../../types/conciliacion.ts"), "utf8");
/** Literales de un `export type X = 'a' | 'b'` leído como texto (ordenados). */
const literales = (src: string, tipo: string): string[] | null => {
  const m = new RegExp(`export type ${tipo}\\s*=([^;]*);`).exec(src);
  return m ? [...m[1].matchAll(/['"]([a-z_]+)['"]/g)].map((x) => x[1]).sort() : null;
};

describe("paridad con el API (lectura del repo hermano)", () => {
  const util = leerApi("common/ubicacion-balance-gasto.util.ts");
  it.skipIf(!util)("las hojas del API (HojaLibroAvion / HojaLibroGeneral) = las del panel", () => {
    expect(literales(TIPOS_PANEL, "HojaBalanceAvion")).toEqual(
      ["combustible", "gastos_indirectos", "permisos", "refacciones", "reporte_horas"],
    );
    expect(literales(util!, "HojaLibroAvion")).toEqual(literales(TIPOS_PANEL, "HojaBalanceAvion"));
    expect(literales(util!, "HojaLibroGeneral")).toEqual(literales(TIPOS_PANEL, "HojaBalanceGeneral"));
  });

  const servicio = leerApi("modules/conciliacion/conciliacion.service.ts");
  it.skipIf(!util || !servicio)("GET /v1/conciliacion/movimientos escribe `balance` con las llaves que lee el panel", () => {
    expect(servicio).toContain("anotarUbicacionBalance");
    expect(servicio).toMatch(/\bbalance\b\s*[=:]/);
    for (const llave of ["periodo", "eje", "aviones", "matricula", "general", "hoja_avion", "hoja_general"]) {
      expect(servicio, llave).toContain(llave);
    }
  });
});
