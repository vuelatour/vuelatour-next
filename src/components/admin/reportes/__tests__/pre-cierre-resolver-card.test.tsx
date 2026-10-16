/**
 * La card del pre-cierre arma «Resolver →» CON FOCO (PEDIDO 2, 15-oct-2026):
 * la pantalla de siempre + `pc`/`pcn`/`pcp`/`pct`/`pcd`/`ids` para que la
 * pantalla destino pinte en ámbar lo que hay que resolver. API simulado.
 * Congela: ids del API, API previo sin ids, ids derivados de `vuelos[]`, el
 * tope de 100, los informativos intactos, los retirados sin enlace, cada
 * destino (los nuevos incluidos) y el ancla `#pre-cierre` en las tres caras.
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
const { PreCierreCardCargando } = await import("@/components/admin/reportes/pre-cierre-card-cargando");

const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

const pintar = async (items: unknown[]) => {
  preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: false, items });
  return renderToStaticMarkup(await PreCierreCard(PERIODO));
};

/** El href (decodificado del HTML) del «Resolver →» del ÚNICO renglón pintado. */
const hrefResolver = (html: string): string | null => {
  const m = /<a href="([^"]*)"[^>]*>Resolver →<\/a>/.exec(html);
  return m ? m[1].replace(/&amp;/g, "&") : null;
};
const params = (href: string) => new URLSearchParams(href.slice(href.indexOf("?") + 1).split("#")[0]);

const item = (clave: string, over: Record<string, unknown> = {}) => ({
  clave,
  titulo: `Título de ${clave}`,
  detalle: `Detalle de ${clave}`,
  count: 2,
  ...over,
});

beforeEach(() => preCierre.mockReset());

describe("«Resolver →» con foco", () => {
  it("renglón con `ids` del API ⇒ destino de siempre + pc, pcn, pcp, pct, pcd e ids", async () => {
    const h = hrefResolver(await pintar([item("gastos_sin_avion", { ids: [A, B] })]));
    expect(h).toBe(
      `/admin/expenses?f=pendientes&desde=2026-09-01&hasta=2026-09-30&pc=gastos_sin_avion&pcn=2&pcp=2026-09-01,2026-09-30&pct=T%C3%ADtulo%20de%20gastos_sin_avion&pcd=Detalle%20de%20gastos_sin_avion&ids=${A},${B}`,
    );
  });

  it("API previo (sin `ids`) ⇒ pc + pcn, SIN ids", async () => {
    const h = hrefResolver(await pintar([item("gastos_sin_tc")])) as string;
    expect(h.startsWith("/admin/expenses?desde=2026-09-01&hasta=2026-09-30&pc=gastos_sin_tc&pcn=2&")).toBe(true);
    expect(params(h).has("ids")).toBe(false);
  });

  it("`vuelos[]` ⇒ ids derivados de cada vuelo", async () => {
    const h = hrefResolver(
      await pintar([item("vuelos_sin_completar", { vuelos: [{ id: A, folio: 1 }, { id: B, folio: 2 }] })]),
    ) as string;
    expect(h.startsWith("/admin/flights?desde=2026-09-01&hasta=2026-09-30&pc=vuelos_sin_completar&")).toBe(true);
    expect(params(h).get("ids")).toBe(`${A},${B}`);
  });

  it("101 ids ⇒ solo el conteo (sin ids); 100 sí viajan", async () => {
    const cien = Array.from({ length: 100 }, (_, i) => uuid(i + 1));
    const h100 = hrefResolver(await pintar([item("sin_conciliar", { count: 100, ids: cien })])) as string;
    expect(params(h100).get("ids")?.split(",")).toHaveLength(100);
    const h101 = hrefResolver(
      await pintar([item("sin_conciliar", { count: 101, ids: [...cien, uuid(101)] })]),
    ) as string;
    expect(params(h101).has("ids")).toBe(false);
    expect(params(h101).get("pcn")).toBe("101");
  });

  it("informativo ⇒ su enlace intacto (sin foco)", async () => {
    const html = await pintar([item("movimientos_omitidos", { informativo: true, count: 14, ids: [A] })]);
    expect(html).toMatch(
      /href="\/admin\/conciliacion\?f=omitidos&amp;desde=2026-09-01&amp;hasta=2026-09-30"[^>]*>Revisar los omitidos →</,
    );
    expect(html).not.toContain("pc=");
  });

  it("renglones retirados (API previo) sin «Resolver →»", async () => {
    expect(hrefResolver(await pintar([item("pistas_sin_gasto")]))).toBeNull();
    expect(hrefResolver(await pintar([item("tua_cobrada_sin_pagada")]))).toBeNull();
  });
});

