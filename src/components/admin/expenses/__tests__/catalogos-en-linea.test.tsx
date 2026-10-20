/**
 * Cuenta y proveedor EN LÍNEA desde el gasto (20-oct-2026, API 0.0.100,
 * invariante 98 del API). Render estático (sin DOM): el selector de siempre
 * sin permiso, «＋ Agregar…» y el lápiz con permiso, y el CABLEADO en el alta
 * y en «Verificar / editar».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {} }) }));
vi.mock("@/app/admin/expenses/actions", () => ({
  listCuentasGastoAction: async () => ({ ok: true, data: [] }),
  crearCuentaGastoAction: async () => ({ ok: false }),
  obtenerProveedorAction: async () => ({ ok: false }),
  guardarProveedorGastoAction: async () => ({ ok: false }),
}));
vi.mock("@/components/ui/dialog", () => {
  const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div data-dialogo="">{children}</div> : null),
    DialogContent: Caja,
    DialogDescription: Caja,
    DialogFooter: Caja,
    DialogHeader: Caja,
    DialogTitle: Caja,
  };
});
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: (p: {
    options: { value: string; label: string }[];
    value: string | null | undefined;
    placeholder?: string;
    disabled?: boolean;
    id?: string;
  }) => (
    <span
      data-select={p.placeholder ?? ""}
      data-id={p.id ?? ""}
      data-valor={p.value ?? ""}
      data-deshabilitado={p.disabled ? "si" : "no"}
      data-opciones={p.options.map((o) => o.label).join("|")}
    />
  ),
}));

const { ProveedorSelector } = await import("../proveedor-selector");
const { CuentaGastoSelector } = await import("../cuenta-gasto-selector");
const { CatalogosGastoProvider } = await import("@/components/admin/catalogos-gasto-provider");

const PROV = [
  { id: "7a1c0000-0000-4000-8000-000000000001", nombre: "HSBC" },
  { id: "7a1c0000-0000-4000-8000-000000000002", nombre: "Estafeta" },
];

describe("ProveedorSelector", () => {
  it("SIN permiso (fuera del Provider): el SearchableSelect de siempre, sin envoltura ni lápiz", () => {
    const html = renderToStaticMarkup(
      <ProveedorSelector id="x" providers={PROV} value={PROV[0].id} onChange={() => {}} />,
    );
    expect(html).toBe(
      `<span data-select="Sin proveedor" data-id="x" data-valor="${PROV[0].id}" data-deshabilitado="no" data-opciones="HSBC|Estafeta"></span>`,
    );
  });

  it("CON permiso (oficina): «＋ Agregar proveedor…» al final y el lápiz con su nombre accesible", () => {
    const html = renderToStaticMarkup(
      <CatalogosGastoProvider rol="COORDINADOR">
        <ProveedorSelector id="x" providers={PROV} value={PROV[0].id} onChange={() => {}} />
      </CatalogosGastoProvider>,
    );
    expect(html).toContain('data-opciones="HSBC|Estafeta|＋ Agregar proveedor…"');
    expect(html).toContain('aria-label="Editar proveedor"');
    expect(html).toContain("cursor-pointer");
    // Sin valor elegido no hay qué corregir.
    const sin = renderToStaticMarkup(
      <CatalogosGastoProvider rol="ADMIN">
        <ProveedorSelector providers={PROV} value="" onChange={() => {}} />
      </CatalogosGastoProvider>,
    );
    expect(sin).not.toContain("Editar proveedor");
  });

  it("un rol sin permiso dentro del Provider (SOCIO): el de siempre", () => {
    const html = renderToStaticMarkup(
      <CatalogosGastoProvider rol="SOCIO">
        <ProveedorSelector providers={PROV} value="" onChange={() => {}} />
      </CatalogosGastoProvider>,
    );
    expect(html).not.toContain("Agregar proveedor");
  });
});

describe("CuentaGastoSelector", () => {
  it("mientras lee las cuentas: deshabilitado con «Cargando…» (jamás «no hay cuentas»)", () => {
    const html = renderToStaticMarkup(
      <CuentaGastoSelector id="cta" medio="TRANSFERENCIA" value="" onChange={() => {}} />,
    );
    expect(html).toContain('data-select="Cargando las cuentas…"');
    expect(html).toContain('data-deshabilitado="si"');
    expect(html).toContain('data-id="cta"');
    expect(html).not.toContain("Agregar cuenta");
  });

  it("con permiso: «＋ Agregar cuenta…» disponible desde el principio", () => {
    const html = renderToStaticMarkup(
      <CatalogosGastoProvider rol="FACTURACION">
        <CuentaGastoSelector medio="PAYWISE" value="" onChange={() => {}} />
      </CatalogosGastoProvider>,
    );
    expect(html).toContain('data-opciones="Sin indicar|＋ Agregar cuenta…"');
  });
});

describe("cableado (fuente)", () => {
  const leer = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf8");
  it("alta: cuenta en el MISMO hueco que la tarjeta, proveedor con alta en línea, y la cuenta solo viaja con su medio", () => {
    const src = leer("expense-create-dialog.tsx");
    expect(src).toMatch(/watch\("medio_pago"\) === "TARJETA_CORP" \? \(/);
    expect(src).toMatch(/\) : medioLlevaCuenta\(watch\("medio_pago"\)\) \? \(/);
    expect(src).toContain("<CuentaGastoSelector");
    expect(src).toContain("<ProveedorSelector");
    expect(src).toMatch(/cuenta_bancaria_id: cuentaParaAlta\(values\.medio_pago, values\.cuenta_bancaria_id\)/);
  });
  it("verificar: la cuenta viaja solo si cambió contra la base de la sesión", () => {
    const src = leer("expense-verify-dialog.tsx");
    expect(src).toMatch(/cuentaParaPatch\(\s*values\.medio_pago,\s*values\.cuenta_bancaria_id,\s*baseForm\.cuenta_bancaria_id \?\? null,/);
    expect(src).toContain("<ProveedorSelector");
    expect(src).toContain("actualId={gasto.cuenta_bancaria_id ?? null}");
  });
  it("el shell monta el Provider con el rol de /me", () => {
    const src = readFileSync(path.resolve(__dirname, "../../admin-shell.tsx"), "utf8");
    expect(src).toContain("<CatalogosGastoProvider rol={me.rol ?? null}>");
  });
});
