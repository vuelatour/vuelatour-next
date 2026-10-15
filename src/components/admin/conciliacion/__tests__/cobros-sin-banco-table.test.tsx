/**
 * «Cobros sin banco» con cobros PARCIALES (14-oct-2026, API 0.0.78,
 * invariante 77; spec cobros-varios-abonos textos.cobros_sin_banco): la
 * columna «Banco» entre «Método» y «Referencia» (badge ámbar «Parcial» con
 * «Ver abono», o gris «Sin abono»), «Neto esperado» con lo que FALTA y la
 * línea «N con pago parcial…» sobre la tabla. Con un API previo (sin
 * `parcial`) la tabla sale como antes: sin la columna.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CobroSinBanco } from "@/types/conciliacion";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));

const { CobrosSinBancoTable } = await import("../cobros-sin-banco-table");

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MOV_A = "a1700000-0000-4000-8000-00000000000a";

const fila = (over: Partial<CobroSinBanco> = {}): CobroSinBanco => ({
  tipo: "COBRO_VUELO",
  id: "c3150000-0000-4000-8000-000000000315",
  fecha_cobro: "2026-09-15T17:00:00.000Z",
  monto: 3400,
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  comision_banco_monto: null,
  referencia: "SPEI 1",
  vuelo_id: "f3150000-0000-4000-8000-000000000315",
  folio: 315,
  cliente: "Beh Kay",
  metodo_label: "Transferencia",
  neto: 3400,
  parcial: true,
  monto_vinculado: 1700,
  faltante: 1700,
  abonos_n: 1,
  abonos: [{ movimiento_id: MOV_A, fecha: "2026-09-15", monto_parte: 1700 }],
  ...over,
});
const SIN_ABONO = fila({
  id: "c3320000-0000-4000-8000-000000000332",
  folio: 332,
  monto: 977.45,
  neto: 977.45,
  parcial: false,
  monto_vinculado: 0,
  faltante: 977.45,
  abonos_n: 0,
  abonos: [],
});

describe("«Cobros sin banco» con el API 0.0.78", () => {
  it("columna «Banco» antes de «Referencia», «Parcial» con «Ver abono» y «Sin abono»", () => {
    const html = renderToStaticMarkup(<CobrosSinBancoTable rows={[fila(), SIN_ABONO]} />);
    const banco = html.indexOf(">Banco<");
    expect(banco).toBeGreaterThan(html.indexOf(">Método<"));
    expect(banco).toBeLessThan(html.indexOf(">Referencia<"));
    expect(html).toContain(">Parcial<");
    expect(html).toContain(
      `title="${esc("Conciliado $1,700 MXN de $3,400 MXN con 1 abono (15 sep 2026): faltan $1,700 MXN.")}"`,
    );
    expect(html).toContain(`href="/admin/conciliacion?f=conciliados&amp;desde=2026-09-15&amp;hasta=2026-09-15&amp;mov=${MOV_A}"`);
    expect(html).toContain(">Ver abono<");
    expect(html).toContain(">Sin abono<");
    expect(html).toContain('title="Ningún abono del banco vinculado todavía."');
    // «Ver abono» se pulsa: cursor-pointer.
    expect(html).toMatch(/<a[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*>Ver abono<\/a>/);
  });

  it("«Neto esperado» de un parcial y la línea «N con pago parcial…» sobre la tabla", () => {
    const html = renderToStaticMarkup(<CobrosSinBancoTable rows={[fila(), SIN_ABONO]} />);
    expect(html).toContain("$1,700.00 falta (de $3,400.00)");
    expect(html).toContain("1 con pago parcial: un abono cubre solo una parte; el resto sigue pendiente.");
    // El cobro sin abonos: su neto de siempre.
    expect(html).toContain("$977.45");
  });

  it("API previo (sin `parcial`): sin columna «Banco», sin línea, el neto de siempre", () => {
    const previo = { ...fila(), parcial: undefined, monto_vinculado: undefined, faltante: undefined, abonos_n: undefined, abonos: undefined };
    const html = renderToStaticMarkup(<CobrosSinBancoTable rows={[previo]} />);
    expect(html).not.toContain(">Banco<");
    expect(html).not.toContain("con pago parcial");
    expect(html).not.toContain("falta (de");
    expect(html).toContain("$3,400.00");
  });
});
