/**
 * Semáforo de facturación en versión COMPACTA (14-oct-2026, tabla única de
 * Gastos): «No requiere» cabe sin ensanchar la columna; el title antepone la
 * etiqueta completa. Sin la prop (Gastos del vuelo) la etiqueta y el title
 * son los de siempre. El disparador lleva la manita.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
}));

const { FacturacionBadge } = await import("../facturacion-badge");

const gasto = (estatus: string) => ({ id: "g-1", estatus_facturacion: estatus }) as Gasto;
const disparador = (html: string) => /<button[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
const TITULO = "Seguimiento de facturación de oficina (no toca el comprobante del piloto). Clic para cambiar.";

describe("FacturacionBadge", () => {
  it("compacta: NO_FACTURABLE se lee «No requiere» y el title empieza con la etiqueta completa", () => {
    const b = disparador(renderToStaticMarkup(<FacturacionBadge gasto={gasto("NO_FACTURABLE")} compacta />));
    expect(b).toMatch(/<\/span>No requiere<\/button>/);
    expect(b).toContain(`title="No requiere factura · ${TITULO}"`);
    expect(b).toMatch(/class="[^"]*cursor-pointer/);
  });

  it("compacta: los otros estados dicen su etiqueta de siempre", () => {
    const b = disparador(renderToStaticMarkup(<FacturacionBadge gasto={gasto("SOLICITADA")} compacta />));
    expect(b).toMatch(/<\/span>Solicitada<\/button>/);
    expect(b).toContain(`title="Solicitada · ${TITULO}"`);
  });

  it("sin compacta: «No requiere factura» y el title de siempre (Gastos del vuelo)", () => {
    const b = disparador(renderToStaticMarkup(<FacturacionBadge gasto={gasto("NO_FACTURABLE")} />));
    expect(b).toMatch(/<\/span>No requiere factura<\/button>/);
    expect(b).toContain(`title="${TITULO}"`);
    expect(b).toMatch(/class="[^"]*cursor-pointer/);
  });

  it("cableado: los renglones del menú con manita y la server action sin lanzar", () => {
    const src = readFileSync(path.resolve(__dirname, "../facturacion-badge.tsx"), "utf8");
    expect(src).toContain('onClick={() => marcar(e.value)} className="cursor-pointer"');
    expect(src).toContain("llamarSinLanzar(() => marcarFacturacionAction(gasto.id, estatus))");
    // flight-gastos-table sigue sin la prop (etiqueta completa).
    const vuelo = readFileSync(path.resolve(__dirname, "../../flights/flight-gastos-table.tsx"), "utf8");
    expect(vuelo).toMatch(/<FacturacionBadge gasto=\{[^}]+\} \/>/);
  });
});
