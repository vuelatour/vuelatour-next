/**
 * Compras en dólares contra el T.C. oficial (13-oct-2026, API 0.0.75) en la
 * bandeja y en «Vincular gasto»:
 *  1. la fila 1↔1 cruzada: «$422.86 USD» y la marca del T.C. con su tooltip
 *     («⚠ …» ámbar cuando quedó fuera de lugar);
 *  2. una fila en PESOS sale byte a byte como antes (golden del 13-oct);
 *  3. el CABLEADO del diálogo por regex: capacidad pegajosa, placeholder y
 *     nota solo con `cruzaUsd`, la 3.ª línea sin `truncate`, el aviso con
 *     «Vincular de todos modos» sin bloquear y `cursor-pointer`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { TUBO_CERCA, TUBO_LEJOS } from "@/lib/admin/__tests__/tc-cruce.fixtures";
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

const gastoMxn: MovimientoGasto = {
  id: "5e879489-0000-4000-8000-000000000001",
  monto: "2231.38",
  moneda: "MXN",
  categoria: "OPERACIONES",
  fecha_gasto: "2026-09-21",
  vuelo_id: "7d50c91c-0000-4000-8000-000000000321",
  vuelo: { folio: 321 },
  proveedor: null,
};

const filaMxn: MovimientoBancario = {
  id: "cc7d64b0-0000-4000-8000-000000000321",
  cuenta_bancaria_id: "76a931e0-7c06-47c6-a574-6c7d4a698c14",
  fecha: "2026-09-24",
  tipo: "CARGO",
  monto: "2231.38",
  descripcion: "SEL TRANSF. INTERBANCARIA SPEI",
  referencia: "00000000000000000001",
  conciliado: true,
  gasto_id: gastoMxn.id,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-09-29T15:00:00Z",
  gasto: gastoMxn,
};

const tubo: MovimientoGasto = {
  id: "2d37d95e-0000-4000-8000-000000000001",
  monto: "422.86",
  moneda: "USD",
  categoria: "REFACCION",
  fecha_gasto: "2026-09-01",
  vuelo_id: null,
  vuelo: null,
  proveedor: { nombre: "Aircraft Spruce & Specialty Co." },
};

const filaCruzada = (tc: typeof TUBO_LEJOS): MovimientoBancario => ({
  ...filaMxn,
  id: "e5724490-0000-4000-8000-000000000001",
  fecha: "2026-09-01",
  monto: "8939.38",
  descripcion: "ASA CANCUN",
  gasto_id: tubo.id,
  gasto: tubo,
  tc_cruce: tc,
});

const tabla = (rows: MovimientoBancario[]) => renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("fila 1↔1 cruzada (gasto en USD, cargo en pesos)", () => {
  it("«$422.86 USD» y la marca «⚠ …» ámbar con el tooltip que manda al pre-cierre", () => {
    const html = tabla([filaCruzada(TUBO_LEJOS)]);
    expect(html).toContain(`${categoriaGastoLabel("REFACCION")} · $422.86 USD`);
    expect(html).toContain('data-tc-cruce="ambar"');
    expect(html).toContain("⚠ T.C. 21.14 · oficial 17.01 (+24.3 %): lejos del oficial");
    expect(html).toContain(esc(`${TUBO_LEJOS.titulo}\nRevisa que este cargo sea esa compra`));
  });

  it("una liga cruzada que cuadra: el T.C. tenue, sin ⚠", () => {
    const html = tabla([filaCruzada(TUBO_CERCA)]);
    expect(html).toContain('data-tc-cruce="tenue"');
    expect(html).toContain("T.C. 17.06 · oficial 17.01 (+0.3 %)");
    expect(html).not.toContain("⚠");
  });

  it("sin `tc_cruce` (API previo) no hay marca, pero sí la moneda del gasto", () => {
    const html = tabla([{ ...filaCruzada(TUBO_LEJOS), tc_cruce: undefined }]);
    expect(html).toContain("$422.86 USD");
    expect(html).not.toContain("data-tc-cruce");
  });
});

describe("fila en PESOS: byte a byte como antes", () => {
  it("la celda del gasto es IDÉNTICA a la del 13-oct (antes del T.C. oficial)", () => {
    const html = tabla([filaMxn]);
    expect(html).toContain(
      '<a class="block text-sm text-emerald-600 hover:underline" title="Ver el gasto con el que se concilió" href="/admin/flights/7d50c91c-0000-4000-8000-000000000321">Operaciones · $2,231.38<span class="text-muted-foreground"> · vuelo #321</span><span class="block text-[10px] text-muted-foreground">21 sep 2026</span></a>',
    );
    expect(html).not.toContain("data-tc-cruce");
    expect(html).not.toContain(" MXN");
  });
});

describe("cableado de «Vincular gasto» (regex sobre el fuente)", () => {
  const src = readFileSync(path.resolve(__dirname, "../vincular-gasto-dialog.tsx"), "utf8");

  it("capacidad PEGAJOSA y solo en una cuenta en pesos", () => {
    expect(src).toContain("const [apiUsd, setApiUsd] = useState(false);");
    expect(src).toContain("if (apiCruzaConOficial(r.data)) setApiUsd(true);");
    expect(src).not.toContain("setApiUsd(false)");
    expect(src).toContain('const cruzaUsd = apiUsd && monedaCuenta === "MXN";');
  });

  it("placeholder y nota solo con cruzaUsd", () => {
    expect(src).toContain("placeholder={cruzaUsd ? PLACEHOLDER_BUSCAR_GASTO_CON_USD : PLACEHOLDER_BUSCAR_GASTO}");
    expect(src).toContain("NOTA_VENTANA_CARGO(dias, incluirNoBancarios, cruzaUsd)");
  });

  it("la 3.ª línea del cruzado SIN truncate, con su tooltip, y la 2.ª sin el T.C.", () => {
    expect(src).toContain("const optsDesc = lineaTc ? { sinTc: true } : undefined;");
    const tercera = src.slice(src.indexOf("data-tc-cruce={lineaTc.tono}"), src.indexOf("{lineaTc.texto}"));
    expect(tercera).toContain('"block text-[11px]"');
    expect(tercera).toContain("title={lineaTc.titulo}");
    expect(tercera).not.toContain("truncate");
  });

  it("aviso ámbar con «Vincular de todos modos» que NO bloquea (el botón liga como siempre)", () => {
    expect(src).toContain("const avisoCruzado = avisoVincularCruzado(marcados);");
    expect(src).toMatch(/role="status"\s+data-aviso-cruzado=""/);
    expect(src).toContain("avisoCruzado ? avisoCruzado.boton : botonVincularGastos(marcados.length)");
    expect(src).toMatch(/className="cursor-pointer"\s+onClick=\{vincular\}\s+disabled=\{pending \|\| marcados\.length === 0 \|\| faltaJustificacion\}/);
  });
});
