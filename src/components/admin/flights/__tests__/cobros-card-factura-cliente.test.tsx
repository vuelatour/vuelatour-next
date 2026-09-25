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
 *  2. Con el bloque aparece el estatus de tres opciones. La SUBIDA suelta
 *     («Subir factura») se retiró el 24-sep-2026 (noche): la factura se
 *     REGISTRA en «Facturas emitidas» desde la burbuja de la card
 *     (`cobros-card-facturas-emitidas.test.tsx`).
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
// Ingresos (24-sep-2026): banner de anticipos y «Desaplicar» (server actions).
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
// Las subidas van del navegador al API (24-sep-2026); esos módulos leen las
// NEXT_PUBLIC_* al importarse y aquí no se sube nada.
vi.mock("@/lib/api/facturas-emitidas-browser", () => ({
  adjuntarComprobanteCobro: async () => ({ ok: false, error: "no aplica" }),
  leerArchivoFactura: async () => ({ ok: false, error: "no aplica" }),
  guardarFacturaEmitida: async () => ({ ok: false, error: "no aplica" }),
  buscarVuelosCandidatos: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));

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

  it("con el bloque: estatus de tres opciones y SIN la subida suelta (se retiró)", () => {
    const html = render({
      facturado: false,
      facturaCliente: { estatus: "ELABORADA_ENVIADA", archivo: null },
      puedeFacturar: true,
    });
    expect(html).toContain("Factura elaborada y enviada");
    expect(html).not.toContain("Subir factura");
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
    // El reemplazo se hace registrando la factura (burbuja), no aquí.
    expect(html).not.toContain("Reemplazar factura");
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

/**
 * FOLIO de la factura (24-sep-2026). Palabras del cliente: «subí la factura
 * de un vuelo … al descargar el reporte en Excel … no aparece el folio de la
 * factura que subí en el registro».
 */
describe("CobrosCard · folio de la factura", () => {
  const ARCHIVO = {
    path: "vuelos/v-1/abc.pdf",
    nombre: "factura-297.pdf",
    subida_at: "2026-09-23T14:38:00-05:00",
    subida_por_nombre: "Mary Cruz",
  };

  it("el folio se ve JUNTO al archivo y se corrige con el lápiz", () => {
    const html = render({
      facturaCliente: { estatus: "FACTURADO", archivo: ARCHIVO, folio: "A-1234", uuid: null },
      puedeFacturar: true,
    });
    expect(html).toContain("Folio A-1234 · factura-297.pdf · subió Mary Cruz");
    expect(html).toContain("Corregir folio");
    expect(html).toContain("Corregir el folio de la factura");
  });

  it("caso #297: «Facturado» SIN archivo ⇒ se ofrece «Agregar folio»", () => {
    const html = render({
      facturaCliente: { estatus: "FACTURADO", archivo: null, folio: null, uuid: null },
      puedeFacturar: true,
    });
    expect(html).toContain("Agregar folio");
    expect(html).toContain("Sin archivo de factura cargado.");
  });

  it("folio capturado sin archivo: se dice cuál y que no hay archivo", () => {
    const html = render({
      facturaCliente: { estatus: "ELABORADA_ENVIADA", archivo: null, folio: "B-77", uuid: null },
      puedeFacturar: true,
    });
    expect(html).toContain("Folio B-77 · sin archivo cargado");
  });

  it("«Sin factura» y sin archivo: no se pide folio (no hay de qué)", () => {
    const html = render({
      facturaCliente: { estatus: "SIN_FACTURA", archivo: null, folio: null, uuid: null },
      puedeFacturar: true,
    });
    expect(html).not.toContain("Agregar folio");
    expect(html).not.toContain("Subir factura");
  });

  it("API PREVIO (sin la llave `folio`): ni lápiz ni folio — la card de ayer", () => {
    const html = render({
      facturaCliente: { estatus: "FACTURADO", archivo: ARCHIVO },
      puedeFacturar: true,
    });
    expect(html).not.toContain("Agregar folio");
    expect(html).not.toContain("Corregir folio");
    expect(html).toContain("factura-297.pdf · subió Mary Cruz");
    expect(html).not.toContain("Folio ");
  });

  it("sin permiso: el folio se LEE pero no hay lápiz", () => {
    const html = render({
      facturaCliente: { estatus: "FACTURADO", archivo: ARCHIVO, folio: "A-1234", uuid: null },
      puedeFacturar: false,
    });
    expect(html).toContain("Folio A-1234");
    expect(html).not.toContain("Corregir folio");
    expect(html).not.toContain("Agregar folio");
  });

  it("el UUID fiscal va en el tooltip del renglón", () => {
    const html = render({
      facturaCliente: {
        estatus: "FACTURADO",
        archivo: { ...ARCHIVO, nombre: "cfdi.xml" },
        folio: "FECMID-90255",
        uuid: "DF1BFB5F-4D88-4F51-AC50-A7B72299128E",
      },
      puedeFacturar: true,
    });
    expect(html).toContain("Folio fiscal (UUID): DF1BFB5F-4D88-4F51-AC50-A7B72299128E");
  });

  it("el bloque ya no sube archivos: ni «Subir factura» ni un input de archivo", () => {
    const html = render({
      facturaCliente: { estatus: "FACTURADO", archivo: null, folio: null, uuid: null },
      puedeFacturar: true,
    });
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Subir factura");
  });
});
