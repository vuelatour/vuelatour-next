/**
 * El ALTA de gasto con gastos «por pagar» (19-oct-2026, API 0.0.95): la nota
 * vive dentro del campo «Fecha del gasto» y SOLO se pinta con la capacidad y
 * una fecha futura. Sin capacidad (fuera del Provider = API previo) y también
 * CON ella mientras la fecha sea hoy, el alta sale BYTE A BYTE igual que el
 * golden congelado el 14-oct (`alta-gasto.golden.json`; regenerado el 20-oct
 * solo por las opciones nuevas de los selectores): la nota no corre los ids
 * de `useId` ni mueve nada del formulario.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  createGastoAction: async () => ({ ok: false }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  leerFacturaIAAction: async () => ({ ok: false }),
  listArticulosRefaccionAction: async () => ({ ok: true, data: [] }),
  listAvionesActivosAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "x" }));
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
vi.mock("@/components/ui/alert-dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
      open ? <div data-alerta="">{children}</div> : null,
    AlertDialogAction: Caja,
    AlertDialogCancel: Caja,
    AlertDialogContent: Caja,
    AlertDialogDescription: Caja,
    AlertDialogFooter: Caja,
    AlertDialogHeader: Caja,
    AlertDialogTitle: Caja,
  };
});
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-valor={p.value ?? ""}
      data-deshabilitado={p.disabled ? "si" : "no"}
      data-opciones={p.options.map((o) => o.label).join("|")}
    />
  ),
}));

// El mismo «hoy» del golden (14-oct-2026): la fecha del alta nace en hoy.
vi.setSystemTime(new Date("2026-10-14T17:00:00Z"));
afterAll(() => vi.useRealTimers());
const { ExpenseCreateDialog } = await import("../expense-create-dialog");
const { PorPagarProvider } = await import("@/components/admin/por-pagar-provider");

const GOLDEN = JSON.parse(readFileSync(path.resolve(__dirname, "./alta-gasto.golden.json"), "utf8")) as Record<
  string,
  string
>;
const FLOTA: AvionCatalogoGasto[] = [
  { id: "5a82eb4a-086c-4058-97bd-b2aacdc2e942", matricula: "N4142R", combustible: "AVGAS" },
  { id: "e1a85e5b-9eaa-4367-9920-68d5d78883e8", matricula: "N621TX", combustible: "TURBOSINA" },
];
const PROV = [{ id: "7a1c0000-0000-4000-8000-000000000001", nombre: "HSBC" }];

const abierta = (extra: Record<string, unknown>, capacidad?: { habilitado: boolean; fechaMax: string | null }) => {
  const alta = <ExpenseCreateDialog aircraft={FLOTA} providers={PROV} abierto onAbiertoChange={() => {}} {...extra} />;
  return renderToStaticMarkup(capacidad ? <PorPagarProvider capacidad={capacidad}>{alta}</PorPagarProvider> : alta);
};

describe("el alta con y sin la capacidad de «por pagar»", () => {
  it("CON capacidad y la fecha de hoy: byte a byte el golden (sin nota)", () => {
    const cap = { habilitado: true, fechaMax: "2026-11-13" };
    expect(abierta({ defaultCategoria: "OTRO" }, cap)).toBe(GOLDEN.otro);
    expect(abierta({ defaultCategoria: "REFACCION" }, cap)).toBe(GOLDEN.refaccion);
    expect(abierta({ titulo: "Crear el gasto con la suma de 2 cargos", contexto: "Contexto de prueba." }, cap)).toBe(
      GOLDEN.operaciones,
    );
    expect(abierta({ defaultCategoria: "OTRO" }, cap)).not.toContain("data-nota-por-pagar");
  });

  it("SIN capacidad (Provider apagado): idéntico", () => {
    expect(abierta({ defaultCategoria: "OTRO" }, { habilitado: false, fechaMax: null })).toBe(GOLDEN.otro);
  });
});