describe("destino de cada renglón (lo que va antes de `pc=`)", () => {
  const casos: Array<[string, string]> = [
    ["vuelos_sin_completar", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["tacos_en_revision", "/admin/taco-live"],
    ["cobros_pendientes", "/admin/flights?cobro=POR_COBRAR&desde=2026-09-01&hasta=2026-09-30"],
    ["cobros_sin_tc", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["vuelos_cobrados_de_mas", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["externos_sin_honorario", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["fechas_tramos_incoherentes", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["vuelos_sin_gasto_operaciones", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["seguimiento_cotizacion_pendiente", "/admin/flights?desde=2026-09-01&hasta=2026-09-30"],
    ["vuelos_sin_precio", "/admin/quotes?desde=2026-09-01&hasta=2026-09-30"],
    ["extras_sin_desglose", "/admin/quotes?desde=2026-09-01&hasta=2026-09-30"],
    // Decisión D2: los dos renglones inversos se corrigen en la COTIZACIÓN.
    ["tua_pagada_sin_cobrar", "/admin/quotes?desde=2026-09-01&hasta=2026-09-30"],
    ["transporte_pagado_sin_cotizar", "/admin/quotes?desde=2026-09-01&hasta=2026-09-30"],
    ["gastos_sin_avion", "/admin/expenses?f=pendientes&desde=2026-09-01&hasta=2026-09-30"],
    ["permisos_sin_avion", "/admin/expenses?categoria=PERMISO&desde=2026-09-01&hasta=2026-09-30"],
    ["gastos_sin_tc", "/admin/expenses?desde=2026-09-01&hasta=2026-09-30"],
    ["matricula_recibo_distinta", "/admin/expenses?desde=2026-09-01&hasta=2026-09-30"],
    ["gastos_sin_comprobante", "/admin/expenses?facturacion=NO_FACTURADA&desde=2026-09-01&hasta=2026-09-30"],
    ["duplicados_sin_resolver", "/admin/expenses?f=duplicados&desde=2026-09-01&hasta=2026-09-30"],
    ["fijos_con_avion", "/admin/expenses?categoria=FIJO&desde=2026-09-01&hasta=2026-09-30"],
    ["combustible_sin_avion", "/admin/combustibles?mes=2026-09"],
    ["repartos_incoherentes", "/admin/otros-gastos?mes=2026-09"],
    ["sin_conciliar", "/admin/conciliacion?f=pendientes&desde=2026-09-01&hasta=2026-09-30"],
    ["gastos_bancarios_sin_conciliar", "/admin/conciliacion?f=sin_banco&desde=2026-09-01&hasta=2026-09-30"],
    ["cobros_bancarios_sin_conciliar", "/admin/conciliacion?f=cobros_sin_banco&desde=2026-09-01&hasta=2026-09-30"],
    ["gastos_usd_tc_fuera_de_lugar", "/admin/conciliacion?f=conciliados&desde=2026-09-01&hasta=2026-09-30"],
    ["grupo_con_saldo", "/admin/quotes/grupo?desde=2026-09-01&hasta=2026-09-30"],
    ["sobres_descuadrados", "/admin/quotes/grupo?desde=2026-09-01&hasta=2026-09-30"],
    ["socios_por_entregar", "/admin/profit-sharing/socios"],
    ["socios_adelantados", "/admin/profit-sharing/socios"],
  ];

  it.each(casos)("%s ⇒ %s", async (clave, destino) => {
    const h = hrefResolver(await pintar([item(clave)])) as string;
    const sep = destino.includes("?") ? "&" : "?";
    expect(h.startsWith(`${destino}${sep}pc=${clave}&`)).toBe(true);
  });

  it("vuelos cobrados sin factura ⇒ Facturas emitidas, el foco ANTES de `#por-facturar`", async () => {
    const h = hrefResolver(
      await pintar([item("vuelos_cobrados_sin_factura", { count: 1, vuelos: [{ id: A, folio: 341, cuentas: ["HSBC"] }] })]),
    ) as string;
    expect(h.startsWith("/admin/facturas-emitidas?pc=vuelos_cobrados_sin_factura&")).toBe(true);
    expect(h.endsWith(`&ids=${A}#por-facturar`)).toBe(true);
  });

  it("socios ⇒ ids de `socios[].socio.id`; grupos ⇒ `grupos[].grupo_id`; ligas ⇒ el cargo", async () => {
    const hs = hrefResolver(
      await pintar([item("socios_por_entregar", { count: 1, socios: [{ socio: { id: A, nombre: "Hernán" }, por_entregar_usd: 10 }] })]),
    ) as string;
    expect(params(hs).get("ids")).toBe(A);
    const hg = hrefResolver(
      await pintar([
        item("grupo_con_saldo", {
          count: 1,
          grupos: [{ grupo_id: B, grupo_folio: 3, nombre: null, aviones: 2, total_usd: 1, cobrado_usd: 0, saldo_usd: 1 }],
        }),
      ]),
    ) as string;
    expect(params(hg).get("ids")).toBe(B);
  });
});

describe("ancla `#pre-cierre` en las tres caras de la card", () => {
  it("lista, error y esqueleto", async () => {
    const lista = await pintar([item("gastos_sin_avion")]);
    const ANCLA = /<div(?=[^>]*id="pre-cierre")(?=[^>]*scroll-mt-24)[^>]*>/;
    expect(lista).toMatch(ANCLA);
    preCierre.mockRejectedValueOnce(new Error("502"));
    const error = renderToStaticMarkup(await PreCierreCard(PERIODO));
    expect(error).toContain("No se pudo verificar el pre-cierre");
    expect(error).toMatch(ANCLA);
    const cargando = renderToStaticMarkup(<PreCierreCardCargando />);
    expect(cargando).toMatch(ANCLA);
  });

  it("«Resolver →» lleva cursor-pointer", async () => {
    expect(await pintar([item("gastos_sin_avion")])).toMatch(/<a(?=[^>]*cursor-pointer)[^>]*>Resolver →/);
  });
});
