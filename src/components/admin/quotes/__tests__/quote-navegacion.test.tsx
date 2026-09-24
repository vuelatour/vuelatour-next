/**
 * FLECHAS «‹ Anterior» / «Siguiente ›» del detalle de una cotización
 * (24-sep-2026, pedido de Itzi). Los textos y la regla de la tecla se prueban
 * en `lib/admin/__tests__/quote-navegacion.test.ts`; aquí se cuida lo que se
 * rompe al mover componentes:
 *  1. el MARCADO de las flechas (liga con los filtros, `replace`, el destino
 *     visible, apagadas con su porqué, sin fecha);
 *  2. el CABLEADO: la lista pasa sus filtros al detalle, el detalle los lee
 *     con la MISMA función, el workspace pinta las flechas en la cabecera y
 *     nadie navega con `router.push` (el guard de cambios sin guardar solo
 *     intercepta `<a href>`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
}));

import { QuoteNavegacion } from "../quote-navegacion";
import type { QuoteVecinos } from "@/types/quote-vecinos";

const ANT = "bbbbbbbb-0000-4000-8000-000000000340";
const SIG = "bbbbbbbb-0000-4000-8000-000000000346";

const VECINOS: QuoteVecinos = {
  anterior: {
    id: ANT,
    folio: 340,
    fecha_vuelo: "2026-09-19T14:00:00+00:00",
    estado: "COTIZADO",
    cliente_nombre: "Punta Pájaros",
  },
  siguiente: {
    id: SIG,
    folio: 346,
    fecha_vuelo: "2026-09-20T20:30:00+00:00",
    estado: "CONFIRMADO",
    cliente_nombre: "Maqar",
  },
  sin_fecha: false,
};

const render = (v: QuoteVecinos, qs = "") =>
  renderToStaticMarkup(<QuoteNavegacion vecinos={v} qs={qs} />);

/** Atributo de la flecha `dir` (el marcado de React escapa `&` como `&amp;`). */
function flecha(html: string, dir: "anterior" | "siguiente"): string {
  const m = html.match(new RegExp(`<(a|span)[^>]*data-flecha="${dir}"[^>]*>`));
  if (!m) throw new Error(`no se encontró la flecha ${dir}`);
  return m[0];
}

describe("QuoteNavegacion · marcado", () => {
  it("las dos flechas son <a href> al vecino CON los filtros de la lista", () => {
    const html = render(VECINOS, "estado=COTIZADO&q=maqar");
    expect(flecha(html, "anterior")).toContain(
      `href="/admin/quotes/${ANT}?estado=COTIZADO&amp;q=maqar"`,
    );
    expect(flecha(html, "siguiente")).toContain(
      `href="/admin/quotes/${SIG}?estado=COTIZADO&amp;q=maqar"`,
    );
    expect(flecha(html, "anterior").startsWith("<a")).toBe(true);
    expect(flecha(html, "siguiente")).toContain("cursor-pointer");
  });

  it("el destino se lee SIN pasar el mouse («#346 · 20 sep») y el tooltip dice el cliente", () => {
    const html = render(VECINOS);
    expect(html).toContain("#346 · 20 sep");
    expect(html).toContain("#340 · 19 sep");
    expect(flecha(html, "siguiente")).toContain(
      'title="Vuelo siguiente: #346 · 20 sep · Maqar"',
    );
    expect(flecha(html, "anterior")).toContain(
      'aria-label="Vuelo anterior: #340 · 19 sep · Punta Pájaros"',
    );
    expect(html).toContain(">Anterior<");
    expect(html).toContain(">Siguiente<");
  });

  it("sin vecino: flecha APAGADA (no es enlace) y dice por qué", () => {
    const html = render({ ...VECINOS, siguiente: null }, "estado=COTIZADO");
    const sig = flecha(html, "siguiente");
    expect(sig.startsWith("<span")).toBe(true);
    expect(sig).not.toContain("href=");
    expect(sig).toContain('aria-disabled="true"');
    expect(sig).toContain("cursor-not-allowed");
    expect(sig).toContain('title="No hay un vuelo siguiente con estos filtros"');
    expect(html).toContain("No hay más");
    // La otra sigue viva.
    expect(flecha(html, "anterior").startsWith("<a")).toBe(true);
  });

  it("cotización SIN fecha: las dos apagadas con «ponle fecha para brincar entre vuelos»", () => {
    const html = render({ anterior: null, siguiente: null, sin_fecha: true });
    for (const dir of ["anterior", "siguiente"] as const) {
      const f = flecha(html, dir);
      expect(f.startsWith("<span")).toBe(true);
      expect(f).toContain(
        'title="Esta cotización no tiene fecha de vuelo: ponle fecha para brincar entre vuelos."',
      );
    }
    expect(html).toContain("Sin fecha");
    expect(html).not.toContain("<a");
  });
});

// ---------------------------------------------------------------------------
// Cableado (se lee la fuente: montar la lista o el workspace exige el API)
// ---------------------------------------------------------------------------

const leer = (...p: string[]) =>
  readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");

describe("QuoteNavegacion · cableado", () => {
  it("la flecha es un <Link replace>, nunca router.push (el guard solo ve <a href>)", () => {
    const src = leer("components", "admin", "quotes", "quote-navegacion.tsx");
    expect(src).toMatch(/<Link[\s\S]{0,120}?replace/);
    // Ninguna LLAMADA (el comentario que lo prohíbe sí puede nombrarlo).
    expect(src).not.toMatch(/router\.(push|replace)\(/);
    expect(src).toContain("router.prefetch(hrefAnterior)");
    expect(src).toContain("router.prefetch(hrefSiguiente)");
  });

  it("la LISTA arma la liga de cada fila con sus filtros (server) y la tabla la usa", () => {
    const pagina = leer("app", "admin", "quotes", "page.tsx");
    expect(pagina).toContain("filtrosListaDeParams(sp)");
    expect(pagina).toContain("href: hrefCotizacion(q.id, qsFiltros)");
    // La lista le pide al API con los MISMOS filtros validados.
    expect(pagina).toContain("q: filtros.q,");
    const tabla = leer("components", "admin", "quotes", "quotes-table.tsx");
    expect(tabla).toContain("rowHref={(q) => q.href}");
    expect(tabla).toContain("<Link href={q.href}");
    expect(tabla).not.toContain("`/admin/quotes/${q.id}`");
  });

  it("el DETALLE lee los filtros con la MISMA función, pide los vecinos degradando y remonta por cotización", () => {
    const detalle = leer("app", "admin", "quotes", "[id]", "page.tsx");
    expect(detalle).toContain("filtrosListaDeParams(sp)");
    expect(detalle).toMatch(/degradado\.opcional\(\s*"la navegación entre cotizaciones"/);
    expect(detalle).toContain("getQuoteVecinos(id, filtrosLista)");
    expect(detalle).toContain("navegacion={{ vecinos, qs: qsLista }}");
    expect(detalle).toContain("key={quote.id}");
  });

  it("el WORKSPACE pinta las flechas junto al regreso, que conserva los filtros", () => {
    const ws = leer("components", "admin", "quotes", "quote-workspace.tsx");
    expect(ws).toContain('<BackLink href={hrefListaCotizaciones(navegacion?.qs ?? "")}>');
    expect(ws).toContain("<QuoteNavegacion vecinos={navegacion.vecinos} qs={navegacion.qs} />");
  });

  it("/revise redirige CONSERVANDO el query string", () => {
    const revise = leer("app", "admin", "quotes", "[id]", "revise", "page.tsx");
    expect(revise).toContain("`/admin/quotes/${id}?${query}`");
  });
});
