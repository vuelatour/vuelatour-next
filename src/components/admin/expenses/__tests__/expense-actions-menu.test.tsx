/**
 * El menú ⋯ REAL de un gasto (`ExpenseActions`), el que desde el 1-oct-2026
 * también llega a cada carga de Combustibles (los otros tests lo sustituyen
 * por un testigo):
 *
 *  1. El botón ⋯ (Base UI real) lleva la manita y un nombre accesible que
 *     dice DE QUÉ gasto son las acciones.
 *  2. «Eliminar» y «Dar visto bueno» solo a los roles que el API acepta
 *     (`lib/admin/gasto-acciones.ts`); sin rol conocido no se esconde nada.
 *  3. «Eliminar» NO borra: abre la confirmación «¿Eliminar este gasto?» y el
 *     borrado sale solo del botón de esa confirmación (regla permanente del
 *     cliente: toda acción destructiva pide confirmación).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Gasto } from "@/types/expenses";

const llamadas = vi.hoisted(() => ({ delete: 0 }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/combustibles",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  deleteGastoAction: async () => {
    llamadas.delete += 1;
    return { ok: true };
  },
  dismissDuplicadoAction: async () => ({ ok: true }),
  vistoBuenoGastoAction: async () => ({ ok: true }),
  verifyGastoAction: async () => ({ ok: true }),
  assignVueloGastoAction: async () => ({ ok: true }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  reanalizarComprobanteAction: async () => ({ ok: false }),
  sugerirAsignacionGastoAction: async () => ({ ok: false }),
  getRepartoAction: async () => ({ ok: true, data: null }),
  listAvionesActivosAction: async () => ({ ok: true, data: [] }),
  saveRepartoAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  createCompraAction: async () => ({ ok: false }),
  addPagoCompraAction: async () => ({ ok: false }),
  listComprasAbiertasAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));

function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "g-1",
    vuelo_id: null,
    aeronave_id: "av-vgv",
    usuario_captura_id: "u-1",
    categoria: "GAS",
    monto: "4250.50",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-01",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "4321",
    folio_ticket: null,
    litros: "180.5",
    tipo_combustible: "AVGAS",
    lugar: "CUN",
    fecha_hora_carga: "2026-10-01T19:20:00Z",
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    requiere_visto_bueno: true,
    notas: null,
    created_at: "2026-10-01T19:28:00Z",
    updated_at: "2026-10-01T19:28:00Z",
    ...over,
  } as Gasto;
}

const AVIONES = [{ id: "av-vgv", matricula: "XA-VGV" }];

describe("el botón ⋯ real (Base UI)", () => {
  it("lleva la manita y un nombre accesible con el monto y la fecha del gasto", async () => {
    const { ExpenseActions } = await import("../expense-actions");
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} />,
    );
    const boton = html.match(/<button[^>]*aria-label="Acciones del gasto[^"]*"[^>]*>/)?.[0] ?? "";
    expect(boton).not.toBe("");
    expect(boton).toContain('aria-label="Acciones del gasto de $4,250.50 MXN del 01 oct 2026"');
    expect(boton).toMatch(/class="[^"]*\bcursor-pointer\b/);
    expect(boton).toContain('title="Más acciones"');
  });
});

describe("contenido del menú y confirmación de «Eliminar»", () => {
  // Para ver los renglones sin abrir el menú (no hay clics en un render
  // estático), los primitivos de menú y confirmación se sustituyen por cajas
  // que pintan todo y guardan el onClick de cada renglón.
  const clics = new Map<string, () => void>();
  let ExpenseActions: typeof import("../expense-actions").ExpenseActions;

  const texto = (n: ReactNode): string =>
    Array.isArray(n)
      ? n.map(texto).join("")
      : typeof n === "string" || typeof n === "number"
        ? String(n)
        : n && typeof n === "object" && "props" in n
          ? texto((n as { props: { children?: ReactNode } }).props.children)
          : "";

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("@/components/ui/dropdown-menu", () => ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div data-menu="">{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => {
        const t = texto(children).trim();
        if (onClick) clics.set(t, onClick);
        return <div data-item={t}>{children}</div>;
      },
    }));
    vi.doMock("@/components/ui/alert-dialog", () => {
      const Caja = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
      return {
        AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (
          <div data-confirmacion={open ? "abierta" : "cerrada"}>{children}</div>
        ),
        AlertDialogContent: Caja,
        AlertDialogHeader: Caja,
        AlertDialogFooter: Caja,
        AlertDialogTitle: Caja,
        AlertDialogDescription: Caja,
        AlertDialogCancel: Caja,
        AlertDialogAction: ({ children }: { children: ReactNode }) => (
          <button data-confirmar="">{children}</button>
        ),
      };
    });
    ({ ExpenseActions } = await import("../expense-actions"));
  });

  afterEach(() => {
    clics.clear();
    llamadas.delete = 0;
  });

  const items = (html: string) => [...html.matchAll(/data-item="([^"]*)"/g)].map((m) => m[1]);

  it("ADMIN: «Dar visto bueno», «Verificar / editar» y «Eliminar»", () => {
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} rol="ADMIN" />,
    );
    expect(items(html)).toEqual([
      "Dar visto bueno (prellenado IA)",
      "Verificar / editar",
      "Eliminar",
    ]);
  });

  it("FACTURACION: sin «Eliminar» (el API se lo rechaza); sí visto bueno", () => {
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} rol="FACTURACION" />,
    );
    expect(items(html)).toEqual(["Dar visto bueno (prellenado IA)", "Verificar / editar"]);
  });

  it("COORDINADOR: sin «Dar visto bueno»; sí «Eliminar»", () => {
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} rol="COORDINADOR" />,
    );
    expect(items(html)).toEqual(["Verificar / editar", "Eliminar"]);
  });

  it("sin rol (la página no lo pasó): no se esconde nada", () => {
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} />,
    );
    expect(items(html)).toContain("Eliminar");
    expect(items(html)).toContain("Dar visto bueno (prellenado IA)");
  });

  it("«Eliminar» solo ABRE la confirmación; borrar sale del botón de la confirmación", () => {
    const html = renderToStaticMarkup(
      <ExpenseActions gasto={gasto()} aircraft={AVIONES} providers={[]} rol="ADMIN" />,
    );
    // La confirmación existe, cerrada, con su pregunta y su botón.
    const confirmacion =
      html.match(/<div data-confirmacion="cerrada">(?:(?!data-confirmacion=)[\s\S])*?¿Eliminar este gasto\?[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(confirmacion).toContain("Esta acción no se puede deshacer.");
    expect(confirmacion).toMatch(/<button data-confirmar="">Eliminar<\/button>/);
    // El clic del renglón no llama al borrado (solo abre la confirmación).
    const eliminar = clics.get("Eliminar");
    expect(eliminar).toBeTypeOf("function");
    eliminar!();
    expect(llamadas.delete).toBe(0);
  });
});
