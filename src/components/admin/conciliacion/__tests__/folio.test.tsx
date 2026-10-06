/**
 * Número de factura en la pantalla de Conciliación (5-oct-2026, API 0.0.57).
 * Pedido del cliente: «al momento de la conciliación me apoyan a poner el
 * número de la factura con la que se enlaza el movimiento».
 *
 * Qué se custodia aquí:
 *  1. la columna «Conciliación» de un cargo 1↔1 pinta «Factura FEACZM-72128»
 *     debajo del proveedor/fecha; un lote, el folio de CADA gasto; sin
 *     `folio_comprobante` (API previo) el marcado es IDÉNTICO al de antes;
 *  2. la búsqueda rápida de la tabla encuentra el cargo por el folio;
 *  3. el CABLEADO: la tabla y el diálogo «Vincular gasto» rotulan con
 *     `conciliacion-folio` (nadie redacta «Factura …» a mano) y la
 *     descripción del candidato lleva el tooltip con la línea completa.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MovimientoBancario, MovimientoGasto } from "@/types/conciliacion";

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

const UUID = "3f2a9c1e-7b4d-4e8a-9c21-0a1b2c3d4e5f";

const mov = (m: Partial<MovimientoBancario>): MovimientoBancario => ({
  id: "c5819d4b-6a3e-4f43-9a5f-0d1b6f6a0001",
  cuenta_bancaria_id: "76a931e0-7c06-47c6-a574-6c7d4a698c14",
  fecha: "2026-09-22",
  tipo: "CARGO",
  monto: "1840.50",
  descripcion: "ASUR COZUMEL",
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

const gasto = (extra: Partial<MovimientoGasto> = {}): MovimientoGasto => ({
  id: "a3150000-0000-4000-8000-000000000315",
  monto: "1840.50",
  moneda: "MXN",
  categoria: "ATERRIZAJE",
  fecha_gasto: "2026-09-21",
  proveedor: { nombre: "ASUR" },
  vuelo_id: "f3150000-0000-4000-8000-000000000315",
  vuelo: { folio: 315 },
  ...extra,
});

function tabla(rows: MovimientoBancario[]): string {
  return renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} />);
}

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("columna «Conciliación»: el número de factura", () => {
  it("1↔1: «Factura FEACZM-72128» debajo del proveedor y la fecha, dentro de la liga", () => {
    const g = gasto({ folio_comprobante: "FEACZM-72128" });
    const html = tabla([mov({ gasto_id: g.id, gasto: g })]);
    expect(html).toContain("Factura FEACZM-72128");
    const iProveedor = html.indexOf("ASUR");
    const iFactura = html.indexOf("Factura FEACZM-72128");
    expect(iProveedor).toBeGreaterThan(-1);
    expect(iFactura).toBeGreaterThan(iProveedor);
    // Dentro de la liga «Ver el gasto con el que se concilió».
    const liga = html.slice(html.indexOf('title="Ver el gasto con el que se concilió"'));
    expect(liga.slice(0, liga.indexOf("</a>"))).toContain("Factura FEACZM-72128");
  });

  it("«CFDI <uuid>» se acorta en la celda y va completo en el tooltip", () => {
    const g = gasto({ folio_comprobante: `CFDI ${UUID}` });
    const html = tabla([mov({ gasto_id: g.id, gasto: g })]);
    expect(html).toContain(`Factura CFDI …${UUID.slice(-8)}`);
    expect(html).toContain(`title="Factura CFDI ${UUID}"`);
  });

  it("sin folio o API previo: el marcado es IDÉNTICO al de antes (null = ausente)", () => {
    const sin = gasto();
    const conNull = gasto({ folio_comprobante: null });
    const conVacio = gasto({ folio_comprobante: "  " });
    const htmlSin = tabla([mov({ gasto_id: sin.id, gasto: sin })]);
    expect(tabla([mov({ gasto_id: conNull.id, gasto: conNull })])).toBe(htmlSin);
    expect(tabla([mov({ gasto_id: conVacio.id, gasto: conVacio })])).toBe(htmlSin);
    expect(htmlSin).not.toContain("Factura");
  });

  it("1↔1 por `gasto` o por `gastos[]` de una parte: el mismo marcado", () => {
    const g = gasto({ folio_comprobante: "AB1144717" });
    const hoy = mov({ gasto_id: g.id, gasto: g });
    const nuevo = { ...hoy, gastos_n: 1, gastos: [g], gastos_suma: 1840.5, gastos_diferencia: 0 };
    expect(tabla([nuevo])).toBe(tabla([hoy]));
    expect(tabla([hoy])).toContain("Factura AB1144717");
  });

  it("1↔1 SOLO por `gastos[]` (API sin el espejo `gasto`): el folio sale de la parte", () => {
    const g = gasto({ folio_comprobante: "AB1144717" });
    const conEspejo = tabla([mov({ gasto_id: g.id, gasto: g })]);
    const sinEspejo = tabla([
      mov({ gasto_id: g.id, gasto: null, gastos_n: 1, gastos: [g], gastos_suma: 1840.5, gastos_diferencia: 0 }),
    ]);
    expect(sinEspejo).toContain("Factura AB1144717");
    expect(sinEspejo).toBe(conEspejo);
    // Igual si el API ni siquiera manda la llave `gasto` (`mov` no la trae).
    const sinLlave = mov({ gasto_id: g.id, gastos_n: 1, gastos: [g] });
    expect("gasto" in sinLlave).toBe(false);
    expect(tabla([sinLlave])).toContain("Factura AB1144717");
  });

  it("lote de 5: «y 2 más» lleva en el tooltip la factura de los gastos que no caben", () => {
    const partes = ["S-101", "S-102", "S-103", "S-104", "S-105"].map((f, i) =>
      gasto({ id: `a${i}`, folio_comprobante: f, monto: "2801.40", monto_parte: "2801.40", vuelo: { folio: 315 + i } }),
    );
    const html = tabla([
      mov({ monto: "14007.00", gastos_n: 5, gastos: partes, gastos_suma: 14007, gastos_diferencia: 0 }),
    ]);
    expect(html).toContain(">y 2 más<");
    const iMas = html.indexOf(">y 2 más<");
    const span = html.slice(html.lastIndexOf("<span", iMas), iMas);
    expect(span).toContain("Factura S-104");
    expect(span).toContain("Factura S-105");
    expect(span).toContain("vuelo #318");
    // Visibles solo las 3 primeras.
    expect(html.split(">Factura ").length - 1).toBe(3);
  });

  it("lote: el folio de CADA gasto, debajo de su línea", () => {
    const partes = [
      gasto({ id: "a1", folio_comprobante: "S-101", monto: "2801.40", monto_parte: "2801.40", vuelo: { folio: 315 } }),
      gasto({ id: "a2", folio_comprobante: null, monto: "2801.40", monto_parte: "2801.40", vuelo: { folio: 319 } }),
      gasto({ id: "a3", folio_comprobante: "S-103", monto: "2801.40", monto_parte: "2801.40", vuelo: { folio: 326 } }),
    ];
    const html = tabla([
      mov({ monto: "8404.20", gastos_n: 3, gastos: partes, gastos_suma: 8404.2, gastos_diferencia: 0 }),
    ]);
    expect(html).toContain("3 gastos · $8,404.20");
    expect(html).toContain("Factura S-101");
    expect(html).toContain("Factura S-103");
    // Dos textos visibles (el tooltip repite cada uno en su `title`).
    expect(html.split(">Factura ").length - 1).toBe(2);
    // El folio va DESPUÉS de la línea de su gasto (vuelo #315 → S-101; #326 → S-103).
    expect(html.indexOf("Factura S-101")).toBeGreaterThan(html.indexOf("vuelo #315"));
    expect(html.indexOf("Factura S-103")).toBeGreaterThan(html.indexOf("vuelo #326"));
  });

  it("cobros, clasificados y pendientes no pintan factura", () => {
    const html = tabla([
      mov({ conciliado: false }),
      mov({ id: "c2", clasificacion_id: "x", clasificacion: { nombre: "Comisión bancaria" } }),
    ]);
    expect(html).not.toContain("Factura ");
  });
});

describe("cableado", () => {
  const tablaSrc = leer("../movimientos-table.tsx");
  const dialogo = leer("../vincular-gasto-dialog.tsx");
  const lote = leer("../../../../lib/admin/conciliacion-lote.ts");
  const auto = leer("../../../../lib/admin/conciliacion-auto.ts");

  it("la tabla rotula con conciliacion-folio y no redacta «Factura» a mano", () => {
    expect(tablaSrc).toContain('from "@/lib/admin/conciliacion-folio"');
    expect(tablaSrc).toContain("etiquetaFolioComprobante(gasto?.folio_comprobante)");
    expect(tablaSrc).toContain("{l.factura}");
    expect(tablaSrc).not.toMatch(/>\s*Factura\s/);
    expect(tablaSrc).not.toContain("`Factura ");
  });

  it("las líneas del lote y la búsqueda salen del helper", () => {
    expect(lote).toContain("factura: etiquetaFolioComprobante(g.folio_comprobante)");
    expect(lote).toContain("tituloFolioComprobante(g.folio_comprobante),");
  });

  it("el diálogo: la descripción del candidato (con el folio) lleva el tooltip completo", () => {
    expect(auto).toContain("lineaDescripcionCandidato(g, etiquetaFolioComprobante)");
    expect(auto).toContain("lineaDescripcionCandidato(g, tituloFolioComprobante)");
    expect(auto).toContain("rotularFolio(g.folio_comprobante)");
    expect(dialogo).toContain("const desc = descripcionCandidatoGasto(ficha);");
    expect(dialogo).toMatch(
      /<span\s+className="block truncate text-xs text-muted-foreground"\s+title=\{tituloDesc \?\? undefined\}\s*>/,
    );
  });

  it("con la casilla apagada, el tooltip de la descripción CONSERVA el motivo del veto", () => {
    // El title del <span> interior tapa el del <label>: por eso el motivo
    // viaja también en el de la descripción (helper probado aparte).
    expect(dialogo).toContain("const bloqueo = bloqueoDeFila(c, monedaCuenta, marcados);");
    expect(dialogo).toContain("const tituloDesc = tituloDescripcionCandidatoGasto(ficha, bloqueo);");
    expect(dialogo).toContain("title={bloqueo ?? undefined}");
    expect(dialogo).not.toContain("title={desc}");
  });

  it("«Sugerir con IA»: el folio entero en el tooltip solo cuando la línea lo acorta", () => {
    const sug = leer("../sugerencias-lote-dialog.tsx");
    expect(sug).toContain("tituloDescripcionCandidatoGasto(gasto)");
    expect(sug).toContain("title={tituloDesc && tituloDesc !== desc ? tituloDesc : undefined}");
  });

  it("«y N más» del lote lleva el tooltip con las facturas ocultas", () => {
    expect(tablaSrc).toContain("title={lote.masTitulo ?? undefined}");
  });
});
