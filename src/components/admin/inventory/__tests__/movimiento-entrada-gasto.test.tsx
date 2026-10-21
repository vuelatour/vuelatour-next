/**
 * Movimiento de cardex (21-oct-2026): (1) la ENTRADA ofrece «Vincular con un
 * gasto ya registrado» (la compra de una línea la arma y recibe el API);
 * (2) la SALIDA se cobra EN PESOS: la moneda arranca en MXN y un precio de
 * ficha en dólares se sugiere convertido con el T.C. de hoy (y se dice). El
 * runner no tiene DOM: render estático + lectura del fuente.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  ETIQUETA_VINCULAR_GASTO_ENTRADA,
  HINT_VINCULAR_GASTO_ENTRADA,
} from "@/lib/admin/compras-estado";
import { NOTA_VENTA_EN_PESOS } from "@/lib/admin/inventario-salida";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/inventory/actions", () => ({ createMovimientoAction: vi.fn() }));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  entradaDesdeGastoAction: vi.fn(),
  listGastosCandidatosCompraAction: vi.fn(async () => ({ ok: true, data: { data: [], total: 0, truncado: false, ventana: {} } })),
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

const { MovimientoDialog } = await import("../movimiento-dialog");

const FUENTE = readFileSync(path.resolve(__dirname, "../movimiento-dialog.tsx"), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const base = {
  open: true,
  onOpenChange: () => {},
  itemId: "i1",
  itemNombre: "Filtro CH48110",
  aircraft: [{ id: "a1", matricula: "XA-VGV" }],
  providers: [],
};

describe("ENTRADA: vincular con un gasto ya registrado", () => {
  it("la casilla está en la ENTRADA (apagada: el selector no se pinta; el costo sigue tecleable)", () => {
    const html = renderToStaticMarkup(<MovimientoDialog {...base} initialTipo="ENTRADA" />);
    expect(html).toContain("data-vincular-gasto-entrada");
    expect(html).toContain(esc(ETIQUETA_VINCULAR_GASTO_ENTRADA));
    expect(html).toContain(esc(HINT_VINCULAR_GASTO_ENTRADA));
    expect(html).not.toContain("data-selector-candidatos");
    expect(html).not.toContain("data-costo-desde-gasto");
    expect(html).toContain("Costo unitario");
  });

  it("en SALIDA no aparece", () => {
    const html = renderToStaticMarkup(<MovimientoDialog {...base} initialTipo="SALIDA" />);
    expect(html).not.toContain("data-vincular-gasto-entrada");
  });

  it("cableado: con el gasto elegido la entrada va por `entradaDesdeGastoAction` (compra de una línea recibida por el API), sin costo tecleado", () => {
    expect(FUENTE).toContain('import { entradaDesdeGastoAction } from "@/app/admin/inventory/compras/actions";');
    expect(FUENTE).toMatch(/if \(values\.tipo === "ENTRADA" && vincularGasto\) \{/);
    expect(FUENTE).toMatch(/registrarDesdeGasto\(\{\s*gasto_id: gasto\.id,\s*item_id: itemId,\s*cantidad,/);
    expect(FUENTE).toContain("<GastoCandidatoSelector value={gasto?.id ?? \"\"} onChange={setGasto} soloMercancia />");
    expect(FUENTE).toContain("const costoDesdeGasto = esEntrada && vincularGasto && !!gasto;");
    expect(FUENTE).toContain("toastEntradaDesdeGasto(result.data)");
  });
});

describe("SALIDA: el avión paga en pesos", () => {
  it("precio de ficha en USD + T.C. de hoy ⇒ la venta arranca en MXN con el equivalente sugerido y la nota", () => {
    const html = renderToStaticMarkup(
      <MovimientoDialog {...base} initialTipo="SALIDA" precioVenta={62.5} precioVentaMoneda="USD" tcHoy={18.2345} />,
    );
    expect(html).toMatch(/<option value="MXN" selected="">MXN<\/option>/);
    // El input de la venta lo registra react-hook-form (sin `value` en SSR):
    // el número sugerido se vigila en la nota.
    expect(html).toContain("data-nota-venta-pesos");
    expect(html).toContain(esc("Precio de la ficha $62.50 USD × T.C. oficial de hoy 18.2345 = $1,139.66 MXN (sugerido; edítalo si cobras otro)."));
    expect(html).toContain("data-equivalente-usd");
    expect(html).toContain(esc(NOTA_VENTA_EN_PESOS));
  });

  it("precio en pesos: tal cual en MXN; precio en USD sin T.C.: se queda en USD y se dice (no se rompe)", () => {
    const pesos = renderToStaticMarkup(
      <MovimientoDialog {...base} initialTipo="SALIDA" precioVenta={450} precioVentaMoneda="MXN" tcHoy={18.2} />,
    );
    expect(pesos).toMatch(/<option value="MXN" selected="">MXN<\/option>/);
    expect(pesos).not.toContain("data-nota-venta-pesos");
    const usd = renderToStaticMarkup(
      <MovimientoDialog {...base} initialTipo="SALIDA" precioVenta={62.5} precioVentaMoneda="USD" tcHoy={null} />,
    );
    expect(usd).toMatch(/<option value="USD" selected="">USD<\/option>/);
    expect(usd).toContain("no hay T.C. oficial de hoy");
  });

  it("sin precio en la ficha: vacío y en MXN", () => {
    const html = renderToStaticMarkup(<MovimientoDialog {...base} initialTipo="SALIDA" tcHoy={18.2} />);
    expect(html).toMatch(/<option value="MXN" selected="">MXN<\/option>/);
    expect(html).not.toContain("data-nota-venta-pesos");
  });

  it("cableado: los defaults salen de `ventaInicialSalida` (fuente única) y el T.C. llega por `tcHoy`", () => {
    expect(FUENTE).toContain("const ventaInicial = ventaInicialSalida({ precioVenta, precioVentaMoneda, tcHoy });");
    expect(FUENTE).toContain("reset(defaults(initialTipo, preseleccionado, ventaInicialSalida({ precioVenta, precioVentaMoneda, tcHoy })));");
    for (const rel of ["../movimiento-button.tsx", "../item-actions.tsx", "../items-table.tsx"]) {
      expect(readFileSync(path.resolve(__dirname, rel), "utf8"), rel).toContain("tcHoy");
    }
  });
});
