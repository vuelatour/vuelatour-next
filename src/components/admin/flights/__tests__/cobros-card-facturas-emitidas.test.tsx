/**
 * Cards de COBROS (vuelo y cotización) — 24-sep-2026, captura de Itzi.
 *
 * Se cuida el CABLEADO (los textos viven en `lib/admin/facturas-emitidas.ts`
 * y se prueban allá):
 *  1. El encabezado ya no aplasta la descripción: título, descripción a todo
 *     lo ancho y botones que envuelven (sin `shrink-0` ni `flex-row
 *     justify-between` con la descripción dentro).
 *  2. Dinero nunca con 1 decimal: «$136,856.80 MXN», no «$136,856.8».
 *  3. La «burbujita» de FACTURA: número ⇒ PDF, pedida, «Necesito factura»,
 *     «Registrar factura» solo para facturación; sin el bloque (API previo o
 *     sin la migración) NO se pinta nada.
 *  4. El COMPROBANTE de cada cobro: miniatura / «PDF» / enlace «HEIC» (nunca
 *     un `<img>` roto), «Adjuntar comprobante» para oficina, y el aviso de
 *     los cobros de un sobre de grupo.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { FlightCobro } from "@/types/flights";
import type { FacturaServicioBloque } from "@/types/facturas-emitidas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("../cobro-form-sheet", () => ({ CobroFormSheet: () => null }));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => <button>Registrar reembolso</button> }));
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

const COBRO: FlightCobro = {
  id: "c-1",
  vuelo_id: "v-1",
  monto: "136856.8",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17",
  referencia: null,
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-09-10T15:00:00-05:00",
  foto_voucher_url: null,
  registrado_por: null,
  registrado_por_nombre: "Itzi",
  notas: null,
  created_at: "2026-09-10T15:00:00-05:00",
  updated_at: "2026-09-10T15:00:00-05:00",
} as FlightCobro;

const SIN_NADA: FacturaServicioBloque = {
  solicitud: null,
  por_facturar: false,
  facturas: [],
  canceladas: 0,
};

const PEDIDA: FacturaServicioBloque = {
  solicitud: {
    // 24 sep 2026, 10:00 hora Cancún.
    solicitada_at: "2026-09-24T15:00:00.000Z",
    solicitada_por: { id: "u-itzi", nombre: "Itzi" },
    nota: "Mandó sus datos por correo",
    paga_contra_factura: true,
  },
  por_facturar: true,
  facturas: [],
  canceladas: 0,
};

const FACTURADA: FacturaServicioBloque = {
  solicitud: PEDIDA.solicitud,
  por_facturar: false,
  facturas: [
    {
      id: "f-1",
      serie: "A",
      folio: "123",
      etiqueta: "A-123",
      uuid: "D08B6837-A3B5-45AF-96E1-36F07FBA8FAF",
      fecha_emision: "2026-09-24",
      total: 8050.4,
      moneda: "USD",
      metodo_pago: "PPD",
      tiene_pdf: true,
      tiene_xml: false,
    },
  ],
  canceladas: 1,
};

function vuelo(props: {
  facturaServicio?: FacturaServicioBloque | null;
  rol?: string | null;
  cobros?: FlightCobro[];
  voucherUrls?: Record<string, string>;
  estado?: "COMPLETADO" | "CANCELADO";
}): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-1"
      flightFolio={341}
      flightEstado={props.estado ?? "COMPLETADO"}
      montoTotalUsd={8050.4}
      pendingUsd={0}
      cobradoUsd={8050.4}
      cobros={props.cobros ?? [COBRO]}
      voucherUrls={props.voucherUrls}
      facturaServicio={props.facturaServicio}
      rol={props.rol ?? null}
      puedeReembolsar
    />,
  );
}

function cotizacion(props: {
  facturaServicio?: FacturaServicioBloque | null;
  rol?: string | null;
  cobros?: FlightCobro[];
  voucherUrls?: Record<string, string>;
}): string {
  return renderToStaticMarkup(
    <QuoteCobrosCard
      quoteId="v-1"
      quoteFolio={341}
      montoTotalUsd={8050.4}
      totalCobrado={8050.4}
      cobros={props.cobros ?? [COBRO]}
      puedeReembolsar
      onRegistrar={() => {}}
      facturaServicio={props.facturaServicio}
      rol={props.rol ?? null}
      vueloEstado="CONFIRMADO"
      voucherUrls={props.voucherUrls}
    />,
  );
}

describe("encabezado: la descripción ya no queda aplastada", () => {
  it.each([
    ["cotización", () => cotizacion({ rol: "ADMIN" })],
    ["vuelo", () => vuelo({ rol: "ADMIN" })],
  ])("%s: sin la fila `justify-between` que metía los botones junto al texto", (_n, r) => {
    const html = r();
    expect(html).not.toContain("flex flex-row items-start justify-between");
    // Los botones envuelven en su propio renglón, sin `shrink-0` que se coma
    // el ancho de la descripción.
    expect(html).not.toMatch(/justify-end gap-2 shrink-0/);
    expect(html).toContain("Registrar cobro");
  });

  it("la cotización dice el cobrado con 2 decimales («$8,050.40»)", () => {
    const html = cotizacion({});
    expect(html).toContain("Cobrado $8,050.40 de $8,050.40.");
    expect(html).not.toContain("$8,050.4 ");
  });
});

describe("montos de los cobros: nunca un decimal suelto", () => {
  it.each([
    ["cotización", () => cotizacion({})],
    ["vuelo", () => vuelo({})],
  ])("%s: «$136,856.80 MXN»", (_n, r) => {
    const html = r();
    expect(html).toContain("$136,856.80 MXN");
    expect(html).not.toContain("136,856.8<");
    expect(html).not.toContain("136,856.8 ");
  });

  it("la cotización ya no remite a «vouchers» del vuelo (el comprobante vive aquí)", () => {
    expect(cotizacion({})).toContain("Más detalle (comisiones, conciliación) en");
  });
});

describe("burbuja de FACTURA", () => {
  it("sin el bloque (API previo o sin migración): nada nuevo", () => {
    for (const fs of [undefined, null]) {
      const html = vuelo({ facturaServicio: fs, rol: "ADMIN" });
      expect(html).not.toContain("Necesito factura");
      expect(html).not.toContain("Registrar factura");
    }
  });

  it("nada pedido: «Sin factura» + «Necesito factura» (oficina)", () => {
    const html = cotizacion({ facturaServicio: SIN_NADA, rol: "COORDINADOR" });
    expect(html).toContain("Sin factura");
    expect(html).toContain("Necesito factura");
    // Registrar la factura es de facturación (ADMIN/FACTURACION).
    expect(html).not.toContain("Registrar factura");
  });

  it("facturación ve «Registrar factura»", () => {
    expect(cotizacion({ facturaServicio: SIN_NADA, rol: "FACTURACION" })).toContain(
      "Registrar factura",
    );
    expect(vuelo({ facturaServicio: SIN_NADA, rol: "ADMIN" })).toContain("Registrar factura");
  });

  it("SOCIO no pide ni registra", () => {
    const html = cotizacion({ facturaServicio: SIN_NADA, rol: "SOCIO" });
    expect(html).toContain("Sin factura");
    expect(html).not.toContain("Necesito factura");
    expect(html).not.toContain("Registrar factura");
  });

  it("pedida: chip ámbar con quién y cuándo (hora Cancún), «Paga contra factura» y «Retirar»", () => {
    const html = vuelo({ facturaServicio: PEDIDA, rol: "ADMIN" });
    expect(html).toContain("Factura pedida por Itzi · 24 sep — pendiente");
    expect(html).toContain("Paga contra factura");
    expect(html).toContain("Nota: Mandó sus datos por correo");
    expect(html).toContain(">Retirar<");
    expect(html).not.toContain("Necesito factura");
  });

  it("facturada: chip verde con el número que abre el PDF y la liga a la cancelada", () => {
    const html = vuelo({ facturaServicio: FACTURADA, rol: "ADMIN" });
    expect(html).toMatch(/<button[^>]*>Factura <span[^>]*>A-123<\/span><\/button>/);
    expect(html).toContain("Abrir el PDF de la factura A-123");
    expect(html).toContain("Pedida por Itzi · 24 sep");
    expect(html).toContain("1 cancelada");
    expect(html).toContain("/admin/facturas-emitidas?vuelo_id=v-1");
  });

  it("sin PDF o sin permiso de abrirlo: el número se lee pero no es botón", () => {
    const sinPdf: FacturaServicioBloque = {
      ...FACTURADA,
      facturas: [{ ...FACTURADA.facturas[0], tiene_pdf: false }],
    };
    expect(vuelo({ facturaServicio: sinPdf, rol: "ADMIN" })).toContain("· sin PDF");
    const socio = cotizacion({ facturaServicio: FACTURADA, rol: "SOCIO" });
    expect(socio).toContain("Solo oficina abre el PDF");
    expect(socio).not.toMatch(/<button[^>]*>Factura <span/);
  });

  it("vuelo CANCELADO: no se ofrece «Necesito factura» (el API respondería 409); sí registrar", () => {
    const html = vuelo({ facturaServicio: SIN_NADA, rol: "ADMIN", estado: "CANCELADO" });
    expect(html).not.toContain("Necesito factura");
    expect(html).toContain("Registrar factura");
  });

  it("con el registro, el bloque viejo se rotula «Seguimiento manual» y va DEBAJO de la burbuja", () => {
    const html = renderToStaticMarkup(
      <CobrosCard
        flightId="v-1"
        flightFolio={341}
        flightEstado="COMPLETADO"
        montoTotalUsd={8050.4}
        pendingUsd={0}
        cobradoUsd={8050.4}
        cobros={[]}
        facturaCliente={{ estatus: "FACTURADO", archivo: null, folio: null, uuid: null }}
        puedeFacturar
        facturaServicio={FACTURADA}
        rol="ADMIN"
      />,
    );
    expect(html).toContain("Seguimiento manual");
    expect(html).not.toContain("Agregar folio");
    expect(html).not.toContain("Sin archivo de factura cargado.");
    expect(html.indexOf("A-123")).toBeLessThan(html.indexOf("Seguimiento manual"));
  });
});

describe("comprobante del cobro", () => {
  it("oficina sin comprobante: «Adjuntar comprobante» (con su input oculto)", () => {
    const html = cotizacion({ rol: "COORDINADOR" });
    expect(html).toContain("Adjuntar comprobante");
    expect(html).toContain('accept="image/*,application/pdf,.heic,.heif"');
  });

  it("sin permiso: ni botón ni input", () => {
    const html = cotizacion({ rol: "SOCIO" });
    expect(html).not.toContain("Adjuntar comprobante");
    expect(html).not.toContain('type="file"');
  });

  it("imagen con URL firmada: miniatura + «Reemplazar»", () => {
    const html = vuelo({
      rol: "ADMIN",
      cobros: [{ ...COBRO, foto_voucher_url: "u/2026-09/a.jpg" }],
      voucherUrls: { "u/2026-09/a.jpg": "https://firmada/a.jpg" },
    });
    expect(html).toContain("https://firmada/a.jpg");
    expect(html).toContain("Reemplazar");
  });

  it("PDF: botón «PDF»; HEIC: enlace, nunca un <img> roto", () => {
    const pdf = vuelo({
      rol: "ADMIN",
      cobros: [{ ...COBRO, foto_voucher_url: "oficina/v-1/c-1/x.pdf" }],
      voucherUrls: { "oficina/v-1/c-1/x.pdf": "https://firmada/x.pdf" },
    });
    expect(pdf).toMatch(/href="https:\/\/firmada\/x\.pdf"[^>]*>.*PDF<\/a>/);
    const heic = vuelo({
      rol: "ADMIN",
      cobros: [{ ...COBRO, foto_voucher_url: "u/2026-09/foto.HEIC" }],
      voucherUrls: { "u/2026-09/foto.HEIC": "https://firmada/foto.HEIC" },
    });
    expect(heic).toContain(">HEIC</a>");
    expect(heic).not.toContain('<img src="https://firmada/foto.HEIC"');
  });

  it("oficina sin URL firmada (el lote falló): botón «Comprobante» que la pide al abrir", () => {
    const html = cotizacion({
      rol: "COORDINADOR",
      cobros: [{ ...COBRO, foto_voucher_url: "u/2026-09/a.jpg" }],
    });
    expect(html).toContain(">Comprobante</button>");
  });

  it("SOCIO (403 al firmar): se dice que hay comprobante, SIN un botón que fallaría siempre", () => {
    const html = cotizacion({
      rol: "SOCIO",
      cobros: [{ ...COBRO, foto_voucher_url: "u/2026-09/a.jpg" }],
    });
    expect(html).not.toContain(">Comprobante</button>");
    expect(html).toContain("Con comprobante");
    expect(html).toContain("Solo oficina abre el comprobante");
  });

  it("parte de un sobre de grupo: no se adjunta por vuelo y se dice", () => {
    const html = vuelo({
      rol: "ADMIN",
      cobros: [
        {
          ...COBRO,
          cobro_grupo_id: "cg-1",
          cobro_grupo: {
            id: "cg-1",
            grupo_id: "g-1",
            grupo_folio: 12,
            monto_total: 10000,
            moneda: "USD",
          },
        },
      ],
    });
    expect(html).toContain("Comprobante del grupo: por ahora no se adjunta por vuelo");
    expect(html).not.toContain("Adjuntar comprobante");
  });
});
