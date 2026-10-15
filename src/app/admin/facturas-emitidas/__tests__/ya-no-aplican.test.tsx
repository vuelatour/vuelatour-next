/**
 * «Facturas emitidas» → tercera tarjeta «Solicitudes automáticas que ya no
 * aplican» (14-oct-2026, API 0.0.77, invariante 60 del API; decisión del
 * cliente: «¿Un anticipo devuelto lleva CFDI?» ⇒ «eso no»).
 *
 * El API saca de «Por facturar» (y del badge) la solicitud que pidió SOLO al
 * registrar un cobro en una cuenta que exige factura cuando el dinero se
 * devuelve (o se corrige o elimina el cobro), y la manda aparte en
 * `ya_no_aplican`. La página la pinta con la MISMA `PorFacturarTable`
 * (paginación `pfy`, el `resaltar` de los avisos, «Retirar solicitud» con
 * confirmación) y el ancla `#ya-no-aplican`; sin la llave (API previo), vacía
 * o con la carga caída NO hay tarjeta (y nunca un «nada pendiente» falso).
 *
 * Se pinta la PÁGINA de verdad (Server Component) con el API simulado.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ListaFacturasEmitidas,
  ListaPorFacturar,
  PorFacturarItem,
} from "@/types/facturas-emitidas";

const porFacturar = vi.fn<() => Promise<ListaPorFacturar>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/facturas-emitidas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/me", () => ({
  getMe: async () => ({ id: "u-mary", nombre: "Mary Cruz", rol: "FACTURACION" }),
}));
vi.mock("@/lib/api/clients-server", () => ({ listClients: async () => ({ data: [] }) }));
vi.mock("@/lib/api/issuing-entities-server", () => ({ listIssuingEntities: async () => ({ data: [] }) }));
vi.mock("@/lib/api/facturas-emitidas-server", () => ({
  getPorFacturar: () => porFacturar(),
  listFacturasEmitidasAll: async () => LISTA,
}));
vi.mock("@/lib/download", () => ({ descargarDelApi: async () => null }));
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
  ligarVueloAFactura: async () => ({ ok: false, error: "no" }),
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));

const { default: FacturasEmitidasPage } = await import("../page");

const LISTA: ListaFacturasEmitidas & { huboCorte: boolean } = {
  data: [],
  count: 0,
  limit: 500,
  offset: 0,
  resumen: {
    registradas: 0,
    vigentes: 0,
    canceladas: 0,
    sin_pdf: 0,
    sin_vuelo: 0,
    vuelos_con_varias: 0,
    en_vuelo_cancelado: 0,
    por_facturar: 0,
    totales_vigentes: [],
    huecos: [],
  },
  filtrado: { count: 0, totales: [] },
  huboCorte: false,
};

const V341 = "dc204a2f-6342-43f1-9406-f76dc1302b97";
const V215 = "6d1f0a41-2b7e-4c55-9d0a-6a5e2b215215";

function item(id: string, folio: number, nota: string): PorFacturarItem {
  return {
    vuelo: {
      id,
      folio,
      estado: "CONFIRMADO",
      fecha_vuelo: "2026-09-27T14:00:00+00:00",
      ruta_iatas: ["CUN", "MID", "CUN"],
      es_externo: false,
      grupo: null,
      estatus_manual: "SIN_FACTURA",
    },
    cliente: {
      id: "c-1",
      nombre: "Maqar",
      rfc: "MMA150622P83",
      razon_social: "MAQAR MACHINERY",
      regimen_fiscal: "601",
      uso_cfdi: "G03",
      codigo_postal: "77500",
      domicilio_fiscal: null,
      pais_residencia: null,
    },
    faltan_datos_fiscales: [],
    total: { usd: 1734.1, mxn: 30000 },
    cobro: {
      monto_total_usd: 1734.1,
      total_cobrado_usd: 0,
      sin_tc_count: 0,
      cobrado: false,
      cotizacion_abierta: false,
      estado_vuelo: "CONFIRMADO",
      es_interno: false,
      semaforo: { key: "SIN_COBROS", label: "Sin cobro", color: "rojo" },
    },
    solicitud: {
      solicitada_at: "2026-10-05T18:00:00.000Z",
      solicitada_por: { id: "u-itzi", nombre: "Itzi" },
      nota,
      paga_contra_factura: false,
    },
    facturas_canceladas: 0,
  };
}

const PENDIENTE = item(V215, 215, "La necesita para pagar");
const AUTOMATICA = item(V341, 341, "Solicitada automáticamente: cobro en HSBC Pesos");

const pintar = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await FacturasEmitidasPage({ searchParams: Promise.resolve(sp) }));

/** La tarjeta `#ya-no-aplican`: de su `<div …>` al cierre de la sección. */
const tarjeta = (html: string): string => {
  const i = html.indexOf('id="ya-no-aplican"');
  return i < 0 ? "" : html.slice(html.lastIndexOf("<div", i), html.indexOf("</section>", i));
};

/** Solo la etiqueta de apertura de la tarjeta (sus atributos). */
const apertura = (html: string): string => {
  const t = tarjeta(html);
  return t.slice(0, t.indexOf(">") + 1);
};

