/**
 * «Es pago de AFAC» en Gastos (16-oct-2026, API 0.0.89, invariante 90 del
 * API; decisión 4 del cliente: VuelaTour paga el AFAC por vuelo y los pagos al
 * gestor se MARCAN para dejar de restarle al avión).
 *  1. Alta y «Verificar / editar» REALES (render): la casilla sale SOLO en
 *     Permiso, para quien puede marcar (rol de oficina + `config.afac_real`,
 *     vía `AfacRealProvider`) y, al editar, si el gasto trae la llave del API.
 *  2. La tabla de Gastos: chip «AFAC» y «VuelaTour · pago de AFAC» en la
 *     columna del avión.
 *  3. El historial del gasto: «Pago de AFAC: No → Sí».
 *  4. Cableado de lo que viaja (regex sobre el fuente; el runner no tiene DOM).
 * Caso real (prod, 1-sep-2026): «Permisos Vuelos Privados VGV» $5,000 de
 * XA-VGV pagado a Yousefh Pineda Bedolla (TRANSFERENCIA, conciliado).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import type { AvionCatalogoGasto } from "@/lib/admin/combustibles";
import {
  AYUDA_PAGO_AFAC,
  CHIP_PAGO_AFAC,
  ETIQUETA_PAGO_AFAC,
  NOTA_PAGO_AFAC_SE_QUITA,
  TITULO_CHIP_PAGO_AFAC,
} from "@/lib/admin/pago-afac";
import { TITULO_PAGO_AFAC_AVION } from "@/lib/admin/gasto-avion";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  createGastoAction: async () => ({ ok: false }),
  verifyGastoAction: async () => ({ ok: true }),
  assignVueloGastoAction: async () => ({ ok: true }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  leerFacturaIAAction: async () => ({ ok: false }),
  listArticulosRefaccionAction: async () => ({ ok: true, data: [] }),
  reanalizarComprobanteAction: async () => ({ ok: false }),
  sugerirAsignacionGastoAction: async () => ({ ok: false }),
  getRepartoAction: async () => ({ ok: false }),
  listAvionesActivosAction: async () => ({ ok: false }),
  saveRepartoAction: async () => ({ ok: false }),
  guardarGastoConRepartoAction: async () => ({ ok: false }),
  marcarFacturacionAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  unirGastosEnCompraAction: async () => ({ ok: false }),
}));
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "x" }));
vi.mock("@/components/admin/comprobante-preview", () => ({ ComprobantePreview: () => null }));
vi.mock("@/components/admin/flights/historial-gasto-editar", () => ({ HistorialGastoEditar: () => null }));
vi.mock("@/components/admin/expenses/expense-actions", () => ({
  ExpenseActions: ({ gasto }: { gasto: Gasto }) => <span data-acciones={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({
  FacturacionBadge: () => <span />,
}));
vi.mock("@/components/admin/expenses/gasto-factura-button", () => ({
  GastoFacturaButton: () => <span />,
}));
vi.mock("@/components/admin/expenses/gasto-banco-sheet", () => ({
  useDetalleBancoGasto: () => ({ abrir: () => {} }),
  GastoBancoSheet: () => null,
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
  SearchableSelect: (p: { value: string | null | undefined; placeholder?: string }) => (
    <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} />
  ),
}));

vi.setSystemTime(new Date("2026-10-16T17:00:00Z"));
afterAll(() => vi.useRealTimers());

const { ExpenseCreateDialog } = await import("../expense-create-dialog");
const { ExpenseVerifyDialog } = await import("../expense-verify-dialog");
const { ExpensesTable } = await import("../expenses-table");
const { ExpensesSeleccionProvider } = await import("../expenses-seleccion");
const { AfacRealProvider } = await import("@/components/admin/afac-real-provider");
const { FlightGastosHistorialCard } = await import("@/components/admin/flights/flight-gastos-historial-card");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const VGV = "a1b2c3d4-0000-4000-8000-0000000a0001";
const FLOTA: AvionCatalogoGasto[] = [{ id: VGV, matricula: "XA-VGV", combustible: "TURBOSINA" }];

/** «Permisos Vuelos Privados VGV» $5,000 (1-sep-2026). */
function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "9f1e0000-0000-4000-8000-000000005000",
    vuelo_id: null,
    aeronave_id: VGV,
    usuario_captura_id: "u-1",
    categoria: "PERMISO",
    monto: "5000.00",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-09-01",
    proveedor_id: null,
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    estatus_facturacion: "PENDIENTE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: true,
    duplicado_sospechado: false,
    requiere_visto_bueno: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "Permisos Vuelos Privados VGV · Yousefh Pineda Bedolla",
    created_at: "2026-09-01T17:00:00Z",
    aeronave: { matricula: "XA-VGV" },
    es_pago_afac: false,
    ...over,
  } as Gasto;
}

