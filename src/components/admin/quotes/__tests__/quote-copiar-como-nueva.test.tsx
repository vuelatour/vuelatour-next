import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * «COPIAR COMO NUEVA» EN LA BARRA DE ACCIONES (28-sep-2026).
 *
 * Pedido del cliente: «ya no está la opción de usar de copia la cotización
 * para una nueva; esa función es muy útil, la necesitamos de nuevo». Captura
 * de la #257 (Completado, Cobrado $0): la barra tenía Ver vuelo · PDF · PDF
 * interno · Ajuste rápido y NO copiar — el botón solo existía en la lectura
 * bloqueada (🔒 de la barra del total) y, desde que el 26-sep muchas
 * cotizaciones abren editables, desapareció para ellas.
 *
 * Qué se custodia aquí:
 *  1. el botón sale en TODOS los estados (editable, con cambios, bloqueada,
 *     cancelada, completada) para quien puede CREAR cotizaciones;
 *  2. no sale para SOCIO, FACTURACION ni ANALISTA;
 *  3. el CABLEADO: la barra, el candado y el banner del 409 usan la MISMA
 *     copia (`copiarComoNueva` del cotizador → `urlCopiarComoNueva`). Lo que
 *     LLEVA la copia (tramos, extras, tarifa…) lo congela
 *     `lib/admin/__tests__/quote-copia.test.ts`.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/admin/quotes/actions", () => ({
  cancelQuoteAction: async () => ({ ok: false, error: "mock" }),
  confirmQuoteAction: async () => ({ ok: false, error: "mock" }),
}));
vi.mock("@/lib/api/quotes-browser", () => ({
  abrirPdfCotizacion: async () => {},
  abrirPdfEnPestana: () => {},
}));

import { QuoteActionsBar, type EdicionBarra } from "@/components/admin/quotes/quote-actions-bar";
import type { PersistedQuote } from "@/types/quotes-persisted";

const base = {
  id: "q-257",
  folio: 257,
  estado: "COTIZADO",
  cobrado: false,
  facturado: false,
  fecha_vuelo: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  escalas: [],
};
const quote = (over: Record<string, unknown> = {}) =>
  ({ ...base, ...over }) as unknown as PersistedQuote;

const edicion = (over: Partial<EdicionBarra> = {}): EdicionBarra => ({
  sucio: false,
  canSave: true,
  saving: false,
  versionSiguiente: 3,
  onGuardar: () => {},
  onDescartar: () => {},
  ...over,
});

/** El `<button>` de copiar (o null si no se pintó). */
function botonCopiar(html: string): string | null {
  const m = html.match(/<button(?:(?!<button)[\s\S])*?Copiar como nueva<\/button>/);
  return m ? m[0] : null;
}

const copiar = () => {};

describe("«Copiar como nueva» en la barra de acciones — en TODOS los estados", () => {
  it("editable sin cambios (ADMIN)", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote()}
        rol="ADMIN"
        edicion={edicion()}
        onAjusteRapido={() => {}}
        onCopiarComoNueva={copiar}
      />,
    );
    const btn = botonCopiar(html);
    expect(btn, "el botón de copiar existe").not.toBeNull();
    expect(btn).not.toMatch(/\sdisabled=""/);
    expect(btn).toContain("cursor-pointer");
    // Texto visible + tooltip que dice qué hace (y que la original no se toca).
    expect(btn).toContain(
      'title="Crea una cotización nueva con estos mismos tramos, extras y tarifa, sin fecha ni cobros. Esta no se toca."',
    );
    // Convive con lo de siempre.
    expect(html).toContain("Ajuste rápido");
    expect(html).toContain("PDF interno");
  });

  it("editable CON cambios sin guardar: sigue ahí junto a Descartar / Guardar", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote()}
        rol="COORDINADOR"
        edicion={edicion({ sucio: true })}
        onCopiarComoNueva={copiar}
      />,
    );
    expect(botonCopiar(html)).not.toBeNull();
    expect(html).toContain("Guardar → v3");
    expect(html).toContain("Descartar");
  });

  it("BLOQUEADA por cobro (sin edición): el botón sale junto al candado", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote({ estado: "CONFIRMADO", cobrado: true })}
        rol="ADMIN"
        cobrosInfo={{ totalCobrado: 600 }}
        onCopiarComoNueva={copiar}
      />,
    );
    expect(html).toContain("Bloqueada · vuelo cobrado");
    expect(botonCopiar(html)).not.toBeNull();
  });

  it("#257 COMPLETADO, cobrado $0 (la captura del cliente)", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote({ estado: "COMPLETADO", fecha_vuelo: "2026-09-10T15:00:00Z" })}
        rol="ADMIN"
        edicion={edicion()}
        onAjusteRapido={() => {}}
        onCopiarComoNueva={copiar}
      />,
    );
    expect(html).toContain("Ver vuelo");
    expect(html).toContain("Ajuste rápido");
    expect(botonCopiar(html)).not.toBeNull();
  });

  it("CANCELADA y en SOLICITUD también", () => {
    for (const estado of ["CANCELADO", "SOLICITUD", "RESERVA", "EN_VUELO"]) {
      const html = renderToStaticMarkup(
        <QuoteActionsBar quote={quote({ estado })} rol="ADMIN" onCopiarComoNueva={copiar} />,
      );
      expect(botonCopiar(html), estado).not.toBeNull();
    }
  });

  it("antes de que el cotizador reporte su estado, el botón va deshabilitado (no miente)", () => {
    const html = renderToStaticMarkup(<QuoteActionsBar quote={quote()} rol="ADMIN" />);
    expect(botonCopiar(html)).toMatch(/\sdisabled=""/);
  });

  it("mientras se GUARDA va deshabilitado (no se sale a la copia a medio guardado)", () => {
    const html = renderToStaticMarkup(
      <QuoteActionsBar
        quote={quote()}
        rol="ADMIN"
        edicion={edicion({ sucio: true, saving: true })}
        onCopiarComoNueva={copiar}
      />,
    );
    expect(botonCopiar(html)).toMatch(/\sdisabled=""/);
  });
});

