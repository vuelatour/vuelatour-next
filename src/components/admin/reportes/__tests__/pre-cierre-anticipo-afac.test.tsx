/**
 * Pre-cierre — los renglones de las decisiones del cliente del 14-oct-2026
 * (API 0.0.77). El API decide qué entra, cuánto suma y si bloquea (`listo`);
 * el panel lo pinta:
 *  - `permisos_sin_avion` (BLOQUEA; «el AFAC lo cargan al Avión»): título,
 *    conteo y monto del API —pesos Y dólares por separado cuando hay de los
 *    dos (jamás sumados; antes la card solo enseñaba los dólares)— y
 *    «Resolver →» a Gastos con los PERMISOS del periodo.
 *  - `cobros_en_cancelados` (informativo; «un anticipo devuelto no lleva
 *    CFDI»): el chip «#215 (diferencia cambiaria)» cuando el API manda la
 *    marca, con su explicación; sin ella, el chip de siempre.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AYUDA_DIFERENCIA_CAMBIARIA,
  CLAVE_PRECIERRE_COBROS_EN_CANCELADOS,
  CLAVE_PRECIERRE_PERMISOS_SIN_AVION,
  ETIQUETA_DIFERENCIA_CAMBIARIA,
  esDiferenciaCambiaria,
  hrefPrecierrePermisosSinAvion,
} from "@/lib/admin/pre-cierre-anticipo-afac";

const preCierre = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => preCierre(...a) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string; title?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");

const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };
const pintar = async () => renderToStaticMarkup(await PreCierreCard(PERIODO));

const DETALLE_PERMISOS =
  "El permiso lo carga el avión (decisión del cliente del 14-oct-2026): sin avión no resta en ningún balance ni en el reparto y el Balance general lo pondría como gasto de VuelaTour. Asígnale el avión o el vuelo en Gastos.";

const permisos = (over: Record<string, unknown> = {}) => ({
  clave: "permisos_sin_avion",
  titulo: "Permisos sin avión",
  detalle: DETALLE_PERMISOS,
  count: 1,
  monto_mxn: 5000,
  ...over,
});

const V215 = "6d1f0a41-2b7e-4c55-9d0a-6a5e2b215215";
const V216 = "6d1f0a41-2b7e-4c55-9d0a-6a5e2b216216";

const cancelados = (over: Record<string, unknown> = {}) => ({
  clave: "cobros_en_cancelados",
  titulo: "Vuelos cancelados con cobros retenidos (ya cuentan en el reparto)",
  detalle: "Cargo por cancelación o anticipo no reembolsado: entra íntegro como venta del avión…",
  count: 2,
  monto_usd: 927.43,
  informativo: true,
  vuelos: [
    { id: V215, folio: 215, cobrado_usd: 907.61 },
    { id: V216, folio: 216, cobrado_usd: 19.82, diferencia_cambiaria: true },
  ],
  ...over,
});

beforeEach(() => preCierre.mockReset());

describe("helpers puros", () => {
  it("claves del API y «Resolver →» de los permisos: Gastos → Permiso, del periodo", () => {
    expect(CLAVE_PRECIERRE_PERMISOS_SIN_AVION).toBe("permisos_sin_avion");
    expect(CLAVE_PRECIERRE_COBROS_EN_CANCELADOS).toBe("cobros_en_cancelados");
    expect(hrefPrecierrePermisosSinAvion(PERIODO)).toBe(
      "/admin/expenses?categoria=PERMISO&desde=2026-09-01&hasta=2026-09-30",
    );
  });

  it("diferencia cambiaria: SOLO con `true` del API; textos exactos", () => {
    expect(esDiferenciaCambiaria({ diferencia_cambiaria: true })).toBe(true);
    for (const v of [false, "true", 1, null, undefined]) {
      expect(esDiferenciaCambiaria({ diferencia_cambiaria: v }), String(v)).toBe(false);
    }
    expect(esDiferenciaCambiaria({})).toBe(false);
    expect(esDiferenciaCambiaria(null)).toBe(false);
    expect(ETIQUETA_DIFERENCIA_CAMBIARIA).toBe("diferencia cambiaria");
    expect(AYUDA_DIFERENCIA_CAMBIARIA).toBe(
      "El dinero ya se devolvió completo: lo que queda es la diferencia entre el T.C. del cobro y el del reembolso, que el reparto cuenta como venta. Para que no cuente, captura el reembolso con el T.C. del cobro.",
    );
  });
});

describe("permisos_sin_avion (bloquea: el permiso lo carga el avión)", () => {
  it("renglón con el conteo, el monto en pesos, el detalle del API y «Resolver →» a los permisos del periodo; la card NO está lista", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: false, items: [permisos()] });
    const html = await pintar();
    expect(html).toContain("El sistema encontró pendientes que dejarían el cierre incompleto.");
    expect(html).toMatch(/Permisos sin avión <span[^>]*>· 1<\/span><span[^>]*> · \$5,000 MXN<\/span>/);
    expect(html).toContain(DETALLE_PERMISOS);
    expect(html).toMatch(
      /href="\/admin\/expenses\?categoria=PERMISO&amp;desde=2026-09-01&amp;hasta=2026-09-30&amp;pc=permisos_sin_avion&amp;[^"]*"[^>]*>Resolver →</,
    );
  });

  it("pesos Y dólares: se dicen los DOS, por separado (jamás sumados ni uno escondido)", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [permisos({ count: 2, monto_mxn: 5000, monto_usd: 100.5 })],
    });
    const html = await pintar();
    expect(html).toContain(" · $100.50 USD · $5,000 MXN</span>");
    // Solo dólares (`monto_mxn` 0): solo los dólares.
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [permisos({ monto_mxn: 0, monto_usd: 100 })],
    });
    const soloUsd = await pintar();
    expect(soloUsd).toContain(" · $100 USD</span>");
    expect(soloUsd).not.toContain("MXN</span>");
  });

  it("count 0 (lo de hoy en producción): no se pinta y la card puede estar lista", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [permisos({ count: 0, monto_mxn: 0 })],
    });
    const html = await pintar();
    expect(html).not.toContain("Permisos sin avión");
    expect(html).toContain("Todo en orden");
  });
});

describe("cobros_en_cancelados: «(diferencia cambiaria)»", () => {
  it("el chip del vuelo marcado lo dice (con su explicación); el otro, como siempre", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [cancelados()] });
    const html = await pintar();
    expect(html).toContain("Vuelos cancelados con cobros retenidos (ya cuentan en el reparto)");
    expect(html).toContain("$927.43 USD");
    expect(html).toMatch(new RegExp(`<a href="/admin/flights/${V215}"[^>]*>#215</a>`));
    expect(html).not.toMatch(new RegExp(`<a href="/admin/flights/${V215}"[^>]*title=`));
    expect(html).toMatch(
      new RegExp(`<a href="/admin/flights/${V216}" title="${AYUDA_DIFERENCIA_CAMBIARIA.replace(/\./g, "\\.")}"[^>]*>#216 \\(diferencia cambiaria\\)</a>`),
    );
  });

  it("sin la marca (API ≤ 0.0.76): ningún chip la dice", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [cancelados({ vuelos: [{ id: V215, folio: 215, cobrado_usd: 907.61 }], count: 1, monto_usd: 907.61 })],
    });
    const html = await pintar();
    expect(html).toContain(">#215</a>");
    expect(html).not.toContain("diferencia cambiaria");
  });
});
