/**
 * Página «Facturas emitidas» (24-sep-2026) — CABLEADO de las piezas que la
 * arman (los textos y filtros se prueban en `lib/admin/__tests__/
 * facturas-emitidas.test.ts`):
 *  - Resumen: chips que filtran (los de 0 en gris y sin liga), totales por
 *    moneda sin mezclar USD con MXN, huecos de la numeración y el aviso del
 *    salto grande.
 *  - Registro: «Factura ↓/↑» clicable, número tabular, cancelada tachada,
 *    total con su moneda, semáforo del vuelo con la fuente única, «Sin PDF»,
 *    chips de alerta y el menú ⋯ visible.
 *  - Por facturar: datos fiscales del cliente, «Faltan datos fiscales»,
 *    «Paga contra factura», «Marcado Facturado sin factura registrada».
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  FacturaEmitida,
  ListaFacturasEmitidas,
  PorFacturarItem,
} from "@/types/facturas-emitidas";
import { filtrosFacturasDeUrl } from "@/lib/admin/facturas-emitidas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/facturas-emitidas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  retirarSolicitudFacturaAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/facturas-emitidas/actions", () => ({
  cancelarFacturaAction: async () => ({ ok: true }),
  eliminarFacturaAction: async () => ({ ok: true }),
  quitarArchivoFacturaAction: async () => ({ ok: true }),
  reactivarFacturaAction: async () => ({ ok: true }),
  refrescarFacturasEmitidasAction: async () => ({ ok: true }),
  urlArchivoFacturaAction: async () => ({ ok: true, data: "https://x" }),
}));
vi.mock("@/lib/api/facturas-emitidas-browser", () => ({
  leerArchivoFactura: async () => ({ ok: false, error: "no" }),
  reemplazarArchivoFactura: async () => ({ ok: false, error: "no" }),
  guardarFacturaEmitida: async () => ({ ok: false, error: "no" }),
  buscarVuelosCandidatos: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));

const { RegistroFacturasTable } = await import("../registro-facturas-table");
const { RegistroFacturasResumen } = await import("../registro-facturas-resumen");
const { PorFacturarTable } = await import("../por-facturar-table");
const { SolicitudFacturaAlta } = await import("../solicitud-factura-alta");

const VUELO = "dc204a2f-6342-43f1-9406-f76dc1302b97";

function factura(p: Partial<FacturaEmitida> = {}): FacturaEmitida {
  return {
    id: "f-1",
    serie: "A",
    folio: "123",
    folio_num: 123,
    etiqueta: "A-123",
    uuid: null,
    fecha_emision: "2026-09-24",
    estatus: "VIGENTE",
    emisor_rfc: null,
    emisor_nombre: null,
    emisora: null,
    receptor_rfc: "MMA150622P83",
    receptor_nombre: "MAQAR MACHINERY",
    cliente: null,
    moneda: "USD",
    subtotal: null,
    iva: null,
    total: 8050.4,
    metodo_pago: "PPD",
    forma_pago: "99",
    notas: null,
    es_parcial: false,
    pdf: null,
    xml: null,
    archivos_anteriores: 0,
    vuelos: [
      {
        id: VUELO,
        folio: 341,
        fecha_vuelo: "2026-09-27T14:00:00+00:00",
        estado: "CONFIRMADO",
        cliente_nombre: "Maqar",
        total: { usd: 8050.4, mxn: 136856.8 },
        cobro: {
          monto_total_usd: 8050.4,
          total_cobrado_usd: 1000,
          sin_tc_count: 0,
          cobrado: false,
          cotizacion_abierta: false,
          estado_vuelo: "CONFIRMADO",
          es_interno: false,
          semaforo: { key: "PARCIAL", label: "Parcial", color: "amarillo" },
        },
        otras_vigentes: ["A-120"],
      },
    ],
    alertas: ["SIN_PDF", "DUPLICADO_VUELO"],
    cancelada: null,
    created_at: "2026-09-24T19:02:00.000Z",
    created_por_nombre: "Mary Cruz",
    updated_at: "2026-09-24T19:02:00.000Z",
    ...p,
  };
}

const LISTA: Pick<ListaFacturasEmitidas, "resumen" | "filtrado"> = {
  resumen: {
    registradas: 12,
    vigentes: 11,
    canceladas: 1,
    sin_pdf: 2,
    sin_vuelo: 0,
    vuelos_con_varias: 1,
    en_vuelo_cancelado: 0,
    por_facturar: 2,
    totales_vigentes: [
      { moneda: "USD", total: 8050.4 },
      { moneda: "MXN", total: 136856.8 },
    ],
    huecos: [
      {
        emisora: null,
        serie: "A",
        etiqueta_serie: "A",
        desde: 100,
        hasta: 110,
        total_faltantes: 5,
        faltantes: ["A-104", "A-107"],
        truncado: true,
      },
      {
        emisora: null,
        serie: "B",
        etiqueta_serie: "B",
        desde: 130,
        hasta: 1300,
        total_faltantes: 1169,
        faltantes: ["B-131"],
        truncado: true,
      },
    ],
  },
  filtrado: { count: 11, totales: [] },
};

describe("resumen del registro", () => {
  const html = renderToStaticMarkup(
    <RegistroFacturasResumen lista={LISTA} filtros={filtrosFacturasDeUrl({})} />,
  );

  it("chips que filtran; los de 0 van sin liga", () => {
    expect(html).toContain('href="/admin/facturas-emitidas?alerta=sin_pdf"');
    expect(html).toContain('href="/admin/facturas-emitidas?estatus=CANCELADA"');
    expect(html).toContain('href="/admin/facturas-emitidas?alerta=duplicado_vuelo"');
    expect(html).not.toContain("alerta=sin_vuelo");
    expect(html).toMatch(/<span[^>]*>Sin vuelo <span[^>]*>0<\/span><\/span>/);
  });

  it("totales vigentes por moneda (jamás sumados)", () => {
    expect(html).toContain("Vigentes: $8,050.40 USD · $136,856.80 MXN");
  });

  it("huecos y salto grande", () => {
    expect(html).toContain("Faltan en la numeración (serie A):");
    expect(html).toContain("A-104, A-107 (y 3 más)");
    expect(html).toContain("Hay un salto grande en la serie B (de B-130 a B-1300)");
    expect(html).not.toContain("B-131");
  });
});

describe("tabla del registro", () => {
  const render = (facturas: FacturaEmitida[], orden: string | undefined = undefined) =>
    renderToStaticMarkup(
      <RegistroFacturasTable facturas={facturas} filtros={filtrosFacturasDeUrl({ orden })} />,
    );

  it("encabezado de orden clicable (↓ por defecto, ↑ al invertir)", () => {
    expect(render([factura()])).toMatch(/<button[^>]*cursor-pointer[^>]*>Factura ↓<\/button>/);
    expect(render([factura()], "folio_asc")).toContain("Factura ↑");
  });

  it("fila: número, receptor, vuelo, total con moneda, método, semáforo, Sin PDF, alertas y ⋯", () => {
    const html = render([factura()]);
    expect(html).toContain(">A-123</span>");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("MAQAR MACHINERY");
    expect(html).toContain(`href="/admin/flights/${VUELO}"`);
    expect(html).toContain("#341");
    expect(html).toContain("$8,050.40 USD");
    expect(html).toContain(">PPD<");
    expect(html).toContain(">Parcial<"); // semáforo de cobro del vuelo
    expect(html).toContain("Sin PDF");
    expect(html).toContain("Vuelo con 2 facturas");
    expect(html).toContain('aria-label="Acciones de la factura A-123"');
    // Emisor solo con ≥2 razones sociales en las filas.
    expect(html).not.toContain(">Emisor<");
  });

  it("cancelada tachada con el motivo; con PDF el botón «Ver PDF»", () => {
    const html = render([
      factura({
        estatus: "CANCELADA",
        alertas: [],
        cancelada: { at: "2026-09-25T00:00:00Z", por_nombre: "Mary Cruz", motivo: "Re-emitida como A-130" },
        pdf: { nombre: "A-123.pdf", subido_at: null, subido_por_nombre: "Mary Cruz" },
      }),
    ]);
    expect(html).toContain("line-through");
    expect(html).toContain("Cancelada por Mary Cruz: Re-emitida como A-130");
    expect(html).toContain('aria-label="Ver el PDF de la factura A-123"');
  });

  it("con dos razones sociales aparece la columna Emisor", () => {
    const html = render([
      factura({ emisora: { id: "e1", razon_social: "Aero Charter Cancun S.A. de C.V." } }),
      factura({ id: "f-2", emisora: { id: "e2", razon_social: "Aerodinamica de Monterrey" } }),
    ]);
    expect(html).toContain(">Emisor<");
    expect(html).toContain(">Aero Charter Cancun<");
  });
});

describe("Por facturar", () => {
  const item: PorFacturarItem = {
    vuelo: {
      id: VUELO,
      folio: 341,
      estado: "CONFIRMADO",
      fecha_vuelo: "2026-09-27T14:00:00+00:00",
      ruta_iatas: ["CUN", "MID", "CUN"],
      es_externo: false,
      grupo: { id: "g-1", folio: 12, nombre: null, total_aviones: 3 },
      estatus_manual: "FACTURADO",
    },
    cliente: {
      id: "c-1",
      nombre: "Maqar",
      rfc: "MMA150622P83",
      razon_social: null,
      regimen_fiscal: null,
      uso_cfdi: null,
      codigo_postal: null,
      domicilio_fiscal: null,
      pais_residencia: null,
    },
    faltan_datos_fiscales: ["Razón social", "Régimen fiscal"],
    total: { usd: 8050.4, mxn: 136856.8 },
    cobro: {
      monto_total_usd: 8050.4,
      total_cobrado_usd: 0,
      sin_tc_count: 0,
      cobrado: false,
      cotizacion_abierta: false,
      estado_vuelo: "CONFIRMADO",
      es_interno: false,
      semaforo: { key: "SIN_COBROS", label: "Sin cobro", color: "rojo" },
    },
    solicitud: {
      solicitada_at: "2026-09-24T15:00:00.000Z",
      solicitada_por: { id: "u", nombre: "Itzi" },
      nota: "La necesita para pagar",
      paga_contra_factura: true,
    },
    facturas_canceladas: 0,
  };

  it("todo lo que Mari necesita en la fila", () => {
    const html = renderToStaticMarkup(
      <PorFacturarTable items={[item]} rol="FACTURACION" resaltar={VUELO} />,
    );
    expect(html).toContain(`href="/admin/quotes/${VUELO}"`);
    expect(html).toContain("CUN → MID → CUN");
    expect(html).toContain("G-12 · 3 aviones");
    expect(html).toContain("RFC MMA150622P83");
    expect(html).toContain("Faltan datos fiscales: Razón social, Régimen fiscal");
    expect(html).toContain("$8,050.40 USD");
    expect(html).toContain("$136,856.80 MXN");
    expect(html).toContain(">Sin cobro<");
    expect(html).toContain("Itzi · 24 sep");
    expect(html).toContain("La necesita para pagar");
    expect(html).toContain("Paga contra factura");
    expect(html).toContain("Marcado «Facturado» sin factura registrada");
    expect(html).toContain("Registrar factura");
    expect(html).toContain("ring-amber-400");
  });

  it("COORDINADOR puede retirar pero no registrar", () => {
    const html = renderToStaticMarkup(<PorFacturarTable items={[item]} rol="COORDINADOR" />);
    expect(html).not.toContain("Registrar factura");
    expect(html).toContain("Más acciones del vuelo #341");
  });
});

describe("alta de cotización: «El cliente pide factura»", () => {
  it("apagado: solo el switch; encendido: también «paga hasta recibir la factura»", () => {
    const apagado = renderToStaticMarkup(
      <SolicitudFacturaAlta valor={{ pide: false, pagaContraFactura: false }} onCambio={() => {}} />,
    );
    expect(apagado).toContain("El cliente pide factura");
    expect(apagado).not.toContain("El cliente paga hasta recibir la factura");
    const encendido = renderToStaticMarkup(
      <SolicitudFacturaAlta valor={{ pide: true, pagaContraFactura: false }} onCambio={() => {}} />,
    );
    expect(encendido).toContain("El cliente paga hasta recibir la factura");
    expect(encendido).toContain("Por facturar");
  });
});
