/**
 * RepartoDialog compartido (menú ⋯ de Gastos y Otros gastos), arreglos del
 * 14-oct-2026: la confirmación de «Quitar reparto» vive DENTRO del
 * DialogContent (Base UI: Esc cierra solo la de arriba), la carga tiene
 * `.catch` (una action que lanza dejaba «Cargando…» para siempre), los textos
 * de «Quitar reparto» salen de la fuente única (FIJO correcto) y la matrícula
 * null se tolera. Cableado por regex y un render estático abierto.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  getRepartoAction: async () => ({ ok: false }),
  listAvionesActivosAction: async () => ({ ok: false }),
  saveRepartoAction: async () => ({ ok: false }),
}));
vi.mock("@/components/ui/dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-dialogo="">{children}</div> : null,
    DialogContent: Caja,
    DialogDescription: Caja,
    DialogFooter: Caja,
    DialogHeader: Caja,
    DialogTitle: Caja,
  };
});

const { RepartoDialog } = await import("../reparto-dialog");

const src = readFileSync(path.resolve(__dirname, "../reparto-dialog.tsx"), "utf8");

describe("cableado del RepartoDialog", () => {
  it("la confirmación de «Quitar reparto» está ANTES del cierre de </DialogContent>", () => {
    const alerta = src.indexOf("<AlertDialog open={openQuitar}");
    const cierre = src.indexOf("</DialogContent>");
    expect(alerta).toBeGreaterThan(-1);
    expect(alerta).toBeLessThan(cierre);
    expect(src.indexOf("</Dialog>")).toBeGreaterThan(src.indexOf("</AlertDialog>"));
  });

  it("la carga tiene .catch con el aviso y el estado de falla", () => {
    expect(src).toMatch(/\.catch\(\(\) => \{\s*if \(!vigente\) return;\s*toast\.error\(MSG_SERVIDOR_NO_RESPONDIO\);\s*setCargaEstado\(\{ key, error: true \}\);/);
  });

  it("textos de «Quitar reparto» desde la fuente única y matrícula null tolerada", () => {
    expect(src).toContain("{textoQuitarRepartoDialogo(gasto.categoria)}");
    expect(src).toContain("toast.success(toastRepartoQuitadoDialogo(gasto.categoria));");
    expect(src).toContain("{TITULO_QUITAR_REPARTO}");
    expect(src).toContain('matricula: it.matricula ?? "¿?",');
    // El literal viejo ya no se redacta aquí.
    expect(src).not.toContain("El gasto queda 100% como gasto de VuelaTour (empresa)");
  });
});

describe("render abierto (sin regresión)", () => {
  it("pinta «Cargando aviones y reparto…» mientras llega la carga", () => {
    const html = renderToStaticMarkup(
      <RepartoDialog
        open
        onOpenChange={() => {}}
        gasto={{
          id: "e23b5587-9b16-496f-bc36-bf158eae4ad9",
          categoria: "INDIRECTO",
          monto: 4733.76,
          moneda: "MXN",
          fecha_gasto: "2026-09-01",
          descripcion: "STARLINK",
        }}
      />,
    );
    expect(html).toContain("Repartir entre aviones");
    expect(html).toContain("Cargando aviones y reparto…");
    expect(html).toContain("STARLINK");
  });
});
