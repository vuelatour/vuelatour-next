/**
 * Conciliación → balance (13-oct-2026, API 0.0.75, punto 5): bajo cada gasto
 * ligado, «Ver en balance del avión N4142R» y «Ver en balance general» abren
 * en una pestaña nueva el libro en la celda de ese gasto. Qué se custodia:
 *  1. los enlaces son `<a target="_blank">` NATIVOS y HERMANOS del `<Link>`
 *     de la línea (nunca un `<a>` dentro de otro), con `gasto=`, rel,
 *     cursor-pointer y el texto para el lector de pantalla;
 *  2. en un lote, cada línea lleva los suyos;
 *  3. el corte por rol (`abreBalances`) y la página que lo cablea;
 *  4. sin `balance` (API previo) el marcado es IDÉNTICO al de siempre.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoBancario, MovimientoGasto, UbicacionBalanceGasto } from "@/types/conciliacion";

// Mismos mocks que `lote.test.tsx`: la fila monta el menú (diálogos con red).
vi.mock("@/lib/api/ingresos-browser", () => ({
  registrarIngreso: async () => ({ ok: false, error: "no" }),
  editarIngreso: async () => ({ ok: false, error: "no" }),
  motivoComprobanteIngresoInvalido: () => null,
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/conciliacion/actions", () => ({
  candidatosCobroAction: vi.fn(),
  candidatosReversoAction: vi.fn(),
  clasificarMovimientoAction: vi.fn(),
  crearClasificacionAction: vi.fn(),
  emparejarReversoAction: vi.fn(),
  emparejarReversosAutoAction: vi.fn(),
  gastosCandidatosAction: vi.fn(() => new Promise(() => {})),
  linkMovimientoAction: vi.fn(),
  linkMovimientoCobroAction: vi.fn(),
  linkMovimientoGastosAction: vi.fn(),
  listClasificacionesAction: vi.fn(),
  quitarReversoAction: vi.fn(),
  sugerirMovimientoAction: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  clasificarAbonoAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div data-dialogo="abierto">{children}</div> : null,
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { MovimientosTable } = await import("../movimientos-table");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const N4142R = "4142a000-0000-4000-8000-000000000001";
const XA_VGV = "a0a0a0a0-0000-4000-8000-000000000002";
// Caso de QA de prod: OPERACIONES $1,899.09 del vuelo #430 de N4142R.
const G_430 = "2a3e7a09-5d1c-4b7e-9f00-000000000430";
const VUELO_430 = "f4300000-0000-4000-8000-000000000430";

const OCTUBRE: UbicacionBalanceGasto = {
  periodo: { desde: "2026-10-01", hasta: "2026-10-31" },
  eje: "vuelo",
  aviones: [{ id: N4142R, matricula: "N4142R" }],
  general: true,
  hoja_avion: "reporte_horas",
  hoja_general: "reporte_horas",
};

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "c5819d4b-6a3e-4f43-9a5f-0d1b6f6a0430",
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-10-10",
  tipo: "CARGO",
  monto: "1899.09",
  descripcion: "SPEI ENVIADO ASA",
  referencia: null,
  conciliado: true,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-10-11T15:00:00Z",
  ...m,
});

const gasto430 = (extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: G_430,
  monto: "1899.09",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-10-10",
  vuelo_id: VUELO_430,
  vuelo: { folio: 430 },
  proveedor: { nombre: "ASA" },
  ...extra,
});

const parte = (folio: number, monto: string, extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: `a${folio}0000-0000-4000-8000-000000000${folio}`,
  monto,
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-14",
  vuelo_id: `f${folio}0000-0000-4000-8000-000000000${folio}`,
  vuelo: { folio },
  proveedor: null,
  lugar: null,
  notas_primera_linea: "Pago VIP SAESA",
  monto_parte: monto,
  ...extra,
});

function tabla(rows: MovimientoBancario[], props: { abreBalances?: boolean } = {}): string {
  return renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} {...props} />);
}

const cuenta = (html: string, texto: string) => html.split(texto).length - 1;
/** Un `<a>` abierto que contiene otro `<a>` antes de cerrarse. */
const A_ANIDADO = /<a[^>]*>(?:(?!<\/a>)[\s\S])*<a/;
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("1↔1: los enlaces van como HERMANOS del enlace al gasto", () => {
  const html = tabla([mov({ gasto_id: G_430, gasto: gasto430({ balance: OCTUBRE }) })]);

  it("el enlace de siempre al vuelo y, debajo, «Ver en balance del avión N4142R» y «Ver en balance general»", () => {
    expect(html).toContain(`href="/admin/flights/${VUELO_430}"`);
    expect(html).toContain('title="Ver el gasto con el que se concilió"');
    expect(html).toContain("Operaciones · $1,899.09");
    expect(html).toContain("data-enlaces-balance");
    expect(html).toContain(">Ver en balance del avión N4142R<");
    expect(html).toContain(">Ver en balance general<");
    // Los enlaces vienen DESPUÉS del de siempre (hermanos, no hijos).
    expect(html.indexOf(`href="/admin/flights/${VUELO_430}"`)).toBeLessThan(html.indexOf("data-enlaces-balance"));
    expect(html).not.toMatch(A_ANIDADO);
  });

  it("pestaña nueva nativa: target, rel, cursor-pointer, `gasto=` y el texto para el lector de pantalla", () => {
    const enlaces = html.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
    expect(enlaces).toHaveLength(2);
    for (const a of enlaces) {
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain("cursor-pointer");
      expect(a).toContain(`gasto=${G_430}`);
    }
    expect(enlaces[0]).toContain(`href="/admin/reportes/balance?avion=${N4142R}&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;gasto=${G_430}"`);
    expect(enlaces[1]).toContain(`href="/admin/reportes/balance?modo=mensual&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;gasto=${G_430}"`);
    expect(enlaces[0]).toContain(
      'title="Abre en una pestaña nueva el balance de N4142R (del 01 oct 2026 al 31 oct 2026, mes del vuelo) en la celda de este gasto"',
    );
    expect(cuenta(html, '<span class="sr-only"> (se abre en una pestaña nueva)</span>')).toBe(2);
    // El ícono es decorativo.
    expect(cuenta(html, 'aria-hidden="true"')).toBeGreaterThanOrEqual(2);
  });
});

