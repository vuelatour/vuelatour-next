/**
 * SSR de `/admin/profit-sharing/aviones/[id]` EN PESTAÑAS (23-oct-2026).
 * Pedido del cliente: «las tablas acomódalas por pestañas, para que no esté
 * una tabla encima de otra y nos confundamos con el scroll». Se custodia:
 *  1. el saldo y la cascada («Cómo se llega al saldo») quedan ARRIBA, antes
 *     de las pestañas, y la cascada sigue en el orden del Excel;
 *  2. la tira «Gastos del periodo (n) · Vuelos (n) · Socios · Entregas (n)»
 *     con los conteos reales y SOLO la sección activa pintada;
 *  3. la pestaña inicial es «Gastos del periodo» (con sus pastillas por
 *     grupo) y `?seccion=socios` abre los socios; basura ⇒ la primera.
 * Las lecturas del API se apagan: la página pinta lo que se le da.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { avionA, avionCombustible } from "@/components/admin/profit-sharing/__tests__/reparto-pesos.fixtures";
import type { AvionDetalleRespuesta, FilaGastoDetalle } from "@/types/profit-sharing";

const ALE = { id: "0f1c0000-0000-4000-8000-000000000009", nombre: "Alejandro Canales" };
const AV = "a1a1a1a1-0000-4000-8000-000000000621";
const SOCIO = "50c10000-0000-4000-8000-000000000001";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => `/admin/profit-sharing/aviones/${AV}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/profit-sharing/actions", () => ({
  crearPagoSocioAction: async () => ({ ok: true }),
  editarPagoSocioAction: async () => ({ ok: true }),
  eliminarPagoSocioAction: async () => ({ ok: true }),
  configurarCuentaSocioAction: async () => ({ ok: true }),
  cambiarDescuentoReservaAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/api/reparto-pagos-browser", () => ({
  adjuntarComprobantePagoSocio: async () => ({ ok: true }),
}));
vi.mock("@/components/admin/excel-export-button", () => ({ ExcelExportButton: () => null }));
// El selector de periodo arrastra `mes-reporte-select` → `@/lib/download` →
// `@/lib/env` (lanza sin variables); no es lo que se prueba aquí.
vi.mock("@/components/admin/profit-sharing/period-selector", () => ({ PeriodSelector: () => null }));
// Las lecturas del servidor (todas pasan por `apiServer` → `@/lib/env`).
vi.mock("@/lib/api/me", () => ({
  getMe: async () => ({ id: ALE.id, rol: "ADMIN", nombre: ALE.nombre }),
}));
vi.mock("@/lib/api/inicio-oficial", () => ({ getInicioOficial: async () => null }));
vi.mock("@/lib/api/aircraft", () => ({ listAircraftOwners: async () => [] }));
const respuesta = { actual: null as AvionDetalleRespuesta | null };
vi.mock("@/lib/api/profit-sharing-server", () => ({
  getAvionDetalle: async () => ({ estado: "ok", datos: respuesta.actual }),
  getSociosCuenta: async () => ({ estado: "no-disponible" }),
  getContextoRegistro: async () => ({ usuarios: [ALE], me: ALE, hoy: "2026-10-23", tcOficial: 18.45 }),
}));

const { default: RepartoAvionPage } = await import("../aviones/[id]/page");

const gasto = (over: Partial<FilaGastoDetalle>): FilaGastoDetalle => ({
  id: "g-1",
  fecha: "2026-09-10",
  categoria: "GAS",
  etiqueta: "Combustible",
  clave: "GAS",
  grupo: "COMBUSTIBLE",
  concepto: "Turbosina CUN",
  vuelo: { id: "b2b2b2b2-0000-4000-8000-000000000301", folio: 301 },
  monto: 100000,
  moneda: "MXN",
  tc: null,
  descontado_mxn: 0,
  usd: 5797.1,
  mxn: 100000,
  tc_oficial: true,
  es_reparto_parcial: false,
  ...over,
});

/** N621TX sep-2026 (combustible separado) con 3 vuelos, 3 gastos, 1 socio y sin entregas. */
function datos(): AvionDetalleRespuesta {
  const a = avionCombustible();
  return {
    periodo: { desde: "2026-09-01", hasta: "2026-09-30" },
    reparto_en_pesos: true,
    reparto_como_balance: true,
    avion: {
      ...a,
      aeronave: { ...a.aeronave, id: AV },
      detalle: {
        ...a.detalle!,
        vuelos: avionA().detalle!.vuelos,
        gastos: [
          gasto({}),
          gasto({ id: "g-2", fecha: "2026-09-18", monto: 47277.58, mxn: 47277.58, usd: 2740.73 }),
          gasto({ id: "g-3", categoria: "HOTEL", etiqueta: "Hotel", clave: "HOTEL", grupo: "DIRECTO", monto: 40588.14, mxn: 40588.14, usd: 2352.94 }),
        ],
      },
    },
    socios: [
      {
        socio_id: SOCIO,
        socio_nombre: "Hernán Pérez",
        porcentaje: 40.92,
        utilidad_mxn: 235139.5,
        reserva_mxn: 3529.35,
        descuenta_reserva: true,
        monto_mxn: 231610.15,
        entregado_mxn: 0,
        por_entregar_mxn: 231610.15,
        monto_usd: 13413.64,
        reserva_usd: 204.6,
      },
    ],
    entregas: [],
    cierre: null,
    tc_oficial: null,
    gastos_sin_tc: null,
  };
}