describe("«Copiar como nueva» — solo quien puede CREAR cotizaciones", () => {
  it("no aparece a SOCIO, FACTURACION ni ANALISTA (ni editable ni bloqueada)", () => {
    for (const rol of ["SOCIO", "FACTURACION", "ANALISTA"]) {
      const editable = renderToStaticMarkup(
        <QuoteActionsBar quote={quote()} rol={rol} edicion={edicion()} onCopiarComoNueva={copiar} />,
      );
      const bloqueada = renderToStaticMarkup(
        <QuoteActionsBar
          quote={quote({ estado: "COMPLETADO", cobrado: true })}
          rol={rol}
          cobrosInfo={{ totalCobrado: 600 }}
          onCopiarComoNueva={copiar}
        />,
      );
      expect(botonCopiar(editable), `${rol} editable`).toBeNull();
      expect(botonCopiar(bloqueada), `${rol} bloqueada`).toBeNull();
      expect(editable).not.toContain("Copiar como nueva");
      // La barra sí se pintó (el PDF del cliente no se gatea).
      expect(editable).toContain("PDF");
    }
  });

  it("ADMIN y COORDINADOR sí", () => {
    for (const rol of ["ADMIN", "COORDINADOR"]) {
      const html = renderToStaticMarkup(
        <QuoteActionsBar quote={quote()} rol={rol} onCopiarComoNueva={copiar} />,
      );
      expect(botonCopiar(html), rol).not.toBeNull();
    }
  });
});

// ---------- Cableado: UNA sola copia para los tres botones ----------

const leer = (archivo: string) =>
  readFileSync(path.resolve(__dirname, "..", archivo), "utf8");
const calculadora = leer("quote-calculator.tsx");
const workspace = leer("quote-workspace.tsx");

describe("cableado — la barra, el candado y el banner del 409 copian IGUAL", () => {
  it("la copia sale de la fuente única con lo que hay en pantalla (getValues)", () => {
    expect(calculadora).toContain('from "@/lib/admin/quote-copia"');
    expect(calculadora).toMatch(/router\.push\(\s*urlCopiarComoNueva\(getValues\(\), \{/);
    // El formato del borrador ya no vive duplicado en el cotizador.
    expect(calculadora).not.toMatch(/function encodeDraft|function decodeDraft|const DRAFT_PARAM/);
    expect(calculadora).toContain("decodificarBorrador(raw)");
    expect(calculadora).toContain("codificarBorrador(debounced)");
  });

  it("con cambios sin guardar PREGUNTA antes de salir; sin cambios copia directo", () => {
    expect(calculadora).toMatch(
      /const copiarComoNueva = \(\) => \{\s*if \(!puedeCopiar\) return;[\s\S]*?if \(saving\) return;\s*if \(sucio\) \{\s*setConfirmCopiarOpen\(true\);\s*return;\s*\}\s*irACopia\(false\);/,
    );
    expect(calculadora).toContain("irACopia(true);");
    expect(calculadora).toContain("¿Copiar con tus cambios sin guardar?");
  });

  it("el cotizador reporta la copia a la barra y el candado usa la MISMA función", () => {
    expect(calculadora).toContain(
      "copiarComoNueva: () => accionesRef.current.copiarComoNueva(),",
    );
    expect(calculadora).toContain(
      "onCopiar={lectura && puedeCopiar ? copiarComoNueva : undefined}",
    );
  });

  it("el workspace la pasa a la barra SIN condicionarla a que sea editable", () => {
    expect(workspace).toContain(
      "onCopiarComoNueva={edicion ? () => edicion.copiarComoNueva() : undefined}",
    );
    expect(workspace).not.toMatch(/onCopiarComoNueva=\{editable/);
  });
});