describe("lote: cada línea con sus enlaces", () => {
  it("3 gastos, cada uno con su `balance` ⇒ enlaces por línea y ningún <a> anidado", () => {
    const g1 = parte(315, "2801.40", { balance: { ...OCTUBRE, general: false } });
    const g2 = parte(319, "2801.40", {
      balance: { ...OCTUBRE, aviones: [{ id: XA_VGV, matricula: "XA-VGV" }], general: true },
    });
    const g3 = parte(326, "2801.40", { balance: null });
    const html = tabla([
      mov({ monto: "8404.20", gastos_n: 3, gastos: [g1, g2, g3], gastos_suma: 8404.2, gastos_diferencia: 0 }),
    ]);
    expect(html).toContain("3 gastos · $8,404.20");
    expect(cuenta(html, 'title="Ver el gasto con el que se concilió"')).toBe(3);
    expect(cuenta(html, "data-enlaces-balance")).toBe(2);
    expect(html).toContain(`avion=${N4142R}&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;gasto=${g1.id}`);
    expect(html).toContain(`avion=${XA_VGV}&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;gasto=${g2.id}`);
    expect(html).toContain(`modo=mensual&amp;desde=2026-10-01&amp;hasta=2026-10-31&amp;gasto=${g2.id}`);
    expect(cuenta(html, ">Ver en balance general<")).toBe(1);
    expect(html).not.toContain(`gasto=${g3.id}`);
    // Los enlaces del 1.º gasto van entre su línea y la del 2.º.
    const i1 = html.indexOf(`/admin/flights/${g1.vuelo_id}`);
    const iEnlace1 = html.indexOf(`gasto=${g1.id}`);
    const i2 = html.indexOf(`/admin/flights/${g2.vuelo_id}`);
    expect(i1).toBeLessThan(iEnlace1);
    expect(iEnlace1).toBeLessThan(i2);
    expect(html).not.toMatch(A_ANIDADO);
  });
});

describe("corte por rol y API previo", () => {
  it("`abreBalances={false}` (FACTURACION: los libros son de ADMIN/ANALISTA) ⇒ ningún «Ver en balance»", () => {
    const rows = [mov({ gasto_id: G_430, gasto: gasto430({ balance: OCTUBRE }) })];
    const html = tabla(rows, { abreBalances: false });
    expect(html).not.toContain("Ver en balance");
    expect(html).not.toContain("data-enlaces-balance");
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("Operaciones · $1,899.09");
    // Sin la prop se ofrecen (sin rol, el candado es el API).
    expect(tabla(rows)).toContain("Ver en balance del avión N4142R");
  });

  it("sin `balance` (ausente) o con `balance: null` el marcado es IDÉNTICO y sin enlaces (1↔1 y lote)", () => {
    const ausente = tabla([mov({ gasto_id: G_430, gasto: gasto430() })]);
    const nulo = tabla([mov({ gasto_id: G_430, gasto: gasto430({ balance: null }) })]);
    expect(nulo).toBe(ausente);
    expect(ausente).not.toContain("Ver en balance");
    expect(ausente).not.toContain("data-enlaces-balance");
    // Con el corte por rol, el marcado también es el de siempre.
    expect(tabla([mov({ gasto_id: G_430, gasto: gasto430({ balance: OCTUBRE }) })], { abreBalances: false })).toBe(
      ausente,
    );
    const lote = (b?: UbicacionBalanceGasto | null) =>
      tabla([
        mov({
          monto: "5602.80",
          gastos_n: 2,
          gastos: [parte(315, "2801.40", b === undefined ? {} : { balance: b }), parte(319, "2801.40")],
        }),
      ]);
    expect(lote(null)).toBe(lote(undefined));
    expect(lote(undefined)).not.toContain("data-enlaces-balance");
  });
});

describe("cableado leído del fuente", () => {
  it("la página lee `/me` degradado y pasa `abreBalances` con `puedeAbrirBalances`", () => {
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    expect(page).toContain('degradado.opcional("tu usuario", getMe(), null)');
    expect(page).toContain("abreBalances={puedeAbrirBalances(me?.rol)}");
    expect(page).toContain('from "@/lib/admin/balance-vista"');
  });

  it("la tabla: los enlaces son HERMANOS del <Link> (fragmento), con el corte por rol en las dos ramas", () => {
    const src = leer("../movimientos-table.tsx");
    expect(src).toContain("<Fragment key={l.key}>");
    expect(src).toContain("{abreBalances ? <EnlacesBalanceGasto enlaces={l.balances} /> : null}");
    expect(src).toContain("{abreBalances ? <EnlacesBalanceGasto enlaces={enlacesBalanceDeGasto(gasto)} /> : null}");
    expect(src).toMatch(/\[[^\]]*gastoResaltado, abreBalances\],/);
    const comp = leer("../enlaces-balance-gasto.tsx");
    // `<a>` nativo (pestaña nueva sin prefetch por fila) y sin hooks.
    expect(comp).not.toContain("next/link");
    expect(comp).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(comp).toContain('target="_blank" rel="noopener noreferrer"');
  });
});
