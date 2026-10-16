/**
 * Conciliación llegando desde Gastos (13-oct-2026, conciliación al revés):
 * `?mov=` pone la fila PRIMERO (la página) y con el anillo ámbar (la tabla);
 * `?gasto=` resalta su línea dentro del lote. DataTable NO se toca.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CLASE_FILA_ENFOCADA, CLASE_LINEA_ENFOCADA } from "@/lib/admin/conciliacion-vista";
import type { MovimientoBancario, MovimientoGasto } from "@/types/conciliacion";

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
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { MovimientosTable } = await import("../movimientos-table");

const CUENTA = "76a931e0-7c06-47c6-a574-6c7d4a698c14";
const mov = (id: string, m: Partial<MovimientoBancario> = {}): MovimientoBancario => ({
  id,
  cuenta_bancaria_id: CUENTA,
  fecha: "2026-09-24",
  tipo: "CARGO",
  monto: "4462.75",
  descripcion: "SEL TRANSF. INTERBANCARIA SPEI",
  referencia: null,
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-09-29T15:00:00Z",
  ...m,
});
const parte = (folio: number): MovimientoGasto => ({
  id: `a${folio}0000-0000-4000-8000-000000000${folio}`,
  monto: "2801.40",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-28",
  vuelo_id: `f${folio}0000-0000-4000-8000-000000000${folio}`,
  vuelo: { folio },
  proveedor: null,
  notas_primera_linea: "Pago VIP SAESA",
  monto_parte: "2801.40",
});

const A = "a4462750-0000-4000-8000-000000000001";
const B = "a4462750-0000-4000-8000-000000000002";
const tabla = (rows: MovimientoBancario[], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} {...props} />);
const fila = (html: string, id: string) => html.match(new RegExp(`<tr[^>]*data-fila="${id}"[^>]*>`))?.[0] ?? "";
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("la fila enfocada", () => {
  it("los dos SPEI de $4,462.75 del 24-sep: solo el enfocado lleva el anillo", () => {
    const html = tabla([mov(A), mov(B)], { resaltar: B });
    expect(fila(html, B)).toContain(CLASE_FILA_ENFOCADA);
    expect(fila(html, A)).not.toContain(CLASE_FILA_ENFOCADA);
  });

  it("sin las props nuevas el marcado es IDÉNTICO al de siempre", () => {
    const rows = [mov(A), mov(B)];
    expect(tabla(rows, { resaltar: null, gastoResaltado: null, huboCorte: false })).toBe(tabla(rows));
    expect(tabla(rows)).not.toContain("ring-amber-400");
  });
});

describe("la línea del gasto dentro del lote", () => {
  const lote = mov("c8404000-0000-4000-8000-000000000001", {
    monto: "11205.60",
    conciliado: true,
    gastos_n: 4,
    gastos: [parte(332), parte(345), parte(344), parte(337)],
    gastos_suma: 11205.6,
    gastos_diferencia: 0,
  });

  it("el 4.º gasto (antes en «y 1 más») se ve, resaltado y con « · el que abriste»", () => {
    const html = tabla([lote], { gastoResaltado: parte(337).id });
    expect(html).toContain("vuelo #337");
    expect(html).toContain(CLASE_LINEA_ENFOCADA);
    expect(html).toContain('<span class="text-[10px] font-normal"> · el que abriste</span>');
    expect(html).toContain("y 1 más");
    expect(tabla([lote])).not.toContain("vuelo #337");
  });
});

describe("la línea del COBRO dentro del lote de un abono (`?cobro=`, 15-oct-2026)", () => {
  const cobro = (folio: number) => ({
    cobro_id: `c${folio}0000-0000-4000-8000-000000000${folio}`,
    monto_parte: 1000,
    vuelo_id: `f${folio}0000-0000-4000-8000-000000000${folio}`,
    folio,
    cliente: "Maqar",
    fecha_cobro: "2026-10-06T15:00:00Z",
    moneda: "MXN",
    neto: 1000,
  });
  const lote = mov("c4000000-0000-4000-8000-000000000001", {
    tipo: "ABONO",
    monto: "4000.00",
    conciliado: true,
    cobros_n: 4,
    cobros: [cobro(379), cobro(380), cobro(381), cobro(382)],
    cobros_suma: 4000,
    cobros_diferencia: 0,
  });

  it("el 4.º cobro (antes en «y 1 más») se ve, resaltado y con « · el que abriste»; sin la prop, el de siempre", () => {
    const html = tabla([lote], { cobroResaltado: cobro(382).cobro_id });
    expect(html).toContain("Vuelo #382 · Maqar");
    expect(html).toContain(CLASE_LINEA_ENFOCADA);
    expect(html).toContain('<span class="text-[10px] font-normal"> · el que abriste</span>');
    expect(html).toContain("y 1 más");
    const hoy = tabla([lote]);
    expect(hoy).not.toContain("Vuelo #382");
    expect(tabla([lote], { cobroResaltado: null })).toBe(hoy);
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  it("la tabla: syncId de la fuente única, el anillo por rowClassName y huboCorte", () => {
    const src = leer("../movimientos-table.tsx");
    expect(src).toContain("syncId={SYNC_ID_MOVIMIENTOS}");
    expect(src).toContain("huboCorte={huboCorte}");
    expect(src).toContain("rowClassName={(m) => ((resaltar && m.id === resaltar) || resaltadosSet.has(m.id.toLowerCase()) ? CLASE_FILA_ENFOCADA : undefined)}");
    expect(src).toContain("resumenLoteFila(m, { destacar: gastoResaltado })");
    expect(src).toMatch(/scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  });

  it("la página: enfoque de la URL, la fila primero y el aviso cuando no está, solo en las pestañas de la lista", () => {
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    expect(page).toContain("const enfoque = enfoqueConciliacionDeUrl(sp);");
    expect(page).toContain('const pestanaDeLista = filtro === "todos" || filtro === "pendientes" || filtro === "conciliados";');
    // 15-oct-2026: primero los del pre-cierre y DESPUÉS el `?mov=` (queda primero).
    expect(page).toContain("filasConFoco(movsPc.filas, enfoque.mov)");
    // 15-oct-2026: con `?gasto=` el texto de Gastos de siempre; sin él (un abono), el genérico.
    expect(page).toContain("{textoMovimientoNoEncontrado(enfoque)}");
    expect(page).toContain("resaltar={foco.encontrado ? enfoque.mov : null}");
    expect(page).toContain("gastoResaltado={enfoque.gasto}");
    expect(page).toContain("huboCorte={notaRecorte != null}");
  });

  it("DataTable no se toca", () => {
    const dt = leer("../../data-table.tsx");
    expect(dt).not.toContain("resaltar");
    expect(dt).not.toMatch(/enfoc/i);
  });
});
