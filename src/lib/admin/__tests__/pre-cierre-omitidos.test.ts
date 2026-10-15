/**
 * Pre-cierre «Movimientos del banco omitidos de la conciliación» (API 0.0.77,
 * invariante 75; INFORMATIVO): la clave es la del API y el enlace lleva a
 * Conciliación → «Omitidos» DEL PERIODO (el API cuenta por la fecha del
 * movimiento; sin las fechas no cuadraría con el «· N» del renglón). Con la
 * paridad de la clave contra el API cuando el repo hermano está al lado.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS,
  ETIQUETA_REVISAR_OMITIDOS,
  hrefPrecierreMovimientosOmitidos,
} from "@/lib/admin/pre-cierre-omitidos";

describe("pre-cierre: movimientos omitidos de la conciliación", () => {
  it("la pestaña «Omitidos» del periodo y el texto del enlace", () => {
    expect(CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS).toBe("movimientos_omitidos");
    expect(hrefPrecierreMovimientosOmitidos({ desde: "2026-10-01", hasta: "2026-10-31" })).toBe(
      "/admin/conciliacion?f=omitidos&desde=2026-10-01&hasta=2026-10-31",
    );
    expect(ETIQUETA_REVISAR_OMITIDOS).toBe("Revisar los omitidos →");
  });

  it("paridad: la clave es la que manda el API (si el repo hermano está al lado)", () => {
    const p = path.resolve(
      __dirname,
      "../../../../../vuelatour-api/src/modules/profit-sharing/profit-sharing.service.ts",
    );
    if (!existsSync(p)) return;
    expect(readFileSync(p, "utf8")).toContain(`clave: '${CLAVE_PRECIERRE_MOVIMIENTOS_OMITIDOS}',`);
  });
});
