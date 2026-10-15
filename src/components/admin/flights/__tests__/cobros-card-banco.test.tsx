/**
 * UN COBRO, VARIOS ABONOS en las cards de cobros del VUELO y de la COTIZACIÓN
 * (14-oct-2026, API 0.0.78, invariante 77) — cableado:
 *  1. El badge de 3 estados (`CobroConciliadoBadge`): «Conciliado parcial ·
 *     faltan $1,700 MXN» ámbar, «Sin conciliar» rosa, «Conciliado» verde;
 *     con un API previo, el de siempre.
 *  2. El renglón «Banco» (`CobroBancoDetalle`) con «ver» y «Buscar el abono
 *     que falta» (pestaña nueva, cursor-pointer) SOLO para quien concilia.
 *  3. «Cobrado de más» (`CobradoDeMasAviso`) en las dos cards.
 *  4. La ficha «Corregir cobro» recibe `saldoUsd` y `monto_usd` (D21).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CobradoDeMasVuelo, FlightCobro } from "@/types/flights";

vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
// Cada ficha se pinta como un marcador con lo que recibe para la vista previa.
vi.mock("../cobro-form-sheet", () => ({
  CobroFormSheet: (p: { cobroEditar?: unknown; saldoUsd?: number | null; montoUsdOriginal?: number | null }) => (
    <i
      data-ficha-cobro={"cobroEditar" in p ? "edicion" : "alta"}
      data-saldo-usd={p.saldoUsd === undefined ? "ausente" : String(p.saldoUsd)}
      data-monto-usd-original={p.montoUsdOriginal === undefined ? "ausente" : String(p.montoUsdOriginal)}
    />
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
// La card monta la hoja «Conciliación con el banco» del cobro (15-oct-2026,
// API 0.0.78): sus actions no se llaman al pintar.
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeEntradaAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { CobrosCard } = await import("../cobros-card");
const { QuoteCobrosCard } = await import("@/components/admin/quotes/quote-cobros-card");

const CUENTA_EJE = "7d0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const MOV_1 = "32dd3b1d-0000-4a7b-8c9d-0e1f2a3b4c5d";

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
  registrado_por: null,
  notas: null,
  created_at: "2026-09-15T17:00:00+00:00",
  updated_at: "2026-09-15T17:00:00+00:00",
};

const PARCIAL: FlightCobro = {
  ...COBRO_3400,
  conciliado: false,
  conciliado_via: "DIRECTO",
  conciliacion_estado: "PARCIAL",
  ligado_banco: true,
  neto_banco: 3400,
  monto_vinculado: 1700,
  faltante: 1700,
  sobrante: 0,
  monto_usd: 195.97,
  abonos_banco: [
    {
      movimiento_id: MOV_1,
      fecha: "2026-09-15",
      monto_parte: 1700,
      monto_abono: 1700,
      cobros_n: 1,
      cuenta_bancaria_id: CUENTA_EJE,
      cuenta_alias: "EJE SCOTIA",
      pasarela: false,
    },
  ],
};

const SIN_CONCILIAR: FlightCobro = {
  ...COBRO_3400,
  id: "c-sin",
  conciliado: false,
  conciliacion_estado: "SIN_CONCILIAR",
  ligado_banco: false,
  abonos_banco: [],
};

const IVA: CobradoDeMasVuelo = {
  excedente_usd: 495.99,
  cobrado_usd: 3595.99,
  total_usd: 3100,
  causa: "IVA_NO_COTIZADO",
  causa_etiqueta: "IVA que la cotización no lleva",
  requiere_revision: true,
  tono: "AVISO",
  titulo: "Cobrado de más: $495.99 USD",
  explicacion: "Lo cobrado ($3,595.99 USD) rebasa el monto total ($3,100.00 USD). Posible causa: IVA.",
  que_hacer: "Si se le facturó con IVA, corrige la cotización.",
  referencia: null,
  sin_tc: null,
};

function vuelo(cobros: FlightCobro[], rol: string | null, cobradoDeMas: CobradoDeMasVuelo | null = null): string {
  return renderToStaticMarkup(
    <CobrosCard
      flightId="v-315"
      flightFolio={315}
      flightEstado="CONFIRMADO"
      montoTotalUsd={3100}
      pendingUsd={0}
      cobradoUsd={3595.99}
      cobros={cobros}
      rol={rol}
      cobradoDeMas={cobradoDeMas}
    />,
  );
}

function cotizacion(cobros: FlightCobro[], rol: string | null, cobradoDeMas: CobradoDeMasVuelo | null = null): string {
  return renderToStaticMarkup(
    <QuoteCobrosCard
      quoteId="v-315"
      quoteFolio={315}
      montoTotalUsd={3100}
      totalCobrado={3595.99}
      cobros={cobros}
      rol={rol}
      cobradoDeMas={cobradoDeMas}
    />,
  );
}

const HREF_BUSCAR = "/admin/conciliacion?f=pendientes&amp;desde=2026-09-08&amp;hasta=2026-10-15&amp;mvq=1700";
const HREF_VER = `/admin/conciliacion?f=conciliados&amp;cuenta=${CUENTA_EJE}&amp;desde=2026-09-15&amp;hasta=2026-09-15&amp;mov=${MOV_1}`;

/** La etiqueta de apertura del <a> cuyo texto es `texto` (sin depender del orden de atributos). */
function anclaCon(html: string, texto: string): string | null {
  const re = /<a\b[^>]*>([^<]*)<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (m[1] === texto) return m[0];
  }
  return null;
}

