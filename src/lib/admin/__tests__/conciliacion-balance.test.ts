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
  NOMBRE_HOJA_BALANCE_AVION,
  NOMBRE_HOJA_BALANCE_GENERAL,
  TEXTO_PESTANA_NUEVA_SR,
  enlacesBalanceDeGasto,
  etiquetaVerBalanceAvion,
  hayEnlacesBalance,
  nombreHojaBalanceAvion,
  nombreHojaBalanceGeneral,
  textoEjeBalance,
  textoHojaBalanceDeGasto,
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
          "Abre en una pestaña nueva el balance de N4142R (del 01 oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto, hoja «reporte horas N4142R»",
      },
    ]);
    expect(e.general).toEqual({
      key: "general",
      href: `${RUTA_VISTA_BALANCE}?modo=mensual&desde=2026-10-01&hasta=2026-10-31&gasto=${G_430}`,
      etiqueta: "Ver en balance general",
      title:
        "Abre en una pestaña nueva el Balance mensual de la flota (del 01 oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto, hoja «reporte horas FLOTA»",
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

describe("en qué hoja del Excel del balance está (pedido del cliente, 15-oct-2026)", () => {
  it("la tabla de pestañas CONGELADA: los nombres EXACTOS de pyservices, una por cada hoja del API", () => {
    expect(NOMBRE_HOJA_BALANCE_AVION).toEqual({
      reporte_horas: "reporte horas",
      combustible: "combustible",
      gastos_indirectos: "Gastos Indirectos",
      refacciones: "refacciones",
      permisos: "permisos",
    });
    expect(NOMBRE_HOJA_BALANCE_GENERAL).toEqual({
      reporte_horas: "reporte horas FLOTA",
      combustible: "combustible",
      otros_gastos: "otros gastos",
      repartidos: "repartidos a aviones",
      inventario: "inventario",
      // PERMISO marcado «Pago de AFAC» (16-oct-2026, API 0.0.89, R2b).
      otros_movimientos: "otros movimientos",
    });
    // Cada valor de los tipos del panel tiene nombre: un valor nuevo sin
    // nombre truena aquí (y en tsc, por el Record).
    expect(Object.keys(NOMBRE_HOJA_BALANCE_AVION).sort()).toEqual(literales(TIPOS_PANEL, "HojaBalanceAvion"));
    expect(Object.keys(NOMBRE_HOJA_BALANCE_GENERAL).sort()).toEqual(literales(TIPOS_PANEL, "HojaBalanceGeneral"));
  });

  it("la hoja de vuelos del avión lleva la matrícula; sin ella o con una hoja desconocida ⇒ null (jamás un nombre inventado)", () => {
    expect(nombreHojaBalanceAvion("reporte_horas", "N4142R")).toBe("reporte horas N4142R");
    expect(nombreHojaBalanceAvion("reporte_horas", " XA-VGV ")).toBe("reporte horas XA-VGV");
    expect(nombreHojaBalanceAvion("reporte_horas", null)).toBeNull();
    expect(nombreHojaBalanceAvion("gastos_indirectos", null)).toBe("Gastos Indirectos");
    expect(nombreHojaBalanceAvion("hoja_nueva_del_api", "N4142R")).toBeNull();
    expect(nombreHojaBalanceAvion("toString", "N4142R")).toBeNull();
    expect(nombreHojaBalanceAvion(null, "N4142R")).toBeNull();
    expect(nombreHojaBalanceGeneral("repartidos")).toBe("repartidos a aviones");
    expect(nombreHojaBalanceGeneral("hoja_nueva_del_api")).toBeNull();
    expect(nombreHojaBalanceGeneral(undefined)).toBeNull();
    // Espejo de `sheet_title`: ilegales → «-», máx. 31.
    expect(nombreHojaBalanceAvion("reporte_horas", "AB/CD")).toBe("reporte horas AB-CD");
    expect(nombreHojaBalanceAvion("reporte_horas", "X".repeat(40))).toHaveLength(31);
  });

  it("#430 de N4142R: «Balance de N4142R (oct 2026): hoja «reporte horas N4142R» · Balance general: hoja «reporte horas FLOTA»»", () => {
    expect(
      textoHojaBalanceDeGasto(
        ubicacion({
          aviones: [{ id: N4142R, matricula: "N4142R" }],
          general: true,
          hoja_avion: "reporte_horas",
          hoja_general: "reporte_horas",
        }),
      ),
    ).toBe("Balance de N4142R (oct 2026): hoja «reporte horas N4142R» · Balance general: hoja «reporte horas FLOTA»");
  });

  it("gasto de empresa (solo general) ⇒ el mes va con «Balance general»", () => {
    expect(
      textoHojaBalanceDeGasto(ubicacion({ eje: "gasto", general: true, hoja_general: "otros_gastos" })),
    ).toBe("Balance general (oct 2026): hoja «otros gastos»");
  });

  it("dos aviones (INDIRECTO al 50/50) y cinco (OTRO de $890 de sep): máx. 2 matrículas y «y N aviones más», como los enlaces", () => {
    expect(
      textoHojaBalanceDeGasto(
        ubicacion({
          eje: "gasto",
          aviones: [
            { id: XA_VGV, matricula: "XA-VGV" },
            { id: XB_PEV, matricula: "XB-PEV" },
          ],
          hoja_avion: "gastos_indirectos",
        }),
      ),
    ).toBe("Balance de XA-VGV y XB-PEV (oct 2026): hoja «Gastos Indirectos»");
    const cinco = ubicacion({
      periodo: SEPTIEMBRE,
      eje: "gasto",
      aviones: [N4142R, N621TX, N990GG, XA_VGV, XB_PEV].map((id, i) => ({
        id,
        matricula: ["N4142R", "N621TX", "N990GG", "XA-VGV", "XB-PEV"][i],
      })),
      general: true,
      hoja_avion: "gastos_indirectos",
      hoja_general: "repartidos",
    });
    expect(textoHojaBalanceDeGasto(cinco)).toBe(
      "Balance de N4142R, N621TX y 3 aviones más (sep 2026): hoja «Gastos Indirectos» · Balance general: hoja «repartidos a aviones»",
    );
    expect(
      textoHojaBalanceDeGasto({ ...cinco, aviones: cinco.aviones.slice(0, 3) }),
    ).toContain("Balance de N4142R, N621TX y 1 avión más (sep 2026)");
  });

  it("matrícula ilegible, hoja desconocida (API más nuevo) ⇒ sin nombre de hoja, el resto sí", () => {
    expect(
      textoHojaBalanceDeGasto(
        ubicacion({ aviones: [{ id: N4142R, matricula: null }], hoja_avion: "reporte_horas" }),
      ),
    ).toBe("Balance del avión (oct 2026)");
    expect(
      textoHojaBalanceDeGasto(
        ubicacion({
          aviones: [{ id: N4142R, matricula: "N4142R" }],
          hoja_avion: "nueva" as unknown as UbicacionBalanceGasto["hoja_avion"],
          general: true,
          hoja_general: "nueva" as unknown as UbicacionBalanceGasto["hoja_general"],
        }),
      ),
    ).toBe("Balance de N4142R (oct 2026) · Balance general");
  });

  it("sin `balance` (API previo), `balance: null`, periodo inválido o sin libros ⇒ sin línea (null no es «no cuenta en ningún balance»)", () => {
    expect(textoHojaBalanceDeGasto(undefined)).toBeNull();
    expect(textoHojaBalanceDeGasto(null)).toBeNull();
    expect(
      textoHojaBalanceDeGasto(ubicacion({ general: true, hoja_general: "otros_gastos", periodo: { desde: "x", hasta: "2026-10-31" } })),
    ).toBeNull();
    expect(textoHojaBalanceDeGasto(ubicacion({}))).toBeNull();
  });

  it("el title de los enlaces nombra la hoja", () => {
    const e = enlacesBalanceDeGasto(
      gasto(
        ubicacion({
          eje: "gasto",
          aviones: [{ id: XA_VGV, matricula: "XA-VGV" }],
          general: true,
          hoja_avion: "gastos_indirectos",
          hoja_general: "repartidos",
        }),
      ),
    );
    expect(e.aviones[0].title).toMatch(/en la celda de este gasto, hoja «Gastos Indirectos»$/);
    expect(e.general?.title).toMatch(/en la celda de este gasto, hoja «repartidos a aviones»$/);
    // Sin hoja conocida, el title de siempre.
    const sinHoja = enlacesBalanceDeGasto(gasto(ubicacion({ aviones: [{ id: XA_VGV, matricula: "XA-VGV" }] })));
    expect(sinHoja.aviones[0].title).toMatch(/en la celda de este gasto$/);
  });
});

/**
 * PARIDAD con pyservices (repo hermano; en Vercel y en un worktree suelto no
 * existe y se omite; `VUELATOUR_WORKSPACE=<carpeta con los repos>` la activa
 * desde un worktree): cada nombre de la tabla es una pestaña que de verdad
 * crea `balance_avion_xlsx.py` EN SU LIBRO. «combustible» y «refacciones»
 * existen en los dos libros: cada tabla se busca SOLO en el cuerpo de su
 * libro (`construir_balance_avion` / el bloque `if cons is not None:` de
 * `construir_balance_general`), para que renombrar la pestaña de uno solo
 * truene (revisión del 15-oct-2026).
 */
const WORKSPACE = process.env.VUELATOUR_WORKSPACE
  ? path.resolve(process.env.VUELATOUR_WORKSPACE)
  : path.resolve(__dirname, "../../../../..");
const PY = path.join(WORKSPACE, "vuelatour-pyservices/app/services/balance_avion_xlsx.py");
// CRLF (Windows, core.autocrlf): el repo hermano se lee normalizado a LF.
const libroPy = existsSync(PY) ? readFileSync(PY, "utf8").replace(/\r\n/g, "\n") : null;
/** Cuerpo de una función top-level de Python (hasta el siguiente `def` de columna 0). */
const cuerpoPy = (src: string, funcion: string): string => {
  const i = src.indexOf(`\ndef ${funcion}(`);
  expect(i, funcion).toBeGreaterThanOrEqual(0);
  const fin = src.indexOf("\ndef ", i + 1);
  return src.slice(i, fin < 0 ? undefined : fin);
};
describe("paridad con pyservices (lectura del repo hermano)", () => {
  it.skipIf(!libroPy)("cada pestaña de la tabla la crea SU libro de pyservices (no el otro)", () => {
    const py = libroPy!;
    const individual = cuerpoPy(py, "construir_balance_avion");
    const generalFn = cuerpoPy(py, "construir_balance_general");
    const iCons = generalFn.indexOf("\n    if cons is not None:\n");
    expect(iCons, "bloque `if cons is not None:` del general").toBeGreaterThanOrEqual(0);
    const general = generalFn.slice(iCons);
    // La hoja de vuelos de los dos libros la titula `_hoja_maestra` con la matrícula.
    expect(cuerpoPy(py, "_hoja_maestra")).toContain('sheet_title(f"reporte horas {req.matricula}")');
    for (const [hoja, nombre] of Object.entries(NOMBRE_HOJA_BALANCE_AVION)) {
      if (hoja === "reporte_horas") {
        expect(nombre).toBe("reporte horas");
        // pyservices 0.0.98 agregó `usd_por_gasto=` a la llamada: con o sin extras.
        expect(individual, hoja).toMatch(/_hoja_maestra\(\s*wb\.active,\s*req[,)]/);
      } else {
        expect(individual, hoja).toContain(`create_sheet("${nombre}")`);
      }
    }
    for (const [hoja, nombre] of Object.entries(NOMBRE_HOJA_BALANCE_GENERAL)) {
      if (hoja === "reporte_horas") {
        expect(nombre).toBe("reporte horas FLOTA");
        expect(general, hoja).toMatch(/_hoja_maestra\(\s*wb\.create_sheet\(\),\s*cons,/);
      } else {
        expect(general, hoja).toContain(`create_sheet("${nombre}")`);
      }
    }
    // Las exclusivas de un libro NO están en el otro (si no, la tabla equivocada pasaría).
    for (const nombre of ["Gastos Indirectos", "permisos"]) {
      expect(general, nombre).not.toContain(`create_sheet("${nombre}")`);
    }
    for (const nombre of ["otros gastos", "repartidos a aviones", "inventario", "otros movimientos"]) {
      expect(individual, nombre).not.toContain(`create_sheet("${nombre}")`);
    }
  });
  const balanceApi = path.join(WORKSPACE, "vuelatour-api/src/modules/aircraft/aircraft-balance.service.ts");
  it.skipIf(!existsSync(balanceApi))("el consolidado de la flota llega con matrícula «FLOTA» (⇒ «reporte horas FLOTA»)", () => {
    expect(readFileSync(balanceApi, "utf8")).toContain("matricula: 'FLOTA'");
  });
});

/**
 * PARIDAD con el API (repo hermano; en Vercel no existe y se omite). Se
 * omite también hasta que el API traiga el punto 5
 * (`common/ubicacion-balance-gasto.util.ts`): ahí se vuelven obligatorias.
 */
const API = path.join(WORKSPACE, "vuelatour-api/src");
const leerApi = (rel: string): string | null => {
  const p = path.join(API, rel);
  return existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : null;
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
