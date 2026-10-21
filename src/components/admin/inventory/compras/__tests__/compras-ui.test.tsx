/**
 * Compras: el flujo que se ve (21-oct-2026, API 0.0.102, invariante 101 del
 * API). El runner no tiene DOM: render estático de las piezas reales +
 * lectura del fuente. Lo que se vigila: la lista dice qué le falta a cada
 * compra (recepción, gasto, sin líneas con su baja), la línea de pasos del
 * detalle con la acción que sigue, los botones «Registrar gasto» / «Vincular
 * gasto ya registrado», el diálogo del gasto (monto del API, T.C.
 * obligatorio y sugerido) y la página con sus pestañas y su ayuda.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fmtMontoMoneda, type CompraDetalle, type CompraListItem } from "@/types/compras";
import {
  AYUDA_FLUJO_COMPRAS,
  BOTON_REGISTRAR_GASTO,
  BOTON_VINCULAR_GASTO,
  ETIQUETA_ACCION,
  ETIQUETA_SIN_GASTO,
  ETIQUETA_SIN_LINEAS,
  ETIQUETA_TC_COMPRA,
  TEXTO_COMPRA_COMPLETA,
  descripcionRegistrarGasto,
  hintTcSugerido,
  textoEquivalente,
  tituloRegistrarGasto,
} from "@/lib/admin/compras-estado";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/inventory/compras",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  addPagoCompraAction: vi.fn(),
  createCompraAction: vi.fn(),
  deleteCompraAction: vi.fn(),
  entradaDesdeGastoAction: vi.fn(),
  listGastosCandidatosCompraAction: vi.fn(async () => ({ ok: true, data: { data: [], total: 0, truncado: false, ventana: {} } })),
  recibirCompraAction: vi.fn(),
  registrarGastoCompraAction: vi.fn(),
  removePagoCompraAction: vi.fn(),
  updatePagoRolAction: vi.fn(),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  listCuentasGastoAction: async () => ({ ok: true, data: [] }),
  crearCuentaGastoAction: async () => ({ ok: false }),
  obtenerProveedorAction: async () => ({ ok: false }),
  guardarProveedorGastoAction: async () => ({ ok: false }),
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
  SearchableSelect: (p: { options: { value: string; label: string }[]; value: string | null | undefined; placeholder?: string }) => (
    <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} data-opciones={p.options.map((o) => o.label).join("|")} />
  ),
}));

const { ComprasTable } = await import("../compras-table");
const { CompraPasos } = await import("../compra-pasos");
const { CompraActions } = await import("../compra-actions");
const { CompraRegistrarGastoDialog } = await import("../compra-registrar-gasto-dialog");

const raiz = path.resolve(__dirname, "../../../../../");
/** La etiqueta `<input …>` del T.C. (controlado: SÍ pinta `value` en SSR). */
const inputTc = (html: string): string => html.match(/<input[^>]*data-tc-compra[^>]*>/)?.[0] ?? "";
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fila = (extra: Partial<CompraListItem> = {}): CompraListItem => ({
  id: "0f5e6659-2c39-40d0-89d5-3fbd8d98537d",
  folio: 12,
  proveedor: { id: "p-1", nombre: "Aircraft Spruce" },
  fecha: "2026-10-02",
  referencia: "AS-1",
  moneda: "USD",
  estado: "ABIERTA",
  n_lineas: 3,
  n_pagos: 0,
  total_mercancia: 622.1,
  total: 722.9,
  total_mxn: null,
  total_usd: 722.9,
  recibida_at: null,
  tc_usd_mxn: 18.2,
  total_factura: 722.9,
  gasto_estado: "SIN_GASTO",
  gasto_mercancia: 0,
  gasto_faltante: null,
  ...extra,
});

const detalle = (extra: Partial<CompraDetalle> = {}): CompraDetalle => ({
  id: "0f5e6659-2c39-40d0-89d5-3fbd8d98537d",
  folio: 12,
  proveedor: { id: "p-1", nombre: "Aircraft Spruce" },
  fecha: "2026-10-02",
  referencia: "AS-1",
  moneda: "USD",
  tc_usd_mxn: null,
  estado: "ABIERTA",
  cargos_factura: [],
  recibida_at: null,
  notas: null,
  lineas: [{ id: "l-1" } as CompraDetalle["lineas"][number]],
  pagos: [],
  resumen: {
    total_mercancia: 622.1,
    cargos_factura: 100.8,
    cargos_pagos: 0,
    total: 722.9,
    factor: 1.162,
    moneda: "USD",
    tc_usd_mxn: null,
    total_usd: 722.9,
    total_mxn: null,
    avisos: [],
    total_factura: 722.9,
    gasto_estado: "SIN_GASTO",
    gasto_mercancia: 0,
    gasto_faltante: null,
  },
  ...extra,
});