describe.each([
  ["vuelo", vuelo],
  ["cotización", cotizacion],
] as const)("card de cobros del %s", (_nombre, render) => {
  it("PARCIAL: badge ámbar «Conciliado parcial · faltan $1,700 MXN» con su tooltip", () => {
    // Para quien ve el banco (ADMIN) el badge es el BOTÓN que abre la hoja
    // «Conciliación con el banco» (15-oct-2026); para COORDINADOR, el <span> de siempre.
    const html = render([PARCIAL], "ADMIN");
    expect(html).toMatch(
      /<button[^>]*class="[^"]*border-amber-500\/50 bg-amber-500\/10 text-amber-700 dark:text-amber-300[^"]*"[^>]*title="El banco respalda \$1,700 MXN de \$3,400 MXN \(1 abono: 15 sep 2026 · EJE SCOTIA\)\. Faltan \$1,700 MXN[^"]*"[^>]*>Conciliado parcial · faltan \$1,700 MXN<\/button>/,
    );
    expect(render([PARCIAL], "COORDINADOR")).toMatch(
      /<span[^>]*class="[^"]*border-amber-500\/50 bg-amber-500\/10 text-amber-700 dark:text-amber-300[^"]*"[^>]*title="El banco respalda \$1,700 MXN de \$3,400 MXN \(1 abono: 15 sep 2026 · EJE SCOTIA\)\. Faltan \$1,700 MXN[^"]*"[^>]*>Conciliado parcial · faltan \$1,700 MXN<\/span>/,
    );
    expect(html).not.toContain(">Conciliado<");
    // Largo: envuelve en un celular en vez de encimarse con los botones.
    expect(html).toMatch(/class="[^"]*whitespace-normal[^"]*"[^>]*>Conciliado parcial · faltan/);
  });

  it("renglón «Banco» con «ver» y «Buscar el abono que falta» (pestaña nueva) para quien concilia", () => {
    const html = render([PARCIAL], "FACTURACION");
    expect(html).toContain('data-cobro-banco="aviso"');
    expect(html).toContain("Banco: $1,700 de $3,400 · abono del 15 sep 2026 (");
    const ver = anclaCon(html, "ver");
    expect(ver).toContain(`href="${HREF_VER}"`);
    expect(ver).toContain('target="_blank"');
    expect(ver).toContain("cursor-pointer");
    const buscar = anclaCon(html, "Buscar el abono que falta");
    expect(buscar).toContain(`href="${HREF_BUSCAR}"`);
    expect(buscar).toContain('target="_blank"');
    expect(buscar).toContain("cursor-pointer");
  });

  it("sin permiso de conciliar (COORDINADOR): el mismo texto, sin ligas a Conciliación", () => {
    const html = render([PARCIAL], "COORDINADOR");
    expect(html).toContain("Banco: $1,700 de $3,400 · abono del 15 sep 2026 · faltan $1,700 MXN");
    expect(html).not.toContain("Buscar el abono que falta");
    expect(html).not.toContain("/admin/conciliacion?");
  });

  it("SIN_CONCILIAR: badge rosa sin fondo; API previo sin conciliar: sin badge (como hoy)", () => {
    const html = render([SIN_CONCILIAR], "ADMIN");
    expect(html).toMatch(/class="[^"]*border-rose-500\/40 text-rose-600 dark:text-rose-400[^"]*"[^>]*>Sin conciliar</);
    const previo = render([COBRO_3400], "ADMIN");
    expect(previo).not.toContain("Sin conciliar");
    expect(previo).not.toContain("Conciliado");
    expect(previo).not.toContain("data-cobro-banco");
  });

  it("API previo conciliado: el badge verde de siempre (botón para quien ve el banco)", () => {
    const html = render([{ ...COBRO_3400, conciliado: true }], "COORDINADOR");
    expect(html).toMatch(
      /class="[^"]*ml-2 border-emerald-500\/40 bg-emerald-500\/10 text-emerald-700 dark:text-emerald-300 font-sans font-medium"[^>]*title="Conciliado con un movimiento bancario">Conciliado</,
    );
    // ADMIN: el mismo verde + cursor de mano y el clic (con un API ≤ 0.0.77 la hoja dice «falta actualizar el API»).
    expect(render([{ ...COBRO_3400, conciliado: true }], "ADMIN")).toMatch(
      /<button[^>]*class="[^"]*ml-2 border-emerald-500\/40 bg-emerald-500\/10 text-emerald-700 dark:text-emerald-300 font-sans font-medium cursor-pointer hover:bg-muted\/60"[^>]*title="Conciliado con un movimiento bancario\. Clic para ver el abono del banco y su estado de cuenta\."[^>]*>Conciliado<\/button>/,
    );
  });

  it("«Cobrado de más»: el aviso ámbar del API; sin bloque, nada", () => {
    const html = render([PARCIAL], "ADMIN", IVA);
    expect(html).toContain('data-cobrado-de-mas="aviso"');
    expect(html).toContain("Cobrado de más: $495.99 USD");
    // Va ANTES de la lista de cobros.
    expect(html.indexOf("Cobrado de más")).toBeLessThan(html.indexOf("Conciliado parcial · faltan"));
    expect(render([PARCIAL], "ADMIN")).not.toContain("data-cobrado-de-mas");
  });

  it("la ficha «Corregir cobro» recibe el saldo SIN topar (total − cobrado, números del API)", () => {
    const html = render([PARCIAL], "ADMIN");
    const m = /data-ficha-cobro="edicion" data-saldo-usd="([^"]+)"/.exec(html);
    expect(Number(m?.[1])).toBeCloseTo(-495.99, 2);
  });
});

