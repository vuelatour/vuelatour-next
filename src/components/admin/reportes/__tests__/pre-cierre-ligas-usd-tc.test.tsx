/**
 * Pre-cierre «Gastos en dólares conciliados con un tipo de cambio fuera de
 * lugar» (13-oct-2026, API 0.0.75, NO bloquea): «Resolver →» a Conciliación
 * (conciliados del periodo), un renglón por liga con el texto del API y DOS
 * enlaces con `cursor-pointer`, «y N más…» contra `count`, y la visibilidad
 * de siempre (count 0 ⇒ oculto; lectura fallida ⇒ «sin verificar»).
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TUBO_LEJOS } from "@/lib/admin/__tests__/tc-cruce.fixtures";
import type { LigaUsdTcPreCierre } from "@/types/conciliacion";

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

const TITULO = "Gastos en dólares conciliados con un tipo de cambio fuera de lugar";

const liga = (i: number, over: Partial<LigaUsdTcPreCierre> = {}): LigaUsdTcPreCierre => ({
  gasto_id: `2d37d95e-0000-4000-8000-00000000000${i}`,
  fecha_gasto: "2026-09-01",
  monto_usd: 422.86,
  tc_gasto: 21.1403,
  categoria: "REFACCION",
  descripcion_gasto: "Aircraft Spruce & Specialty Co. · Michelin Tube 7.00-6/8.00…",
  vuelo_id: null,
  vuelo_folio: null,
  movimiento_id: `e5724490-0000-4000-8000-00000000000${i}`,
  fecha_cargo: "2026-09-01",
  monto_cargo: 8939.38,
  cuenta_bancaria_id: "c0b1e2d3-0000-4000-8000-00000000c0b1",
  cuenta: "COMBUSTIBLE",
  descripcion_cargo: "ASA CANCUN",
  tc_cruce: TUBO_LEJOS,
  texto: `$422.86 USD · Aircraft Spruce… (01 sep) ↔ cargo «ASA CANCUN» de $8,939.38 del 01 sep (COMBUSTIBLE): T.C. 21.14 · oficial 17.01 (+24.3 %): lejos del oficial [${i}]`,
  ...over,
});

const item = (over: Record<string, unknown> = {}) => ({
  clave: "gastos_usd_tc_fuera_de_lugar",
  titulo: TITULO,
  detalle: "Su cargo del banco en pesos da un tipo de cambio a más de ±2 % del oficial…",
  count: 2,
  ligas: [liga(1), liga(2, { vuelo_id: "7d50c91c-0000-4000-8000-000000000345", vuelo_folio: 345 })],
  sin_verificar: 0,
  lectura_fallida: false,
  ...over,
});

const pintar = async () => renderToStaticMarkup(await PreCierreCard({ desde: "2026-09-01", hasta: "2026-09-30" }));

beforeEach(() => preCierre.mockReset());

describe("pre-cierre: gastos en dólares con un T.C. fuera de lugar", () => {
  it("«Resolver →» va a Conciliación, conciliados del periodo", async () => {
    preCierre.mockResolvedValueOnce({ periodo: { desde: "2026-09-01", hasta: "2026-09-30" }, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toContain(TITULO);
    expect(html).toMatch(/href="\/admin\/conciliacion\?f=conciliados&amp;desde=2026-09-01&amp;hasta=2026-09-30"[^>]*>Resolver →</);
  });

  it("un renglón por liga con el texto del API y sus DOS enlaces (cargo y vuelo/gasto), con cursor-pointer", async () => {
    preCierre.mockResolvedValueOnce({ periodo: { desde: "2026-09-01", hasta: "2026-09-30" }, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toContain("data-precierre-ligas-usd");
    expect(html).toContain("lejos del oficial [1]");
    expect(html).toContain(`title="${TUBO_LEJOS.titulo}"`);
    const cargo =
      'href="/admin/conciliacion?f=conciliados&amp;cuenta=c0b1e2d3-0000-4000-8000-00000000c0b1&amp;desde=2026-09-01&amp;hasta=2026-09-01"';
    expect(html.split(cargo).length - 1).toBe(2);
    expect(html).toMatch(/class="cursor-pointer[^"]*">Ver el cargo</);
    expect(html).toContain('href="/admin/expenses?desde=2026-09-01&amp;hasta=2026-09-01"');
    expect(html).toContain(">Ver el gasto<");
    expect(html).toContain('href="/admin/flights/7d50c91c-0000-4000-8000-000000000345"');
    expect(html).toContain(">Ver el vuelo #345<");
  });

  it("«y N más…» contra el count del API", async () => {
    const ligas = Array.from({ length: 9 }, (_, i) => liga(i));
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      listo: true,
      items: [item({ count: 11, ligas })],
    });
    const html = await pintar();
    expect(html.split(">Ver el cargo<").length - 1).toBe(8);
    expect(html).toContain("y 3 más…");
  });

  it("count 0 sin lectura fallida ⇒ no se pinta; lectura fallida ⇒ «sin verificar»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      listo: true,
      items: [item({ count: 0, ligas: [] })],
    });
    expect(await pintar()).not.toContain(TITULO);
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
      listo: true,
      items: [item({ count: 0, ligas: [], lectura_fallida: true })],
    });
    const html = await pintar();
    expect(html).toContain(TITULO);
    expect(html).toContain("· sin verificar");
  });
});