describe("la lista: qué le falta a cada compra", () => {
  it("badges de recepción y gasto con el estado del API; «Sin líneas» + bote solo en una abierta sin líneas", () => {
    const html = renderToStaticMarkup(
      <ComprasTable
        compras={[
          fila(),
          fila({ id: "c-2", folio: 7, n_lineas: 0 }),
          fila({ id: "c-3", folio: 4, estado: "RECIBIDA", recibida_at: "2026-10-12T17:00:00+00:00", gasto_estado: "REGISTRADO", gasto_mercancia: 722.9, n_pagos: 1 }),
          fila({ id: "c-4", folio: 3, estado: "RECIBIDA", recibida_at: "2026-10-12T17:00:00+00:00", n_lineas: 0, gasto_estado: "PARCIAL", gasto_mercancia: 0, gasto_faltante: 100 }),
        ]}
      />,
    );
    expect(html).toContain('data-recepcion="PEDIDA"');
    expect(html).toContain('data-recepcion="RECIBIDA"');
    expect(html).toContain("Recibida en bodega · 12 oct 2026");
    expect(html).toContain('data-gasto="SIN_GASTO"');
    expect(html).toContain(ETIQUETA_SIN_GASTO);
    expect(html).toContain(`Gasto registrado · ${fmtMontoMoneda(722.9, "USD")}`);
    expect(html).toContain("Gasto parcial · falta la factura de mercancía");
    expect(html).toContain(ETIQUETA_SIN_LINEAS);
    // El bote: SOLO la #7 (abierta y sin líneas); la #3 sin líneas pero recibida, no.
    expect(html).toContain('data-eliminar-compra="c-2"');
    expect(html).not.toContain('data-eliminar-compra="c-4"');
    expect((html.match(/data-eliminar-compra=/g) ?? []).length).toBe(1);
    // Columnas: Recepción, Gasto y Factura (líneas + cargos impresos).
    for (const col of ["Recepción", "Gasto", "Factura", "Puesto en bodega"]) expect(html).toContain(col);
    expect(html).not.toContain(">Estado<");
  });
});

describe("el detalle: pasos y acciones", () => {
  it("pedida con líneas y sin gasto: Registrada ✓ · Recibida pendiente · Gasto pendiente; sigue «recibir» (botón primario)", () => {
    const c = detalle();
    const pasos = renderToStaticMarkup(<CompraPasos compra={c} />);
    expect(pasos).toContain('data-paso="registrada" data-estado="hecho"');
    expect(pasos).toContain('data-paso="recibida" data-estado="pendiente"');
    expect(pasos).toContain('data-paso="gasto" data-estado="pendiente"');
    expect(pasos).toContain('data-siguiente="recibir"');
    expect(pasos).toContain(esc(ETIQUETA_ACCION.recibir));
    const acciones = renderToStaticMarkup(<CompraActions compra={c} providers={[]} />);
    expect(acciones).toContain('data-siguiente="recibir"');
    expect(acciones).toContain(esc(ETIQUETA_ACCION.recibir));
    expect(acciones).toContain(BOTON_REGISTRAR_GASTO);
    expect(acciones).toContain(BOTON_VINCULAR_GASTO);
    // «Registrar gasto» habilitado (todavía no tiene gasto).
    expect(acciones).toMatch(/<button[^>]*data-accion="gasto"[^>]*>/);
    expect(acciones).not.toMatch(/<button[^>]*disabled=""[^>]*data-accion="gasto"/);
  });

  it("recibida sin gasto: sigue «Registrar gasto»; completa: nada que hacer y el botón del gasto deshabilitado", () => {
    const recibida = detalle({ estado: "RECIBIDA", recibida_at: "2026-10-12T17:00:00+00:00" });
    expect(renderToStaticMarkup(<CompraPasos compra={recibida} />)).toContain('data-siguiente="gasto"');
    const completa = detalle({
      estado: "RECIBIDA",
      recibida_at: "2026-10-12T17:00:00+00:00",
      pagos: [{ id: "g-1" } as CompraDetalle["pagos"][number]],
      resumen: { ...detalle().resumen, gasto_estado: "REGISTRADO", gasto_mercancia: 722.9 },
    });
    const pasos = renderToStaticMarkup(<CompraPasos compra={completa} />);
    expect(pasos).toContain('data-siguiente="completa"');
    expect(pasos).toContain(TEXTO_COMPRA_COMPLETA);
    const acciones = renderToStaticMarkup(<CompraActions compra={completa} providers={[]} />);
    expect(acciones).toMatch(/<button[^>]*disabled=""[^>]*data-accion="gasto"/);
    expect(acciones).toContain("Recalcular costos");
  });

  it("sin líneas: lo que sigue es agregarlas y «recibir» queda deshabilitado", () => {
    const sinLineas = detalle({ lineas: [] });
    expect(renderToStaticMarkup(<CompraPasos compra={sinLineas} />)).toContain('data-siguiente="lineas"');
    expect(renderToStaticMarkup(<CompraActions compra={sinLineas} providers={[]} />)).toMatch(
      /<button[^>]*disabled=""[^>]*data-accion="recibir"/,
    );
  });
});

