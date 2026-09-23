/**
 * FACTURA DEL SERVICIO en la card «Cobro» (22-sep-2026, pedido del cliente:
 * «agregar por cada vuelo las opciones para identificar vuelos facturado, sin
 * factura, factura elaborada y enviada, y que pueda yo también subir la
 * factura del servicio a un lado»).
 *
 * Los textos y la tolerancia se prueban en
 * `lib/admin/__tests__/factura-cliente.test.ts`; aquí se cuida el CABLEADO:
 *
 *  1. Con el API SIN el bloque (deploy en dos tiempos) la card se comporta
 *     EXACTAMENTE como antes: badge «Sin factura» / «Facturado» y NINGÚN
 *     control —ofrecer un selector que el backend rechazaría con 404 sería
 *     prometer algo que no existe.
 *  2. Con el bloque aparece el estatus de tres opciones y «Subir factura».
 *  3. Con CFDI timbrado el selector NO se monta y se explica por qué (el API
 *     responde 409 VUELO_CON_CFDI: esconder el motivo dejaría al operador
 *     peleándose con un error).
 *  4. Sin permiso (rol que no factura) se lee, no se edita.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FacturaClienteBloque, FlightCobro } from "@/types/flights";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("../cobro-form-sheet", () => ({ CobroFormSheet: () => null }));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => null }));
vi.mock("@/app/admin/flights/actions", () => ({
  deleteCobroAction: async () => ({ ok: true }),
  setFacturaClienteEstatusAction: async () => ({ ok: true }),
  subirFacturaClienteAction: async () => ({ ok: true }),
  quitarFacturaClienteAction: async () => ({ ok: true }),
  urlFacturaClienteAction: async () => ({ ok: true, data: "https://x/y" }),
}));

const { CobrosCard } = await import("../cobros-card");

const COBROS: FlightCobro[] = [];

function render(props: {
  facturado?: boolean;
  facturaCliente?: FacturaClienteBloque | null;
  puedeFacturar?: boolean;
}): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-1"
      flightFolio={232}
      flightEstado="COMPLETADO"
      montoTotalUsd={3500}
      pendingUsd={3500}
      cobradoUsd={0}
      cobros={COBROS}
      {...props}
    />,
  );
}

describe("CobrosCard · factura del servicio", () => {
  it("API SIN el bloque: badge de siempre y ningún control nuevo", () => {
    const html = render({ facturado: false });
    expect(html).toContain("Sin factura");
    expect(html).not.toContain("Subir factura");
    expect(html).not.toContain("Factura del servicio");
    expect(render({ facturado: true })).toContain("Facturado");
  });

  it("con el bloque: estatus de tres opciones y «Subir factura»", () => {
    const html = render({
      facturado: false,
      facturaCliente: { estatus: "ELABORADA_ENVIADA", archivo: null },
      puedeFacturar: true,
    });
    expect(html).toContain("Factura elaborada y enviada");
    expect(html).toContain("Subir factura");
    expect(html).toContain("Sin archivo de factura cargado.");
  });

  it("con archivo: dice cuál, quién y cuándo, y ofrece Ver / Quitar", () => {
    const html = render({
      facturado: false,
      facturaCliente: {
        estatus: "FACTURADO",
        archivo: {
          path: "vuelos/v-1/abc.pdf",
          nombre: "factura-232.pdf",
          subida_at: "2026-09-22T18:00:00-05:00",
          subida_por_nombre: "Itzi",
        },
      },
      puedeFacturar: true,
    });
    expect(html).toContain("factura-232.pdf");
    expect(html).toContain("subió Itzi");
    expect(html).toContain(">Ver</button>");
    expect(html).toContain("Quitar");
    expect(html).toContain("Reemplazar factura");
  });

  it("con CFDI timbrado el estatus no se edita y se dice por qué", () => {
    const html = render({
      facturado: true,
      facturaCliente: { estatus: "FACTURADO", archivo: null },
      puedeFacturar: true,
    });
    expect(html).toContain("CFDI timbrado en el sistema");
    expect(html).not.toContain("Estatus de la factura");
  });

  it("sin permiso: se lee el estatus pero no hay botones de edición", () => {
    const html = render({
      facturado: false,
      facturaCliente: { estatus: "SIN_FACTURA", archivo: null },
      puedeFacturar: false,
    });
    expect(html).toContain("Factura del servicio");
    expect(html).not.toContain("Subir factura");
    expect(html).not.toContain("Estatus de la factura");
  });
});