async function pintar(sp: { desde?: string; hasta?: string; seccion?: string }) {
  respuesta.actual = datos();
  const el = await RepartoAvionPage({ params: Promise.resolve({ id: AV }), searchParams: Promise.resolve(sp) });
  return renderToStaticMarkup(el);
}

const pos = (html: string, texto: string) => {
  const i = html.indexOf(texto);
  expect(i, texto).toBeGreaterThan(-1);
  return i;
};
const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" };

describe("la pantalla del avión en pestañas (SSR)", () => {
  it("el saldo y la cascada quedan ARRIBA (la cascada en el orden del Excel); debajo la tira de pestañas con los conteos reales", async () => {
    const html = await pintar(PERIODO);
    const saldo = pos(html, "data-saldo-avion");
    const cascada = pos(html, `data-cascada-avion="${AV}"`);
    const tira = pos(html, 'role="tablist" aria-label="Secciones del reparto del avión"');
    expect(saldo).toBeLessThan(cascada);
    expect(cascada).toBeLessThan(tira);
    expect(html).toContain(">Cómo se llega al saldo<");
    expect(html).toContain(">Utilidad antes de gastos<");
    expect(html).toContain(">Saldo a repartir<");
    expect(html).toContain(">$702,096.50 MXN<");
    const texto = html.replace(/<[^>]+>/g, "");
    expect(texto).toContain("Gastos del periodo (3)");
    expect(texto).toContain("Vuelos (3)");
    expect(texto).toContain("Entregas (0)");
    expect(html).toContain('data-pestana="socios"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(4 + 2); // 4 secciones + 2 pastillas de grupo
    expect(html).toContain('data-pestanas="pagina"');
  });

  it("pestaña inicial «Gastos del periodo»: SOLO su panel se pinta, con las pastillas por grupo y una tabla a la vez", async () => {
    const html = await pintar(PERIODO);
    expect(html).toMatch(/data-pestana="gastos" data-activa=""/);
    expect(html).toContain('data-panel-pestana="gastos"');
    expect(html).toContain('data-seccion-avion="gastos"');
    expect(html).toContain("data-gastos-avion");
    expect(html).toContain('role="tablist" aria-label="Grupos de gastos"');
    expect(html).toMatch(/data-pestana="DIRECTO" data-activa=""/);
    expect(html).toContain('data-pestana="COMBUSTIBLE"');
    expect(html).toContain('data-grupo-gastos="DIRECTO"');
    expect(html).not.toContain('data-grupo-gastos="COMBUSTIBLE"');
    expect(html).toContain("Cuadra con la fila «Gastos directos» de la cascada ($40,588.14 MXN).");
    // Las otras secciones no están en el DOM.
    expect(html).not.toContain('data-seccion-avion="vuelos"');
    expect(html).not.toContain('data-seccion-avion="socios"');
    expect(html).not.toContain('data-seccion-avion="entregas"');
    expect(html).not.toContain("data-tabla-socios-avion");
  });

  it("`?seccion=socios` abre los socios (la cascada sigue arriba); basura ⇒ «Gastos del periodo»", async () => {
    const html = await pintar({ ...PERIODO, seccion: "socios" });
    expect(html).toMatch(/data-pestana="socios" data-activa=""/);
    expect(html).toContain('data-panel-pestana="socios"');
    expect(html).toContain('data-seccion-avion="socios"');
    expect(html).toContain("data-tabla-socios-avion");
    expect(html).toContain(">Hernán Pérez<");
    expect(html).not.toContain('data-seccion-avion="gastos"');
    expect(html).not.toContain("data-gastos-avion");
    expect(pos(html, `data-cascada-avion="${AV}"`)).toBeLessThan(pos(html, 'role="tablist"'));
    const basura = await pintar({ ...PERIODO, seccion: "nada" });
    expect(basura).toMatch(/data-pestana="gastos" data-activa=""/);
    expect(basura).toContain('data-seccion-avion="gastos"');
    const entregas = await pintar({ ...PERIODO, seccion: "entregas" });
    expect(entregas).toContain('data-seccion-avion="entregas"');
    expect(entregas).toContain("Sin entregas que correspondan a este avión en el periodo.");
  });
});