beforeEach(() => porFacturar.mockReset());

describe("tercera tarjeta «Solicitudes automáticas que ya no aplican»", () => {
  it("con `ya_no_aplican` del API: título con el conteo, descripción, ancla y la fila (fuera de «Por facturar»)", async () => {
    porFacturar.mockResolvedValueOnce({
      data: [PENDIENTE],
      count: 1,
      marcados_sin_registro: [],
      ya_no_aplican: [AUTOMATICA],
    });
    const html = await pintar();
    expect(html).toContain("Por facturar (1)");
    const t = tarjeta(html);
    // El ancla del enlace (`/admin/facturas-emitidas#ya-no-aplican`) no queda bajo la barra.
    expect(apertura(html)).toMatch(
      /^<div data-slot="card"[^>]*class="[^"]*\bscroll-mt-24\b[^"]*" id="ya-no-aplican" data-ya-no-aplican="true">$/,
    );
    expect(t).toContain("Solicitudes automáticas que ya no aplican (1)");
    expect(t).toContain(
      "Se pidieron solas al registrar un cobro en una cuenta que exige factura, pero el dinero se devolvió o el cobro se corrigió o se eliminó: ya no llevan factura (un anticipo devuelto no lleva CFDI). No cuentan en «Por facturar»; retíralas aquí.",
    );
    // La fila de la automática vive SOLO en su tarjeta; la pendiente, arriba.
    expect(t).toContain(`id="por-facturar-${V341}"`);
    expect(t).toContain("Solicitada automáticamente: cobro en HSBC Pesos");
    expect(t).not.toContain(`id="por-facturar-${V215}"`);
    expect(html.indexOf(`id="por-facturar-${V215}"`)).toBeLessThan(html.indexOf('id="ya-no-aplican"'));
    // Misma tabla; lo VISIBLE es «Retirar solicitud» (lo que pide la tarjeta) y
    // «Registrar factura» queda en el ⋯ (revisión del 15-oct-2026).
    expect(t).toContain("Retirar solicitud");
    expect(t).not.toContain("Registrar factura");
    expect(t).toContain("Más acciones del vuelo #341");
  });

  it("la tarjeta va DENTRO de la sección «Por facturar», después de la de los marcados", async () => {
    const marcado = item("0f2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", 376, "Ya la hizo Mary");
    marcado.vuelo.estatus_manual = "FACTURADO";
    porFacturar.mockResolvedValueOnce({
      data: [],
      count: 0,
      marcados_sin_registro: [marcado],
      ya_no_aplican: [AUTOMATICA],
    });
    const html = await pintar();
    const seccion = html.indexOf('id="por-facturar"');
    const marcados = html.indexOf("data-marcados-sin-registro");
    const yaNo = html.indexOf('id="ya-no-aplican"');
    expect(seccion).toBeGreaterThan(-1);
    expect(marcados).toBeGreaterThan(seccion);
    expect(yaNo).toBeGreaterThan(marcados);
    expect(html.indexOf("</section>", seccion)).toBeGreaterThan(yaNo);
    // «Por facturar» vacía dice «nada pendiente» (la lectura fue BUENA).
    expect(html).toContain("Nada pendiente por facturar.");
  });

  it("`?resaltar=<vuelo>` (link de los avisos) pone el anillo en SU fila también en esta tarjeta", async () => {
    porFacturar.mockResolvedValueOnce({ data: [], count: 0, marcados_sin_registro: [], ya_no_aplican: [AUTOMATICA] });
    const t = tarjeta(await pintar({ resaltar: V341 }));
    expect(t).toContain("ring-amber-400");
    // Un `resaltar` que no es uuid se IGNORA (url-params): sin anillo.
    porFacturar.mockResolvedValueOnce({ data: [], count: 0, marcados_sin_registro: [], ya_no_aplican: [AUTOMATICA] });
    expect(tarjeta(await pintar({ resaltar: "no-es-uuid" }))).not.toContain("ring-amber-400");
  });

  it("sin la llave (API ≤ 0.0.76) o vacía: no hay tarjeta", async () => {
    porFacturar.mockResolvedValueOnce({ data: [PENDIENTE], count: 1, marcados_sin_registro: [] });
    const previo = await pintar();
    expect(previo).toContain("Por facturar (1)");
    expect(previo).not.toContain("ya-no-aplican");
    expect(previo).not.toContain("Solicitudes automáticas que ya no aplican");
    porFacturar.mockResolvedValueOnce({ data: [PENDIENTE], count: 1, marcados_sin_registro: [], ya_no_aplican: [] });
    expect(await pintar()).not.toContain("Solicitudes automáticas que ya no aplican");
  });

  it("si «Por facturar» no se pudo leer: tarjeta de error, ni «nada pendiente» ni tercera tarjeta", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    porFacturar.mockRejectedValueOnce(new Error("fetch failed"));
    const html = await pintar();
    expect(consola).toHaveBeenCalled();
    consola.mockRestore();
    expect(html).toContain("No se pudo cargar «Por facturar»");
    expect(html).not.toContain("Nada pendiente por facturar.");
    expect(html).not.toContain("Solicitudes automáticas que ya no aplican");
  });
});
