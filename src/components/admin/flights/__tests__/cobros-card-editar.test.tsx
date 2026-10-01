/**
 * «Editar» un cobro en las cards de cobros del VUELO y de la COTIZACIÓN
 * (26-sep-2026). Pedido del cliente con la captura de la #315 «Beh Kay»: cada
 * cobro traía SOLO recibo y bote de basura, y «grabaron mal un cobro del 17
 * de septiembre y no podemos editarlo de forma sencilla».
 *
 *  1. Solo ADMIN/FACTURACION (los roles del PATCH del API) ven «Editar».
 *  2. Parte de un sobre de grupo ⇒ sin «Editar», y la card dice por qué.
 *  3. Reembolso, conciliado y anticipo SÍ lo muestran, con el `title` que
 *     adelanta qué se puede corregir.
 *  4. Cableado: las dos cards montan el MISMO `CobroFormSheet` en modo
 *     edición (`cobroEditar`); el del vuelo conserva además el del alta.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlightCobro } from "@/types/flights";

// La renovación de URLs firmadas de las fotos (server action: sesión y red)
// no es parte de este test.
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
// Cada instancia del formulario se pinta como un marcador: «alta» o
// «edicion» según reciba la prop `cobroEditar` (aunque valga null al montar).
vi.mock("../cobro-form-sheet", () => ({
  CobroFormSheet: (p: { cobroEditar?: unknown }) => (
    <i data-ficha-cobro={"cobroEditar" in p ? "edicion" : "alta"} />
  ),
}));
vi.mock("../reembolso-dialog", () => ({ ReembolsoButton: () => null }));
vi.mock("@/app/admin/ingresos/actions", () => ({
  anticiposDeClienteAction: async () => ({ ok: true, data: [] }),
  desaplicarAnticipoAction: async () => ({ ok: true }),
  aplicarAnticipoAction: async () => ({ ok: true }),
  vuelosCandidatosAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/flights/actions", () => ({
  deleteCobroAction: async () => ({ ok: true }),
  updateCobroAction: async () => ({ ok: true }),
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

// El primer cobro de la captura de la #315.
const COBRO_3400: FlightCobro = {
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  vuelo_id: "v-315",
  monto: "3400",
  moneda: "MXN",
  metodo_cobro: "TRANSFERENCIA",
  tc_usd_mxn: "17.35",
  referencia: null,
  cuenta_destino: "Scotiabank Pesos",
  fecha_cobro: "2026-09-15T17:00:00+00:00",
  foto_voucher_url: null,
  registrado_por: "u-1",
  registrado_por_nombre: "Itzi",
  notas: null,
  created_at: "2026-09-15T17:00:00+00:00",
  updated_at: "2026-09-15T17:00:00+00:00",
};
const REEMBOLSO: FlightCobro = { ...COBRO_3400, id: "r-1", monto: "-500", notas: "Tramo cancelado" };
const CONCILIADO: FlightCobro = { ...COBRO_3400, id: "c-conc", conciliado: true, conciliado_via: "DIRECTO" };
const DE_ANTICIPO: FlightCobro = {
  ...COBRO_3400,
  id: "c-ant",
  anticipo: { ingreso_id: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d", etiqueta: "ING-12" },
  conciliado: true,
  conciliado_via: "ANTICIPO",
};
const PARTE_SOBRE: FlightCobro = {
  ...COBRO_3400,
  id: "c-sobre",
  cobro_grupo_id: "cg-1",
  cobro_grupo: { id: "cg-1", grupo_id: "g-1", grupo_folio: 12, monto_total: 10800.76, moneda: "USD" },
};

function vuelo(cobros: FlightCobro[], rol: string | null): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-315"
      flightFolio={315}
      flightEstado="CONFIRMADO"
      montoTotalUsd={4130}
      pendingUsd={0}
      cobradoUsd={4130}
      cobros={cobros}
      rol={rol}
    />,
  );
}

function cotizacion(cobros: FlightCobro[], rol: string | null): string {
  return renderToStaticMarkup(
    <QuoteCobrosCard
      quoteId="v-315"
      quoteFolio={315}
      montoTotalUsd={4130}
      totalCobrado={4130}
      cobros={cobros}
      rol={rol}
    />,
  );
}

/** Botones «Editar» del marcado (uno por cobro editable). */
function botonesEditar(html: string): string[] {
  return html.match(/<button[^>]*data-accion="editar-cobro"[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

describe.each([
  ["vuelo", vuelo],
  ["cotización", cotizacion],
] as const)("«Editar» en la card de cobros de la %s", (_nombre, render) => {
  it.each(["ADMIN", "FACTURACION"])("%s ve «Editar» en cada cobro, con texto visible y nombre accesible", (rol) => {
    const html = render([COBRO_3400, { ...COBRO_3400, id: "c-2", monto: "68205.55" }], rol);
    const botones = botonesEditar(html);
    expect(botones).toHaveLength(2);
    expect(botones[0]).toContain(">Editar</button>");
    expect(botones[0]).toContain('aria-label="Editar cobro de $3,400 MXN"');
    expect(botones[1]).toContain('aria-label="Editar cobro de $68,205.55 MXN"');
    expect(botones[0]).toContain('title="Corregir este cobro (monto, método, fecha, referencia…)"');
    // Todo lo clicable con cursor-pointer.
    expect(botones[0]).toContain("cursor-pointer");
    // La card lo dice una vez: nadie más borra y recaptura.
    expect(html).toContain("corrígelo con «Editar»");
  });

  it.each(["COORDINADOR", "SOCIO", "ANALISTA", null])("%s NO ve «Editar» (el API respondería 403)", (rol) => {
    const html = render([COBRO_3400], rol);
    expect(botonesEditar(html)).toHaveLength(0);
    expect(html).not.toContain("corrígelo con «Editar»");
  });

  it("parte de un sobre de grupo: sin «Editar» y la card explica que se corrige desde el grupo", () => {
    const html = render([PARTE_SOBRE, COBRO_3400], "ADMIN");
    const botones = botonesEditar(html);
    expect(botones).toHaveLength(1);
    expect(html).toContain(
      "Los cobros que son parte de un sobre de grupo se corrigen, re-parten o eliminan desde el grupo (Cobros del grupo).",
    );
  });

  it("solo partes de sobre: ni botón ni «corrígelo con «Editar»» (no hay qué señalar)", () => {
    const html = render([PARTE_SOBRE], "ADMIN");
    expect(botonesEditar(html)).toHaveLength(0);
    expect(html).not.toContain("corrígelo con «Editar»");
    expect(html).toContain("se corrigen, re-parten o eliminan desde el grupo");
  });

  it("reembolso, conciliado y anticipo: «Editar» con el title de lo que sí se corrige", () => {
    const html = render([REEMBOLSO, CONCILIADO, DE_ANTICIPO], "FACTURACION");
    const botones = botonesEditar(html);
    expect(botones).toHaveLength(3);
    expect(botones[0]).toContain('title="Corregir este reembolso: fecha, referencia y notas"');
    expect(botones[0]).toContain('aria-label="Editar reembolso de $500 MXN"');
    expect(botones[1]).toContain(
      'title="Corregir este cobro: está conciliado con el banco, solo fecha, referencia y notas"',
    );
    expect(botones[2]).toContain(
      'title="Corregir este cobro: viene de un anticipo, solo T.C., fecha, referencia y notas"',
    );
    // El anticipo conserva su «Desaplicar» al lado.
    expect(html).toContain(">Desaplicar<");
  });
});

describe("cableado del formulario en modo edición", () => {
  it("vuelo: la ficha del ALTA y la de EDICIÓN (el mismo CobroFormSheet)", () => {
    const html = vuelo([COBRO_3400], "ADMIN");
    expect(html).toContain('data-ficha-cobro="alta"');
    expect(html).toContain('data-ficha-cobro="edicion"');
  });

  it("cotización: monta el MISMO CobroFormSheet en modo edición (el alta vive en el workspace)", () => {
    const html = cotizacion([COBRO_3400], "ADMIN");
    expect(html).toContain('data-ficha-cobro="edicion"');
    expect(html).not.toContain('data-ficha-cobro="alta"');
  });
});

/**
 * El formulario vive en un portal (el render de servidor no lo pinta) y el
 * proyecto no tiene DOM de pruebas: se vigila el CABLEADO en el código, como
 * `quote-navegacion.test.tsx`. Lo que no puede romperse sin que falle aquí:
 * el PATCH sale SOLO desde «Guardar corrección» (tras la confirmación) y con
 * el diff de la fuente única; y la cotización le pasa a su card lo que la
 * ficha de corrección necesita.
 */
describe("cableado de la corrección en el código", () => {
  const leer = (...p: string[]) =>
    readFileSync(path.resolve(__dirname, "..", "..", "..", "..", ...p), "utf8");

  it("CobroFormSheet: diff de la fuente única y PATCH solo tras confirmar", () => {
    const src = leer("components", "admin", "flights", "cobro-form-sheet.tsx");
    expect(src).toContain("formularioDesdeCobro(cobroEditar)");
    expect(src).toContain("cambiosDeCobro(cobroEditar, inicial, valoresEd, edicion)");
    expect(src).toContain("erroresEdicionCobro(inicial, valoresEd, edicion)");
    // Una sola llamada al PATCH, dentro de guardarCorreccion.
    expect(src.match(/updateCobroAction\(/g)).toHaveLength(1);
    const guardar = src.slice(src.indexOf("const guardarCorreccion"));
    expect(guardar.indexOf("updateCobroAction(flightId, cobroEditar.id, cambios.patch)")).toBeGreaterThan(0);
    // El submit de la edición solo abre la confirmación.
    expect(src).toContain("setConfirmacion(cambios);");
    expect(src).toContain("{TITULO_CONFIRMAR_EDICION}");
    expect(src).toContain('"Guardar corrección"');
  });

  it("la cotización pasa a su card el T.C. y los pesos de la cotización para la ficha", () => {
    const ws = leer("components", "admin", "quotes", "quote-workspace.tsx");
    const card = ws.slice(ws.indexOf("<QuoteCobrosCard"), ws.indexOf("/>", ws.indexOf("<QuoteCobrosCard")));
    for (const prop of ["tcCotizacion=", "montoTotalMxn=", "tcOficial=", "tcOficialFecha=", "paywiseComisionPct=", "rol={rol}"]) {
      expect(card).toContain(prop);
    }
  });
});
