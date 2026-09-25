/**
 * Cobros que salieron de un ANTICIPO (Ingresos, 24-sep-2026) en las cards de
 * cobros del vuelo y de la cotización:
 *  1. Chip «Del anticipo ING-12» con liga al anticipo en Ingresos.
 *  2. «Eliminar» se llama «Desaplicar» (el monto regresa al saldo del
 *     anticipo) y solo lo ven ADMIN/FACTURACION — los mismos roles que hoy
 *     borran un cobro.
 *  3. Un cobro normal (o un API previo sin el campo) queda EXACTAMENTE como
 *     antes: bote de basura y sin chip.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FlightCobro } from "@/types/flights";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("../cobro-form-sheet", () => ({ CobroFormSheet: () => null }));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => <button>Registrar reembolso</button> }));
vi.mock("@/app/admin/ingresos/actions", () => ({
  anticiposDeClienteAction: async () => ({ ok: true, data: [] }),
  desaplicarAnticipoAction: async () => ({ ok: true }),
  aplicarAnticipoAction: async () => ({ ok: true }),
  vuelosCandidatosAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  deleteCobroAction: async () => ({ ok: true }),
  setFacturaClienteEstatusAction: async () => ({ ok: true }),
  setFacturaClienteFolioAction: async () => ({ ok: true }),
  quitarFacturaClienteAction: async () => ({ ok: true }),
  urlFacturaClienteAction: async () => ({ ok: true, data: "https://x/y" }),
  solicitarFacturaAction: async () => ({ ok: true }),
  retirarSolicitudFacturaAction: async () => ({ ok: true }),
  refrescarComprobanteCobroAction: async () => ({ ok: true }),
  urlComprobanteCobroAction: async () => ({ ok: true, data: "https://x/y" }),
}));
vi.mock("@/app/admin/facturas-emitidas/actions", () => ({
  urlArchivoFacturaAction: async () => ({ ok: true, data: "https://x/y" }),
  refrescarFacturasEmitidasAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/facturas-emitidas-browser", () => ({
  adjuntarComprobanteCobro: async () => ({ ok: false, error: "no aplica" }),
  leerArchivoFactura: async () => ({ ok: false, error: "no aplica" }),
  guardarFacturaEmitida: async () => ({ ok: false, error: "no aplica" }),
  buscarVuelosCandidatos: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));

const { CobrosCard } = await import("../cobros-card");
const { QuoteCobrosCard } = await import("@/components/admin/quotes/quote-cobros-card");

const ANTICIPO_ID = "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const NORMAL: FlightCobro = {
  id: "c-1",
  vuelo_id: "v-1",
  monto: "1000",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "18.5",
  referencia: null,
  fecha_cobro: "2026-09-08T12:00:00-05:00",
  foto_voucher_url: null,
  registrado_por: null,
  notas: null,
  created_at: "2026-09-08T12:00:00-05:00",
  updated_at: "2026-09-08T12:00:00-05:00",
} as FlightCobro;

const DE_ANTICIPO: FlightCobro = {
  ...NORMAL,
  id: "c-2",
  monto: "600",
  notas: "Aplicado del anticipo ING-12",
  conciliado: true,
  conciliado_via: "ANTICIPO",
  anticipo: { ingreso_id: ANTICIPO_ID, etiqueta: "ING-12" },
};

function vuelo(cobros: FlightCobro[], rol: string | null): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-1"
      flightFolio={312}
      flightEstado="CONFIRMADO"
      montoTotalUsd={500}
      pendingUsd={0}
      cobradoUsd={500}
      cobros={cobros}
      rol={rol}
    />,
  );
}

function cotizacion(cobros: FlightCobro[], rol: string | null): string {
  return renderToStaticMarkup(
    <QuoteCobrosCard quoteId="v-1" quoteFolio={312} montoTotalUsd={500} totalCobrado={500} cobros={cobros} rol={rol} />,
  );
}

describe.each([
  ["vuelo", vuelo],
  ["cotización", cotizacion],
] as const)("card de cobros del %s", (_nombre, render) => {
  it("cobro de anticipo: chip con liga al anticipo y «Desaplicar» para FACTURACION", () => {
    const html = render([DE_ANTICIPO], "FACTURACION");
    expect(html).toContain("Del anticipo ING-12");
    expect(html).toContain(`/admin/ingresos?tab=anticipos&amp;ingreso=${ANTICIPO_ID}`);
    expect(html).toContain(">Desaplicar<");
    expect(html).not.toContain("Eliminar cobro");
    // Conciliado vía el anticipo: el chip lo explica.
    expect(html).toContain("conciliado vía el anticipo");
  });

  it("COORDINADOR no desaplica (hoy tampoco borra cobros)", () => {
    const html = render([DE_ANTICIPO], "COORDINADOR");
    expect(html).toContain("Del anticipo ING-12");
    expect(html).not.toContain(">Desaplicar<");
  });

  it("cobro normal / API previo: bote de basura y sin chip, como antes", () => {
    const html = render([NORMAL], "ADMIN");
    expect(html).not.toContain("Del anticipo");
    expect(html).not.toContain(">Desaplicar<");
    expect(html).toMatch(/Eliminar cobro/);
  });
});
