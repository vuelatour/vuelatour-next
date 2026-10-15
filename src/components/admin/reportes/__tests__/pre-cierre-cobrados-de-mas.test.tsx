/**
 * Pre-cierre «Vuelos cobrados de más» (14-oct-2026, API 0.0.78, invariante 77;
 * NO bloquea) y los cobros PARCIALES de «Cobros bancarios sin conciliar».
 * Agosto 2026 de prod: #217 y #193 con IVA no cotizado (cuentan) y #111
 * explicado por redondeo del T.C. (línea gris). Los chips salen con el
 * renderizador genérico (`saldo_usd` = el excedente) + el sufijo de la causa;
 * «Resolver →» a los vuelos del periodo; un renglón en 0 no se pinta.
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

const PERIODO = { desde: "2026-08-01", hasta: "2026-08-31" };
const TITULO = "Vuelos cobrados de más";
const DETALLE =
  "Lo cobrado rebasa el total del vuelo por más de $1.00 USD y la diferencia no se explica sola: IVA que la cotización no lleva, un cobro capturado dos veces o un depósito de otro vuelo. Revisa la card de cobros de cada vuelo. No bloquea el cierre, pero el excedente se reparte como ingreso de VuelaTour. Además hay 1 vuelo con la diferencia explicada (comisión del link pagada por el cliente o redondeo del tipo de cambio) que no requiere acción.";

const chip = (id: string, folio: number, excedente: number, causa: string, causa_etiqueta: string) => ({
  id,
  folio,
  saldo_usd: excedente,
  excedente_usd: excedente,
  causa,
  causa_etiqueta,
  grupo_folio: null,
});

const item = (over: Record<string, unknown> = {}) => ({
  clave: "vuelos_cobrados_de_mas",
  titulo: TITULO,
  detalle: DETALLE,
  count: 2,
  monto_usd: 547.99,
  vuelos: [
    chip("v-193", 193, 52, "IVA_NO_COTIZADO", "IVA que la cotización no lleva"),
    chip("v-217", 217, 495.99, "IVA_NO_COTIZADO", "IVA que la cotización no lleva"),
  ],
  explicados: [chip("v-111", 111, 1.71, "REDONDEO_TC", "redondeo del tipo de cambio")],
  explicados_n: 1,
  ...over,
});

const pintar = async () => renderToStaticMarkup(await PreCierreCard(PERIODO));

beforeEach(() => preCierre.mockReset());

describe("pre-cierre: vuelos cobrados de más", () => {
  it("renglón con el conteo, el monto, el detalle del API, chips con la causa y «Resolver →» del periodo", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toContain(TITULO);
    expect(html).toContain("· 2");
    expect(html).toContain("$547.99 USD");
    expect(html).toContain(DETALLE);
    expect(html).toContain(">#193 ($52) · IVA</a>");
    expect(html).toContain(">#217 ($495.99) · IVA</a>");
    expect(html).toContain('href="/admin/flights/v-217"');
    expect(html).toContain('title="Posible causa: IVA que la cotización no lleva. Revisa la card de cobros del vuelo."');
    expect(html).toMatch(/href="\/admin\/flights\?desde=2026-08-01&amp;hasta=2026-08-31"[^>]*>Resolver →</);
  });

  it("los explicados van en una línea gris y no son chips", async () => {
    preCierre.mockResolvedValueOnce({ periodo: PERIODO, listo: true, items: [item()] });
    const html = await pintar();
    expect(html).toMatch(
      /<p class="text-\[11px\] text-muted-foreground mt-1" data-precierre-explicados="true">Además: #111 \(redondeo del tipo de cambio\) no requiere acción\.<\/p>/,
    );
    expect(html).not.toContain('href="/admin/flights/v-111"');
  });

  it("count 0 (solo explicados): el renglón no se pinta", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: { desde: "2026-07-01", hasta: "2026-07-31" },
      listo: true,
      items: [item({ count: 0, monto_usd: 0, vuelos: [] })],
    });
    expect(await pintar()).not.toContain(TITULO);
  });
});

describe("pre-cierre: cobros bancarios sin conciliar con PARCIALES", () => {
  const sinBanco = (cobros: unknown[], parciales = 0) => ({
    clave: "cobros_bancarios_sin_conciliar",
    titulo: "Cobros bancarios sin conciliar al corte",
    detalle: "Transferencia, HSBC link, cheque o Paywise sin cruzar con ningún abono importado…",
    count: cobros.length,
    cobros,
    por_moneda: [],
    paywise: 0,
    parciales,
  });

  it("el chip «#315 · parcial · faltan $1,700 MXN» de cada parcial", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [
        sinBanco(
          [
            { tipo: "COBRO_VUELO", id: "c-315", folio: 315, moneda: "MXN", monto: 3400, parcial: true, faltante: 1700, monto_vinculado: 1700 },
            { tipo: "COBRO_VUELO", id: "c-383", folio: 383, moneda: "MXN", monto: 5000, parcial: false, faltante: 5000, monto_vinculado: 0 },
          ],
          1,
        ),
      ],
    });
    const html = await pintar();
    expect(html).toContain("data-precierre-parciales");
    expect(html).toContain(">#315 · parcial · faltan $1,700 MXN</span>");
    expect(html).not.toContain("#383 · parcial");
  });

  it("sin parciales (o un API previo sin el campo): ninguna línea nueva", async () => {
    preCierre.mockResolvedValueOnce({
      periodo: PERIODO,
      listo: false,
      items: [sinBanco([{ tipo: "COBRO_VUELO", id: "c-383", folio: 383, moneda: "MXN", monto: 5000 }])],
    });
    expect(await pintar()).not.toContain("data-precierre-parciales");
  });
});