describe("guardas de código", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

  it("las dos cards pasan el `monto_usd` del cobro que se corrige y el saldo del API", () => {
    expect(leer("../cobros-card.tsx")).toContain("montoUsdOriginal={editando?.monto_usd ?? null}");
    expect(leer("../cobros-card.tsx")).toContain("saldoUsd={montoTotalUsd - cobradoUsd}");
    const q = leer("../../quotes/quote-cobros-card.tsx");
    expect(q).toContain("montoUsdOriginal={editando?.monto_usd ?? null}");
    expect(q).toContain("saldoUsd={montoTotalUsd - totalCobrado}");
  });

  it("cotización ABIERTA: las fichas lo saben (la vista previa no dice «cobrado de más»)", () => {
    expect(leer("../cobros-card.tsx").match(/cotizacionAbierta=\{cotizacionAbierta\}/g)).toHaveLength(2);
    expect(leer("../../quotes/quote-cobros-card.tsx")).toContain("cotizacionAbierta={cotizacionAbierta}");
    expect(leer("../../quotes/quote-workspace.tsx").match(/cotizacionAbierta=\{quote\.cotizacion_abierta === true\}/g)).toHaveLength(2);
    expect(leer("../../../../app/admin/flights/[id]/page.tsx")).toContain(
      "cotizacionAbierta={snapshot.cotizacion_abierta === true}",
    );
  });

  it("la ficha de cobro dice rebasa / cubre / queda con `vistaPreviaMontoCobro` (sin la comparación vieja)", () => {
    const src = leer("../cobro-form-sheet.tsx");
    expect(src).toContain("vistaPreviaMontoCobro({");
    expect(src).not.toContain("usdEquivalente >= pendingUsd");
    expect(src).not.toContain("Quedará pendiente {fmtUsd(");
  });

  it("las páginas pasan `cobrado_de_mas` del snapshot a las dos cards", () => {
    expect(leer("../../../../app/admin/flights/[id]/page.tsx")).toContain(
      "cobradoDeMas={snapshot.cobrado_de_mas ?? null}",
    );
    expect(leer("../../../../app/admin/quotes/[id]/page.tsx")).toContain(
      "cobradoDeMas={cobrosVuelo?.cobrado_de_mas ?? null}",
    );
    expect(leer("../../quotes/quote-workspace.tsx")).toContain("cobradoDeMas={cobradoDeMas}");
  });
});
