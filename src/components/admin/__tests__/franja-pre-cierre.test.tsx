/**
 * Franja ámbar del «Resolver →» del pre-cierre (PEDIDO 2, 15-oct-2026):
 * título, detalle, nota de la vista, conteo exacto, «Volver al pre-cierre →»
 * y «Quitar resaltado» (los dos con `cursor-pointer`), `role="status"` y el
 * atributo de prueba con la clave.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

const { FranjaPreCierre } = await import("@/components/admin/franja-pre-cierre");
const { NOTA_VISTA_MES } = await import("@/lib/admin/pre-cierre-resolver");

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";

const pintar = (over: Record<string, unknown> = {}, encontrados: number | null = 1, notaVista?: string) =>
  renderToStaticMarkup(
    <FranjaPreCierre
      foco={{
        clave: "gastos_sin_avion",
        ids: [A, B],
        count: 2,
        titulo: "Gastos sin avión asignado (bandeja)",
        detalle: "Asigna el avión o repártelo.",
        periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
        truncado: false,
        ...over,
      }}
      encontrados={encontrados}
      hrefQuitar="/admin/expenses?f=pendientes"
      hrefVolver="/admin/reportes?desde=2026-09-01&hasta=2026-09-30#pre-cierre"
      notaVista={notaVista}
    />,
  );

describe("FranjaPreCierre", () => {
  it("título, detalle, conteo y los dos enlaces", () => {
    const html = pintar();
    expect(html).toContain('role="status"');
    expect(html).toContain('data-franja-pre-cierre="gastos_sin_avion"');
    expect(html).toContain("Del pre-cierre: Gastos sin avión asignado (bandeja)");
    expect(html).toContain("Asigna el avión o repártelo.");
    expect(html).toContain(
      "<span data-conteo=\"\">2 por resolver · 1 en esta vista · 1 ya no está en esta vista (quizá ya se resolvió)</span>",
    );
    expect(html).toMatch(
      /<a href="\/admin\/reportes\?desde=2026-09-01&amp;hasta=2026-09-30#pre-cierre" class="cursor-pointer[^"]*">Volver al pre-cierre →<\/a>/,
    );
    expect(html).toMatch(/<a href="\/admin\/expenses\?f=pendientes" class="cursor-pointer[^"]*">Quitar resaltado<\/a>/);
    expect(html).toContain("border-amber-500/40 bg-amber-500/10");
  });

  it("sin título ⇒ el genérico; sin detalle no hay párrafo; con nota de vista, la nota", () => {
    const html = pintar({ titulo: null, detalle: null }, 2, NOTA_VISTA_MES);
    expect(html).toContain("Del pre-cierre: Pendiente del pre-cierre");
    expect(html).not.toContain("Asigna el avión");
    expect(html).toContain(NOTA_VISTA_MES);
    expect(html).toContain("2 por resolver · 2 en esta vista");
  });

  it("encontrados null (pantalla sin lista) ⇒ solo «N por resolver»", () => {
    expect(pintar({}, null)).toContain('<span data-conteo="">2 por resolver</span>');
  });

  it("el texto del API se pinta como TEXTO, nunca como HTML", () => {
    const html = pintar({ titulo: "<b>hola</b>" });
    expect(html).toContain("&lt;b&gt;hola&lt;/b&gt;");
    expect(html).not.toContain("<b>hola</b>");
  });
});