describe("«Registrar gasto»: el diálogo", () => {
  it("monto del API (no se captura), T.C. OBLIGATORIO prellenado con el oficial de hoy, fecha del pago y medio", () => {
    const c = detalle();
    const html = renderToStaticMarkup(
      <CompraRegistrarGastoDialog open onOpenChange={() => {}} compra={c} providers={[]} tcOficialHoy={18.2345} />,
    );
    expect(html).toContain(esc(tituloRegistrarGasto(12)));
    expect(html).toContain(esc(descripcionRegistrarGasto(c)));
    expect(html).toContain("data-monto-gasto-compra");
    expect(html).toContain(fmtMontoMoneda(722.9, "USD"));
    expect(html).toContain(esc(ETIQUETA_TC_COMPRA));
    expect(html).toContain(esc(hintTcSugerido(18.2345)));
    expect(inputTc(html)).toContain('value="18.2345"');
    // El equivalente en pesos con el T.C. sugerido (informativo).
    expect(html).toContain(esc(textoEquivalente(722.9, "USD", 18.2345) ?? "sin equivalente"));
    expect(html).toContain("Fecha del pago");
    expect(html).toContain('data-select="Elige el medio de pago"');
    // Sin «monto» capturable.
    expect(html).not.toMatch(/<input[^>]*name="monto"/);
  });

  it("con T.C. en la compra, ese manda sobre el oficial; sin ninguno, vacío", () => {
    const conTc = renderToStaticMarkup(
      <CompraRegistrarGastoDialog open onOpenChange={() => {}} compra={detalle({ tc_usd_mxn: 17.5 })} providers={[]} tcOficialHoy={18.2345} />,
    );
    expect(inputTc(conTc)).toContain('value="17.5"');
    const sin = renderToStaticMarkup(<CompraRegistrarGastoDialog open onOpenChange={() => {}} compra={detalle()} providers={[]} />);
    expect(inputTc(sin)).toContain('value=""');
  });
});

describe("cableado de la página y las actions", () => {
  it("la lista lee TODAS las compras (sin cap), reparte las pestañas con la regla pura y pinta la ayuda del flujo", () => {
    const pagina = leer("app/admin/inventory/compras/page.tsx");
    expect(pagina).toContain("listComprasTodas()");
    expect(pagina).toContain("contarPestanasCompras(comprasRes.data)");
    expect(pagina).toContain("filtrarComprasPorPestana(comprasRes.data, filtro)");
    expect(pagina).toContain("{AYUDA_FLUJO_COMPRAS}");
    expect(pagina).toContain("ORDEN_PESTANAS_COMPRAS.map");
    expect(pagina).not.toContain("Una compra une la factura de las refacciones");
    expect(pagina).toContain("<CompraRegistrarDialog providers={providers} items={items} />");
    expect(AYUDA_FLUJO_COMPRAS).toBe(
      "Registra la compra cuando la pides, recíbela en bodega cuando llega y registra (o vincula) su gasto cuando la pagas: cada compra dice qué le falta.",
    );
  });

  it("el detalle pinta los pasos y pasa el T.C. oficial y los proveedores a las acciones", () => {
    const pagina = leer("app/admin/inventory/compras/[id]/page.tsx");
    expect(pagina).toContain("<CompraPasos compra={compra} />");
    expect(pagina).toContain("<CompraActions compra={compra} providers={providers} tcOficialHoy={tcOficialHoy} />");
    expect(pagina).toContain("getTipoCambioOficial()");
  });

  it("las actions: registrar-gasto, candidatos y entrada-desde-gasto contra sus rutas, con revalidación donde toca", () => {
    const actions = leer("app/admin/inventory/compras/actions.ts");
    expect(actions).toContain("`/v1/compras/${id}/registrar-gasto`");
    expect(actions).toContain('"/v1/compras/gastos-candidatos"');
    expect(actions).toContain('"/v1/compras/entrada-desde-gasto"');
    expect(actions).not.toContain("listGastosSinCompraAction");
    // registrar-gasto crea un gasto: Gastos (vía revalidateCompra) y caja chica se refrescan.
    const i = actions.indexOf("export async function registrarGastoCompraAction");
    const cuerpo = actions.slice(i, actions.indexOf("export async function", i + 10));
    expect(cuerpo).toContain("revalidateCompra(id);");
    expect(cuerpo).toContain('revalidatePath("/admin/caja-chica", "layout");');
    // Las lecturas de selectores no revalidan (las llama un diálogo abierto).
    const j = actions.indexOf("export async function listGastosCandidatosCompraAction");
    expect(actions.slice(j)).not.toContain("revalidatePath");
  });
});
