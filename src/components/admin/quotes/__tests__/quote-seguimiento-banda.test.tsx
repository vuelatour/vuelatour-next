/**
 * BANNER «ajustes pendientes por reflejar en esta cotización» (29-sep-2026).
 *
 * Lo que la oficina anota en «Seguimiento de la cotización» del detalle del
 * vuelo (p. ej. «los pax pidieron transporte, no está cotizado») se grita en
 * el cotizador con una banda ÁMBAR que NO se puede ocultar y que se va SOLA
 * cuando ya no hay pendientes. Con un API previo (sin contadores) no sale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteSeguimientoBanda } from "../quote-seguimiento-banda";
import { bannerSeguimiento } from "@/lib/admin/seguimiento";
import type { SeguimientoPendienteDetalle } from "@/types/seguimiento";

const VUELO = "3a8f1c2d-4b5e-4f60-8a71-92b3c4d5e6f7";

const TRANSPORTE: SeguimientoPendienteDetalle = {
  id: "11111111-1111-4111-8111-111111111111",
  texto: "Los pax pidieron transporte terrestre; no está en la cotización, hay que cobrarlo.",
  created_at: "2026-09-29T19:05:00Z",
  creado_por_nombre: "Itzi",
};
const CATERING: SeguimientoPendienteDetalle = {
  id: "22222222-2222-4222-8222-222222222222",
  texto: "Catering extra para 4 pax.",
  created_at: "2026-09-29T18:00:00Z",
  creado_por_nombre: null,
};

function banda(quote: Parameters<typeof bannerSeguimiento>[0]): string {
  return renderToStaticMarkup(
    <QuoteSeguimientoBanda banner={bannerSeguimiento(quote)} vueloId={VUELO} />,
  );
}

describe("el banner APARECE con pendientes que afectan la cotización", () => {
  const html = banda({
    seguimiento_pendientes: 3,
    seguimiento_cotizacion_pendientes: 2,
    seguimiento_pendientes_detalle: [TRANSPORTE, CATERING],
  });

  it("título con el conteo y los textos de cada ajuste", () => {
    expect(html).toContain("2 ajustes pendientes por reflejar en esta cotización");
    expect(html).toContain("Los pax pidieron transporte terrestre");
    expect(html).toContain("Catering extra para 4 pax.");
    expect(html).toMatch(/Itzi · 29 sept?\.? 2026/);
    expect(html).toMatch(/Alguien · 29 sept?\.? 2026/);
  });

  it("es ámbar, es un aviso (role=status) y NO es plegable ni ocultable", () => {
    expect(html).toContain("data-seguimiento-banda");
    expect(html).toContain('role="status"');
    expect(html).toContain("border-amber-500/50");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<button");
  });

  it("lleva al seguimiento del detalle del vuelo (con cursor-pointer)", () => {
    const liga = html.match(/<a[^>]*>Ver el seguimiento en el vuelo →<\/a>/)?.[0];
    expect(liga).toBeDefined();
    expect(liga).toContain(`href="/admin/flights/${VUELO}#seguimiento-cotizacion"`);
    expect(liga).toContain("cursor-pointer");
  });

  it("singular con uno solo", () => {
    expect(
      banda({ seguimiento_cotizacion_pendientes: 1, seguimiento_pendientes_detalle: [TRANSPORTE] }),
    ).toContain("1 ajuste pendiente por reflejar en esta cotización");
  });

  it("más de los que vinieron en el detalle ⇒ «y N más»", () => {
    const html3 = banda({
      seguimiento_cotizacion_pendientes: 5,
      seguimiento_pendientes_detalle: [TRANSPORTE, CATERING],
    });
    expect(html3).toContain("y 3 más en el detalle del vuelo.");
  });

  it("sin detalle (API que solo manda el conteo) dice cuántos y enlaza, sin «y N más»", () => {
    const html4 = banda({ seguimiento_cotizacion_pendientes: 2 });
    expect(html4).toContain("2 ajustes pendientes por reflejar en esta cotización");
    expect(html4).not.toContain("<ul");
    expect(html4).not.toContain("más en el detalle");
    expect(html4).toContain("Ver el seguimiento en el vuelo →");
  });

  it("una nota larga se recorta y la completa va en el title", () => {
    const larga = { ...TRANSPORTE, texto: "z".repeat(600) };
    const html5 = banda({ seguimiento_cotizacion_pendientes: 1, seguimiento_pendientes_detalle: [larga] });
    expect(html5).toContain(`title="${"z".repeat(600)}"`);
    expect(html5).toContain("…");
  });
});

describe("el banner DESAPARECE", () => {
  it("cuando ya no hay pendientes que afecten la cotización", () => {
    expect(
      banda({
        seguimiento_pendientes: 1,
        seguimiento_cotizacion_pendientes: 0,
        seguimiento_pendientes_detalle: [],
      }),
    ).toBe("");
  });

  it("con un API previo (sin contadores): skew de deploy = sin banner", () => {
    expect(banda({})).toBe("");
    expect(banda({ seguimiento_pendientes_detalle: [TRANSPORTE] })).toBe("");
  });
});

// ---------- Cableado en el workspace de la cotización ----------

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const workspace = leer("../quote-workspace.tsx");
const paginaCotizacion = leer("../../../../app/admin/quotes/[id]/page.tsx");

describe("cableado — la banda va ARRIBA del papel, fuera del cotizador", () => {
  it("el workspace la calcula con la fuente única y la pinta ANTES del QuoteCalculator", () => {
    expect(workspace).toContain(
      "const bannerSeg = bannerSeguimiento(quote, seguimientoRespaldo);",
    );
    const bandaEn = workspace.indexOf(
      "<QuoteSeguimientoBanda banner={bannerSeg} vueloId={quote.id} />",
    );
    const calculadora = workspace.indexOf("<QuoteCalculator");
    expect(bandaEn).toBeGreaterThan(0);
    expect(calculadora).toBeGreaterThan(bandaEn);
    // Nada la condiciona a que la cotización sea editable (el aviso no se esconde).
    expect(workspace).not.toMatch(/editable\s*&&\s*<QuoteSeguimientoBanda/);
  });

  it("la página pasa los contadores del snapshot SOLO como respaldo", () => {
    expect(paginaCotizacion).toMatch(
      /seguimientoRespaldo=\{\s*cobrosVuelo\s*\?\s*\{\s*seguimiento_pendientes: cobrosVuelo\.seguimiento_pendientes,\s*seguimiento_cotizacion_pendientes:\s*cobrosVuelo\.seguimiento_cotizacion_pendientes,/,
    );
  });
});
