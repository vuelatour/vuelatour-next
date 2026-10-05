/**
 * Facturas recibidas: columna «Folio» (5-oct-2026, API 0.0.57). Serie-folio
 * del CFDI («A-0411»); sin él, la referencia corta del UUID; con un API que
 * todavía no manda serie/folio, «—». La columna es ADITIVA: las demás no
 * cambian.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FacturaRecibida } from "@/types/invoices";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/facturas-recibidas",
}));
// El menú ⋯ (server actions, diálogos) no es parte de esta prueba.
vi.mock("@/components/admin/recibidas/recibida-actions", () => ({
  RecibidaActions: () => <span data-acciones="" />,
}));

const { RecibidasTable } = await import("../recibidas-table");

const UUID = "3F2A9C1E-7B4D-4E8A-9C21-0A1B2C3D4E5F";

const factura = (extra: Partial<FacturaRecibida>): FacturaRecibida => ({
  id: "r1",
  uuid_fiscal: UUID,
  emisor_rfc: "ASU971107MS4",
  emisor_nombre: "Aeropuertos del Sureste",
  receptor_rfc: null,
  receptor_nombre: null,
  tipo_comprobante: "I",
  subtotal: "1586.64",
  total: "1840.50",
  moneda: "MXN",
  fecha_emision: "2026-09-21",
  conceptos_resumen: "Aterrizaje CZM",
  xml_url: "facturas/x.xml",
  estado: "CLASIFICADA",
  gasto_id: null,
  aeronave_id: null,
  categoria_sugerida: null,
  notas: null,
  created_at: "2026-09-21T15:00:00Z",
  updated_at: "2026-09-21T15:00:00Z",
  ...extra,
});

const tabla = (rows: FacturaRecibida[]) =>
  renderToStaticMarkup(<RecibidasTable recibidas={rows} gastos={[]} />);

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("columna «Folio»", () => {
  it("encabezado después de Emisor y antes de Conceptos", () => {
    const html = tabla([factura({ serie: "FEACZM", folio: "72128" })]);
    const iEmisor = html.indexOf(">Emisor<");
    const iFolio = html.indexOf(">Folio<");
    const iConceptos = html.indexOf(">Conceptos<");
    expect(iEmisor).toBeGreaterThan(-1);
    expect(iFolio).toBeGreaterThan(iEmisor);
    expect(iConceptos).toBeGreaterThan(iFolio);
  });

  it("serie-folio del CFDI con el UUID completo en el tooltip", () => {
    const html = tabla([factura({ serie: "FEACZM", folio: "72128" })]);
    expect(html).toContain(">FEACZM-72128<");
    expect(html).toContain(`title="UUID ${UUID}"`);
  });

  it("sin folio todavía (API nuevo): «…últimos 8 del UUID»", () => {
    const html = tabla([factura({ serie: null, folio: null })]);
    expect(html).toContain(`…${UUID.slice(-8)}`);
  });

  it("API previo (sin serie ni folio en la respuesta): «—», y las demás columnas igual", () => {
    const html = tabla([factura({})]);
    expect(html).toContain(">Folio<");
    expect(html).not.toContain(`…${UUID.slice(-8)}`);
    expect(html).toContain("Aeropuertos del Sureste");
    expect(html).toContain("Aterrizaje CZM");
  });

  it("buscador: placeholder con «folio» y la serie-folio en el texto de búsqueda (cableado)", () => {
    const html = tabla([factura({ serie: "A", folio: "0411" })]);
    expect(html).toContain('placeholder="Buscar factura (emisor, RFC, folio, UUID, concepto)…"');
    const src = leer("../recibidas-table.tsx");
    expect(src).toContain("textoBusquedaFolioRecibida(r)");
    expect(src).toContain("celdaFolioRecibida(r)");
    expect(src).toContain("searchPlaceholder={PLACEHOLDER_BUSCAR_RECIBIDA}");
  });
});
