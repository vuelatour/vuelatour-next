/**
 * Pre-cierre «Movimientos del banco omitidos de la conciliación» (API 0.0.77,
 * invariante 75; INFORMATIVO, no bloquea). El API ya mandaba el renglón y el
 * panel lo pintaba SIN enlace (revisión del 15-oct-2026): ahora lleva
 * «Revisar los omitidos →» a Conciliación → «Omitidos» del periodo, en azul
 * como todo informativo, y la visibilidad de siempre (count 0 ⇒ oculto;
 * lectura fallida ⇒ «sin verificar», jamás un 0 que diga «no hay»).
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31" };
const TITULO = "Movimientos del banco omitidos de la conciliación";
const DETALLE =
  "14 movimientos del banco se marcaron como «no se concilian» con un motivo ($56.84 MXN): revisa en Conciliación → Omitidos que ninguno sea un gasto sin capturar.";

const item = (over: Record<string, unknown> = {}) => ({
  clave: "movimientos_omitidos",
  titulo: TITULO,
  detalle: DETALLE,
  count: 14,
  monto_mxn: 56.84,
  monto_usd: 0,
  informativo: true,
  ...over,
});

const pintar = async () => renderToStaticMarkup(await PreCierreCard(PERIODO));

beforeEach(() => preCierre.mockReset());

describe("pre-cierre: movimientos omitidos de la conciliación", () => {
  it("informativo (azul) con el conteo, el monto, el detalle del API y «Revisar los omitidos →» del periodo", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toContain("Todo en orden");
    expect(html).toContain('aria-label="Informativo"');
    expect(html).toMatch(new RegExp(`${TITULO} <span[^>]*sky[^>]*>· 14</span><span[^>]*> · \\$56\\.84 MXN</span>`));
    expect(html).toContain(DETALLE);
    expect(html).toMatch(
      /href="\/admin\/conciliacion\?f=omitidos&amp;desde=2026-10-01&amp;hasta=2026-10-31"[^>]*>Revisar los omitidos →</,
    );
    // No es «Resolver»: no hay nada pendiente.
    expect(html).not.toContain("Resolver →");
  });

  it("count 0: no se pinta; lectura fallida: «sin verificar» con su enlace (jamás un 0 que diga «no hay»)", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [item({ count: 0, monto_mxn: 0 })] });
    expect(await pintar()).not.toContain(TITULO);
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: true,
      items: [
        item({
          count: 0,
          monto_mxn: 0,
          lectura_fallida: true,
          detalle: "No se pudo leer cuántos movimientos se omitieron.",
        }),
      ],
    });
    const fallida = await pintar();
    expect(fallida).toContain(TITULO);
    expect(fallida).toContain("· sin verificar");
    expect(fallida).toContain("Revisar los omitidos →");
  });

  it("los demás renglones siguen diciendo «Resolver →»", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [item(), { clave: "sin_conciliar", titulo: "Movimientos bancarios sin conciliar", detalle: "x", count: 3 }],
    });
    const html = await pintar();
    // 15-oct-2026 (PEDIDO 2): «Pendientes» del periodo + el foco del pre-cierre.
    expect(html).toMatch(
      /href="\/admin\/conciliacion\?f=pendientes&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;pc=sin_conciliar&amp;[^"]*"[^>]*>Resolver →</,
    );
    expect(html).toContain("Revisar los omitidos →");
  });
});