/** El <input> de la casilla (React pone `checked` al final de los atributos). */
const casilla = (html: string): string =>
  html.match(/data-casilla-pago-afac=""[\s\S]*?<input[^>]*\/>/)?.[0] ?? "";

const conPermiso = (nodo: ReactNode, puede = true) =>
  renderToStaticMarkup(<AfacRealProvider puedeMarcarPagoAfac={puede}>{nodo}</AfacRealProvider>);

const alta = (categoria: string, puede = true) =>
  conPermiso(
    <ExpenseCreateDialog aircraft={FLOTA} providers={[]} abierto onAbiertoChange={() => {}} defaultCategoria={categoria} />,
    puede,
  );

const verificar = (g: Gasto, puede = true) =>
  conPermiso(<ExpenseVerifyDialog open onOpenChange={() => {}} gasto={g} aircraft={FLOTA} providers={[]} />, puede);

describe("la casilla en el ALTA (render real)", () => {
  it("Permiso + quien puede marcar ⇒ la casilla (sin marcar) con su ayuda", () => {
    const html = alta("PERMISO");
    expect(html).toContain(esc(ETIQUETA_PAGO_AFAC));
    expect(html).toContain(AYUDA_PAGO_AFAC);
    expect(html).toContain("data-casilla-pago-afac");
    expect(casilla(html)).toContain('type="checkbox"');
    expect(casilla(html)).not.toContain('checked=""');
  });

  it("otra categoría, sin permiso o sin la migración (`config.afac_real`) ⇒ sin casilla", () => {
    expect(alta("OTRO")).not.toContain("data-casilla-pago-afac");
    expect(alta("SERVICIOS")).not.toContain("data-casilla-pago-afac");
    expect(alta("PERMISO", false)).not.toContain("data-casilla-pago-afac");
    // Fuera del Provider (pantallas sin AdminShell): false.
    expect(
      renderToStaticMarkup(
        <ExpenseCreateDialog aircraft={FLOTA} providers={[]} abierto onAbiertoChange={() => {}} defaultCategoria="PERMISO" />,
      ),
    ).not.toContain("data-casilla-pago-afac");
  });
});

describe("la casilla en «Verificar / editar» (render real)", () => {
  it("Permiso con la llave del API ⇒ la casilla con el valor guardado", () => {
    expect(verificar(gasto())).toContain("data-casilla-pago-afac");
    expect(casilla(verificar(gasto()))).not.toContain('checked=""');
    expect(casilla(verificar(gasto({ es_pago_afac: true })))).toContain('checked=""');
  });

  it("API sin la columna (sin la llave), sin permiso u otra categoría ⇒ sin casilla", () => {
    const viejo = gasto();
    delete (viejo as { es_pago_afac?: unknown }).es_pago_afac;
    expect(verificar(viejo)).not.toContain("data-casilla-pago-afac");
    expect(verificar(gasto(), false)).not.toContain("data-casilla-pago-afac");
    expect(verificar(gasto({ categoria: "OTRO" }))).not.toContain("data-casilla-pago-afac");
  });

  it("marcado y ya no es Permiso (p. ej. cambiado a Otro) ⇒ aviso de que al guardar se quita la marca", () => {
    const html = verificar(gasto({ categoria: "OTRO", es_pago_afac: true }));
    expect(html).toContain("data-pago-afac-se-quita");
    expect(html).toContain(esc(NOTA_PAGO_AFAC_SE_QUITA));
    expect(verificar(gasto({ es_pago_afac: true }))).not.toContain("data-pago-afac-se-quita");
  });
});

