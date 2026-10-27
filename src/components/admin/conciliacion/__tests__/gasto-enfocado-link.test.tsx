/**
 * Conciliación → Gastos (27-oct-2026). Pedido del cliente, con la captura de
 * la columna «Conciliación»: «Cuando le pico a la conciliación no me manda al
 * gasto conciliado, solo me manda al apartado de gastos». Qué se custodia:
 *  1. la liga 1↔1 «Ver el gasto con el que se concilió» de un gasto SIN vuelo
 *     abre Gastos de SU día con `?gasto=` (antes `/admin/expenses` a secas);
 *  2. con vuelo sigue yendo al vuelo (donde se ve su desglose);
 *  3. las líneas del lote (1 cargo ↔ N gastos) usan el MISMO href.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoBancario, MovimientoGasto } from "@/types/conciliacion";

// Mismos mocks que `balance-links.test.tsx`: la fila monta el menú (diálogos con red).
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
/** La refacción AIRCRAFT SPRUCE de la captura: 24 sep 2026, $794.61 USD, sin vuelo. */
const G_REFACCION = "7f2c1b40-5a3e-4c8d-9e21-0a6b7c8d9e01";
const G_430 = "2a3e7a09-5d1c-4b7e-9f00-000000000430";
const VUELO_430 = "f4300000-0000-4000-8000-000000000430";

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "c5819d4b-6a3e-4f43-9a5f-0d1b6f6a0430",
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-09-29",
  tipo: "CARGO",
  monto: "14431.18",
  descripcion: "AIRCRAFT SPRUCE AND SP",
  referencia: null,
  conciliado: true,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORT",
  notas: null,
  created_at: "2026-09-30T15:00:00Z",
  ...m,
});

const refaccion = (extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: G_REFACCION,
  monto: "794.61",
  moneda: "USD",
  categoria: "REFACCION",
  fecha_gasto: "2026-09-24",
  vuelo_id: null,
  vuelo: null,
  proveedor: { nombre: "Aircraft Spruce" },
  ...extra,
});

const operaciones430 = (): MovimientoGasto => ({
  id: G_430,
  monto: "1899.09",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-10-10",
  vuelo_id: VUELO_430,
  vuelo: { folio: 430 },
  proveedor: { nombre: "ASA" },
});

const tabla = (rows: MovimientoBancario[]) =>
  renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);

const HREF_REFACCION = `/admin/expenses?desde=2026-09-24&amp;hasta=2026-09-24&amp;gasto=${G_REFACCION}`;

describe("«Ver el gasto con el que se concilió» abre ESE gasto", () => {
  it("1↔1 sin vuelo (la refacción de la captura): Gastos de su día con ?gasto=, dentro de la liga verde", () => {
    const html = tabla([mov({ gasto_id: G_REFACCION, gasto: refaccion() })]);
    const liga = html.slice(html.indexOf('title="Ver el gasto con el que se concilió"'));
    const a = liga.slice(0, liga.indexOf("</a>"));
    expect(a).toContain(`href="${HREF_REFACCION}"`);
    expect(a).toContain("Refacción · $794.61");
    // Ya no cae en la lista a secas.
    expect(html).not.toContain('href="/admin/expenses"');
  });

  it("1↔1 con vuelo: sigue yendo al vuelo (ahí se ve su desglose)", () => {
    const html = tabla([mov({ gasto_id: G_430, gasto: operaciones430() })]);
    expect(html).toContain(`href="/admin/flights/${VUELO_430}"`);
    expect(html).not.toContain("gasto=");
  });

  it("lote (1 cargo ↔ 2 gastos): cada línea con su href — el sin vuelo a Gastos con ?gasto=, el del vuelo al vuelo", () => {
    const html = tabla([
      mov({
        monto: "16330.27",
        gasto_id: null,
        gastos_n: 2,
        gastos: [refaccion({ monto_parte: "14431.18" }), { ...operaciones430(), monto_parte: "1899.09" }],
        gastos_suma: 16330.27,
        gastos_diferencia: 0,
      }),
    ]);
    expect(html).toContain(`href="${HREF_REFACCION}"`);
    expect(html).toContain(`href="/admin/flights/${VUELO_430}"`);
    expect(html).not.toContain('href="/admin/expenses"');
  });

  it("sin fecha del gasto: solo ?gasto= (nunca un rango inventado)", () => {
    const html = tabla([mov({ gasto_id: G_REFACCION, gasto: refaccion({ fecha_gasto: null }) })]);
    expect(html).toContain(`href="/admin/expenses?gasto=${G_REFACCION}"`);
  });
});
