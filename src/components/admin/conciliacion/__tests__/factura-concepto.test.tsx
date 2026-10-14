/**
 * «Factura NNNN» en la bandeja de Conciliación y en «Vincular gasto»
 * (13-oct-2026, API 0.0.75). Se custodia:
 *  1. el chip bajo la descripción: liga en pestaña NUEVA (`target=_blank`,
 *     `rel`), `cursor-pointer`, nombre accesible y el chip ámbar «también en
 *     otro pago»;
 *  2. la celda de la descripción en DOS renglones con el texto completo en
 *     el tooltip (el concepto va al final y `truncate` lo cortaba); sin el
 *     campo (API previo) no hay chip;
 *  3. la búsqueda rápida encuentra «factura 7360» aunque el banco diga «fact»;
 *  4. el CABLEADO del diálogo por regex: ★ con `esSugerido || coincide`, su
 *     renglón, el cuadro con `VacioCandidatos` + `textoExcluidosCandidatos`, y
 *     NINGUNA marca por factura.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { coincideBusqueda } from "@/lib/admin/busqueda";
import { textoBusquedaFacturaConcepto } from "@/lib/admin/conciliacion-factura-concepto";
import type { FacturaConceptoMovimiento, MovimientoBancario } from "@/types/conciliacion";

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
const { FacturaConceptoChip } = await import("../factura-concepto-chip");

const DESC = "SEL TRANSF. INTERBANCARIA SPEI BANORTE fact vip 7360";

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "6d398022-0000-4000-8000-000000000001",
  cuenta_bancaria_id: "212add6c-c4e5-44cc-a30c-0635c0ab3036",
  fecha: "2026-10-12",
  tipo: "CARGO",
  monto: "2231.38",
  descripcion: DESC,
  referencia: "00000000000000000001",
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  clasificacion_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-10-12T15:00:00Z",
  ...m,
});

const fc = (over: Partial<FacturaConceptoMovimiento> = {}): FacturaConceptoMovimiento => ({
  tipo: "FACTURA",
  numeros: ["7360"],
  texto: "Factura 7360",
  pista: "VIP",
  ligados: null,
  repetida_en: [],
  ...over,
});

const tabla = (rows: MovimientoBancario[]) => renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("chip «Factura NNNN»", () => {
  it("liga en pestaña nueva, con cursor-pointer, rel y nombre accesible", () => {
    const html = renderToStaticMarkup(<FacturaConceptoChip fc={fc()} fecha="2026-10-12" tipo="CARGO" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("cursor-pointer");
    expect(html).toContain('aria-label="Ver en una pestaña nueva los movimientos con la factura 7360"');
    expect(html).toContain('href="/admin/conciliacion?desde=2026-10-05&amp;hasta=2026-10-19&amp;mvq=7360"');
    expect(html).toContain(">Factura 7360<");
    expect(html).not.toContain("data-repetida");
  });

  it("tono por estado (verde coincide, ámbar no coincide) y el chip de repetida", () => {
    const ok = renderToStaticMarkup(
      <FacturaConceptoChip fc={fc({ ligados: { estado: "COINCIDE", folios: ["7360"], faltan: [] } })} fecha="2026-10-12" tipo="CARGO" />,
    );
    expect(ok).toContain('data-tono="ok"');
    expect(ok).toContain("text-emerald-700");
    const aviso = renderToStaticMarkup(
      <FacturaConceptoChip
        fc={fc({
          ligados: { estado: "NO_COINCIDE", folios: ["7361"], faltan: ["7360"] },
          repetida_en: [
            { movimiento_id: "x", fecha: "2026-09-30", monto: 2231.38, cuenta: "EJE SCOTIA", descripcion: null, conciliado: true },
          ],
        })}
        fecha="2026-10-12"
        tipo="CARGO"
      />,
    );
    expect(aviso).toContain('data-tono="aviso"');
    expect(aviso).toContain("Factura 7360 · el gasto dice 7361");
    expect(aviso).toContain("data-repetida");
    expect(aviso).toContain("también en otro pago");
  });
});

describe("celda «Descripción» de la bandeja", () => {
  it("dos renglones con el texto completo en el tooltip, y el chip debajo", () => {
    const html = tabla([mov({ factura_concepto: fc() })]);
    expect(html).toContain(`<span class="line-clamp-2" title="${DESC}">${DESC}</span>`);
    expect(html).toContain("data-factura-concepto-fila");
    expect(html).toContain(">Factura 7360<");
    expect(html).not.toContain("truncate max-w-[280px]");
  });

  it("sin el campo (API previo): la celda de siempre, sin chip", () => {
    const html = tabla([mov({})]);
    expect(html).toContain(`<span class="line-clamp-2" title="${DESC}">${DESC}</span>`);
    expect(html).not.toContain("data-factura-concepto-fila");
    expect(tabla([mov({ factura_concepto: null })])).toBe(html);
  });

  it("la búsqueda rápida encuentra «factura 7360» (el banco dice «fact»)", () => {
    const m = mov({ factura_concepto: fc() });
    expect(coincideBusqueda(`${m.descripcion}`, "factura 7360")).toBe(false);
    expect(coincideBusqueda(`${m.descripcion} ${textoBusquedaFacturaConcepto(m)}`, "factura 7360")).toBe(true);
    expect(leer("../movimientos-table.tsx")).toMatch(/searchText=\{[\s\S]*textoBusquedaFacturaConcepto\(m\)/);
  });
});

describe("cableado de «Vincular gasto» (regex sobre el fuente)", () => {
  const src = leer("../vincular-gasto-dialog.tsx");

  it("★ con `esSugerido || coincide` y el renglón con su tooltip", () => {
    expect(src).toContain("const coincide = c.coincide_factura === true;");
    expect(src).toContain('{esSugerido || coincide ? "★ " : ""}');
    expect(src).toMatch(/title=\{TITULO_COINCIDE_FACTURA\}[\s\S]{0,120}ETIQUETA_COINCIDE_FACTURA\(textoFactura\)/);
  });

  it("el cuadro de la factura reutiliza VacioCandidatos + textoExcluidosCandidatos con otros_gastos", () => {
    expect(src).toContain("data-factura-concepto");
    expect(src).toContain("avisoFacturaEnCandidatos(facturaConcepto, resultados)");
    expect(src).toMatch(/<VacioCandidatos[\s\S]{0,80}texto=\{null\}[\s\S]{0,80}textoExcluidosCandidatos\(facturaConcepto\.otros_gastos/);
  });

  it("NUNCA marca ni preselecciona por factura", () => {
    expect(src).not.toMatch(/coincide_factura[\s\S]{0,200}setMarcados/);
    expect(src).not.toMatch(/setMarcados\([^)]*coincide/);
    expect(src).not.toMatch(/marcadosTrasSugerencia\([^)]*coincide/);
  });
});