describe("tabla de Gastos e historial", () => {
  const pintarTabla = (g: Gasto) =>
    renderToStaticMarkup(
      <ExpensesSeleccionProvider idsVisibles={[g.id]}>
        <ExpensesTable gastos={[g]} aircraft={[{ id: VGV, matricula: "XA-VGV" }]} providers={[]} fotoUrls={{}} rol="ADMIN" />
      </ExpensesSeleccionProvider>,
    );

  it("marcado ⇒ chip «AFAC» junto a la categoría y «VuelaTour · pago de AFAC» (ref. XA-VGV) en la columna del avión", () => {
    const html = pintarTabla(gasto({ es_pago_afac: true }));
    expect(html).toMatch(new RegExp(`<span[^>]*title="${esc(TITULO_CHIP_PAGO_AFAC)}"[^>]*data-pago-afac=""[^>]*>${CHIP_PAGO_AFAC}<`));
    expect(html).toContain(`title="${esc(TITULO_PAGO_AFAC_AVION)}"`);
    expect(html).toContain(">pago de AFAC</span>");
    expect(html).toContain("ref. XA-VGV");
  });

  it("sin marcar (o sin la llave) ⇒ como siempre: sin chip y con su matrícula", () => {
    const html = pintarTabla(gasto());
    expect(html).not.toContain("data-pago-afac");
    expect(html).not.toContain("pago de AFAC");
  });

  it("historial: «Pago de AFAC: No → Sí»", () => {
    const html = renderToStaticMarkup(
      <FlightGastosHistorialCard
        eventos={[
          {
            gasto_id: gasto().id,
            accion: "UPDATE",
            actor_nombre: "Ale",
            created_at: "2026-10-16T19:05:00Z",
            diff: { es_pago_afac: { antes: false, despues: true } },
            descripcion_gasto: "Permiso · $5,000 MXN",
          },
        ]}
      />,
    );
    expect(html).toMatch(
      /Pago de AFAC:<\/span> <span class="line-through text-muted-foreground">No<\/span> → <span class="font-medium">Sí<\/span>/,
    );
  });
});

describe("cableado: qué viaja (lectura del fuente)", () => {
  const altaSrc = leer("components/admin/expenses/expense-create-dialog.tsx");
  const verSrc = leer("components/admin/expenses/expense-verify-dialog.tsx");

  it("alta: `es_pago_afac: true` SOLO marcada y con la casilla visible; cambiar la categoría la desmarca; se limpia al guardar y al cerrar", () => {
    expect(altaSrc).toMatch(
      /\.\.\.\(pagoAfacParaAlta\(\{\s*visible: casillaPagoAfacVisible\(\{ categoria: values\.categoria, puedeMarcar: puedeMarcarPagoAfac \}\),\s*marcado: pagoAfac,\s*\}\)\s*\?\s*\{ es_pago_afac: true \}\s*:\s*\{\}\)/,
    );
    expect(altaSrc).toContain("if (v !== CATEGORIA_PAGO_AFAC) setPagoAfac(false);");
    expect((altaSrc.match(/setPagoAfac\(false\);/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("verificar: la llave viaja SOLO visible y si cambió contra la BASE de la sesión; se reinicia por apertura", () => {
    expect(verSrc).toMatch(
      /const pagoAfacPatch = pagoAfacParaPatch\(\{\s*visible: casillaPagoAfacVisible\(\{ categoria: values\.categoria, puedeMarcar: puedeMarcarPagoAfac \}\),\s*marcado: pagoAfac,\s*actual: baseForm\.es_pago_afac === true,\s*\}\);\s*if \(pagoAfacPatch !== undefined\) payload\.es_pago_afac = pagoAfacPatch;/,
    );
    expect(verSrc).toContain("const puedeMarcarPagoAfac = usePuedeMarcarPagoAfac() && apiConPagoAfac(gasto);");
    expect(verSrc).toContain("setPagoAfac(gasto.es_pago_afac === true);");
    expect(verSrc).toContain("if (v !== CATEGORIA_PAGO_AFAC) setPagoAfac(false);");
  });

  it("schema: la llave existe en alta y en verificar (sin ella el z.object la tiraría)", async () => {
    const { GastoCreateSchema, GastoVerifySchema } = await import("@/app/admin/expenses/schema");
    expect(GastoVerifySchema.safeParse({ es_pago_afac: false }).data).toEqual({ es_pago_afac: false });
    expect(GastoVerifySchema.safeParse({ es_pago_afac: "si" }).success).toBe(false);
    const base = { categoria: "PERMISO", monto: 5000, moneda: "MXN", fecha_gasto: "2026-09-01", medio_pago: "TRANSFERENCIA" };
    expect(GastoCreateSchema.safeParse({ ...base, es_pago_afac: true }).data?.es_pago_afac).toBe(true);
    expect(GastoCreateSchema.safeParse(base).data).not.toHaveProperty("es_pago_afac");
  });

  it("AdminShell monta el Provider con `puedeEditarAfacReal(me)` (rol de oficina + config.afac_real)", () => {
    expect(leer("components/admin/admin-shell.tsx")).toContain(
      "<AfacRealProvider puedeMarcarPagoAfac={puedeEditarAfacReal(me)}>",
    );
  });
});
