/**
 * Gastos «por pagar» (19-oct-2026, API 0.0.95) en las pantallas: la barra de
 * filtros de Gastos (selector «Pago» SOLO con la capacidad; sin ella, la
 * barra de siempre), el renglón BLOQUEANTE del pre-cierre con su «Resolver →»
 * en ámbar y el bloque «Por pagar (aún no sale de la caja)» del detalle del
 * fondo. Render estático de las piezas reales (el runner no tiene DOM).
 */
import type { ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CLASE_FILTRO_ACTIVO } from "@/lib/admin/gastos-vista";

let urlActual = new URLSearchParams();
const apiServer = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => urlActual,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/expenses",
}));
vi.mock("@/lib/api/server", () => ({ apiServer: (...a: unknown[]) => apiServer(...a) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string; title?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/admin/expenses/actions", () => ({ marcarPagadoGastoAction: async () => ({ ok: true }) }));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    id?: string;
    options: { value: string; label: string; description?: string }[];
    value: string | null | undefined;
    placeholder?: string;
    className?: string;
  }) => (
    <button
      type="button"
      id={p.id}
      className={p.className ?? ""}
      data-valor={p.value ?? ""}
      data-opciones={p.options.map((o) => o.label).join("|")}
    >
      {p.options.find((o) => o.value === p.value)?.label ?? p.placeholder}
    </button>
  ),
}));

vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
afterAll(() => vi.useRealTimers());

const { ExpensesFilterBar } = await import("../expenses-filter-bar");
const { PorPagarProvider } = await import("@/components/admin/por-pagar-provider");
const { PreCierreCard } = await import("@/components/admin/reportes/pre-cierre-card");
const { PorPagarCaja } = await import("@/components/admin/caja-chica/por-pagar-caja");

const CAPACIDAD = { habilitado: true, fechaMax: "2026-11-18" };

const barra = (qs: string, capacidad?: typeof CAPACIDAD) => {
  urlActual = new URLSearchParams(qs);
  const b = <ExpensesFilterBar personas={[]} aviones={[]} />;
  return renderToStaticMarkup(capacidad ? <PorPagarProvider capacidad={capacidad}>{b}</PorPagarProvider> : b);
};
const fors = (html: string) => [...html.matchAll(/<label[^>]*for="(gasto-filtro-[^"]+)"/g)].map((m) => m[1]);

describe("barra de filtros de Gastos", () => {
  it("sin capacidad: la barra de SIEMPRE (sin «Pago»), aunque la URL pida `por_pagar=1`", () => {
    for (const qs of ["", "por_pagar=1"]) {
      const html = barra(qs);
      expect(fors(html), qs).not.toContain("gasto-filtro-pago");
      expect(html).not.toContain(">Pago<");
      // `por_pagar` ignorado no cuenta como filtro: sin «Limpiar».
      expect(html).not.toContain(">Limpiar<");
    }
  });

  it("con capacidad: «Pago» tras «Banco» con «Todos | Por pagar»", () => {
    const html = barra("", CAPACIDAD);
    expect(fors(html)).toEqual([
      "gasto-filtro-categoria",
      "gasto-filtro-avion",
      "gasto-filtro-facturacion",
      "gasto-filtro-banco",
      "gasto-filtro-pago",
      "gasto-filtro-medio",
      "gasto-filtro-capturo",
      "gasto-filtro-orden",
    ]);
    const pago = html.match(/<button[^>]*id="gasto-filtro-pago"[^>]*>[^<]*<\/button>/)?.[0] ?? "";
    expect(pago).toContain('data-opciones="Todos|Por pagar"');
    expect(pago).toContain('data-valor=""');
    expect(pago).not.toContain(CLASE_FILTRO_ACTIVO);
  });

  it("con capacidad y `?por_pagar=1`: «Por pagar» elegido, marcado como activo y con «Limpiar»", () => {
    const html = barra("por_pagar=1", CAPACIDAD);
    const pago = html.match(/<button[^>]*id="gasto-filtro-pago"[^>]*>[^<]*<\/button>/)?.[0] ?? "";
    expect(pago).toContain('data-valor="1"');
    expect(pago).toContain(">Por pagar<");
    expect(pago).toContain(CLASE_FILTRO_ACTIVO);
    expect(html).toContain("Limpiar");
  });
});

