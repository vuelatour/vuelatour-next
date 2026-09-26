import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * COTIZACIÓN COBRADA · PERMISO ESPECIAL POR PERSONA (26-sep-2026, API 0.0.37).
 *
 * La barra de acciones y el resumen del diálogo «Guardar vN». La pantalla del
 * cotizador entera (chip + banda + lectura) está en
 * `quote-pantalla-completa.test.tsx` («cotización cobrada · permiso
 * especial»); aquí va lo que ese test no monta.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/quotes/actions", () => ({
  cancelQuoteAction: async () => ({ ok: false, error: "mock" }),
  confirmQuoteAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/lib/api/quotes-browser", () => ({
  abrirPdfCotizacion: async () => {},
  abrirPdfEnPestana: () => {},
}));

import { QuoteActionsBar } from "@/components/admin/quotes/quote-actions-bar";
import { ResumenGuardadoConCobros } from "@/components/admin/quotes/quote-resumen-guardado-cobros";
import type { PersistedQuote } from "@/types/quotes-persisted";

const quote = {
  id: "q-317",
  folio: 317,
  estado: "CONFIRMADO",
  cobrado: true,
  facturado: false,
  fecha_vuelo: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  escalas: [],
} as unknown as PersistedQuote;

describe("barra de acciones", () => {
  it("sin permiso: «Bloqueada · vuelo cobrado» con la razón que nombra a quién puede editarla", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote}
        rol="ADMIN"
        cobrosInfo={{
          totalCobrado: 600,
          puedeEditarCobrada: false,
          editoresCobrada: ["Alejandro Canales", "Pablo Canales"],
        }}
      />,
    );
    expect(html).toContain("Bloqueada · vuelo cobrado");
    expect(html).toContain("Solo pueden editarla: Alejandro Canales, Pablo Canales.");
  });

  it("sin permiso y mes cerrado: el diálogo NO manda a pedírsela a los editores", () => {
    const viejo = {
      ...quote,
      fecha_vuelo: new Date(Date.now() - 120 * 86_400_000).toISOString(),
    } as PersistedQuote;
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={viejo}
        rol="ADMIN"
        cobrosInfo={{
          totalCobrado: 600,
          puedeEditarCobrada: false,
          editoresCobrada: ["Alejandro Canales", "Pablo Canales"],
        }}
      />,
    );
    expect(html).toContain("Bloqueada · vuelo cobrado");
    expect(html).not.toContain("Solo pueden editarla");
    expect(html).not.toContain("Pídeles la corrección");
  });

  it("con permiso: el candado desaparece (la barra del total pinta el chip ámbar)", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote}
        rol="ADMIN"
        cobrosInfo={{ totalCobrado: 600, puedeEditarCobrada: true }}
      />,
    );
    expect(html).not.toContain("Bloqueada · vuelo cobrado");
  });

  it("API previo (sin permiso ni nombres): todo como hoy", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar quote={quote} rol="ADMIN" cobrosInfo={{ totalCobrado: 600 }} />,
    );
    expect(html).toContain("Bloqueada · vuelo cobrado");
    expect(html).not.toContain("Solo pueden editarla");
  });
});

describe("«Guardar vN» con cobros: antes → después y saldo", () => {
  it("#317 sin IVA: $754 → $600 y queda liquidada", () => {
    const html = renderToStaticMarkup(
      <ResumenGuardadoConCobros totalAntesUsd={754} totalNuevoUsd={600} cobradoUsd={600} />,
    );
    expect(html).toContain("Total $754 → $600 USD");
    expect(html).toContain("Cobrado $600 USD (no cambia)");
    expect(html).toContain("Saldo nuevo $0 USD · liquidada");
    expect(html).not.toContain("sobrecobro");
  });

  it("sobrecobro en rojo con qué hacer (reembolso), nunca «otro ingreso»", () => {
    const html = renderToStaticMarkup(
      <ResumenGuardadoConCobros totalAntesUsd={600} totalNuevoUsd={500} cobradoUsd={600} />,
    );
    expect(html).toContain("Sobrecobro $100 USD");
    expect(html).toMatch(/text-destructive[^>]*>Sobrecobro \$100 USD/);
    expect(html).toContain("regístrala como reembolso");
  });

  it("saldo pendiente y cobros MXN sin T.C. avisados", () => {
    const html = renderToStaticMarkup(
      <ResumenGuardadoConCobros
        totalAntesUsd={754}
        totalNuevoUsd={754}
        cobradoUsd={600}
        cobrosSinTc={1}
      />,
    );
    expect(html).toContain("Total $754 USD (sin cambio)");
    expect(html).toContain("Saldo nuevo $154 USD");
    expect(html).toContain("Hay 1 cobro en MXN sin tipo de cambio");
  });
});