describe("pre-cierre: «Gastos por pagar sin confirmar» (BLOQUEANTE)", () => {
  const PERIODO = { desde: "2026-10-01", hasta: "2026-10-31" };
  const A = "aaaaaaaa-0000-4000-8000-00000000000a";
  const B = "bbbbbbbb-0000-4000-8000-00000000000b";
  beforeEach(() => apiServer.mockReset());

  const pintar = async (items: unknown[]) => {
    apiServer.mockResolvedValueOnce({ periodo: PERIODO, listo: false, items });
    return renderToStaticMarkup(await PreCierreCard(PERIODO));
  };
  const hrefResolver = (html: string): string | null => {
    const m = /<a href="([^"]*)"[^>]*>Resolver →<\/a>/.exec(html);
    return m ? m[1].replace(/&amp;/g, "&") : null;
  };

  it("«Resolver →» = Gastos «Por pagar» del periodo + el foco ámbar con los `ids`; montos sin sumar monedas", async () => {
    const detalle =
      "2 gasto(s) siguen «por pagar» (1 vencidos): márcalos pagados con la fecha real del pago, o elimínalos si no se pagaron.";
    const html = await pintar([
      {
        clave: "gastos_por_pagar",
        titulo: "Gastos por pagar sin confirmar",
        detalle,
        count: 2,
        monto_mxn: 850,
        monto_usd: 40,
        ids: [A, B],
      },
    ]);
    expect(html).toContain("Gastos por pagar sin confirmar");
    expect(html).toContain(detalle);
    expect(html).toContain("$850 MXN");
    expect(html).toContain("$40 USD");
    const h = hrefResolver(html) as string;
    expect(h.startsWith("/admin/expenses?por_pagar=1&desde=2026-10-01&hasta=2026-10-31&pc=gastos_por_pagar&pcn=2&")).toBe(true);
    expect(new URLSearchParams(h.split("?")[1]).get("ids")).toBe(`${A},${B}`);
  });

  it("lectura caída ⇒ «sin verificar» y el enlace sin foco", async () => {
    const html = await pintar([
      { clave: "gastos_por_pagar", titulo: "Gastos por pagar sin confirmar", detalle: "x", count: 0, lectura_fallida: true },
    ]);
    expect(html).toContain("sin verificar");
    expect(hrefResolver(html)).toBe("/admin/expenses?por_pagar=1&desde=2026-10-01&hasta=2026-10-31");
  });
});

describe("caja chica: «Por pagar (aún no sale de la caja)»", () => {
  it("la lista del API con su chip, concepto, monto, «Marcar pagado» y el total; no toca saldos", () => {
    const html = renderToStaticMarkup(
      <PorPagarCaja
        moneda="MXN"
        total={850}
        versiones={{ "g-1": "2026-10-19T15:00:00.000Z" }}
        items={[
          { id: "g-1", fecha_gasto: "2026-10-20", monto: 500, moneda: "MXN", categoria: "TAXI", concepto: "Taxi al hangar", estado_pago: "POR_PAGAR" },
          { id: "g-2", fecha_gasto: "2026-10-15", monto: 350, moneda: "MXN", categoria: "COMIDA", concepto: null, estado_pago: "VENCIDO" },
        ]}
      />,
    );
    expect(html).toContain("Por pagar (aún no sale de la caja)");
    expect(html).toContain("no cuentan en el saldo ni en lo por reponer hasta marcarlos pagados");
    expect(html.match(/data-por-pagar-item="/g)).toHaveLength(2);
    expect(html).toContain(">Por pagar · 20 oct<");
    expect(html).toContain(">Vencido · 15 oct<");
    expect(html).toContain("Taxi / estacionamiento");
    expect(html).toContain(" · Taxi al hangar");
    expect(html).toContain("$500 MXN");
    expect(html.match(/Marcar pagado/g)?.length).toBe(2);
    expect(html).toContain("2 gastos por pagar");
    expect(html).toContain("$850 MXN");
  });
});
