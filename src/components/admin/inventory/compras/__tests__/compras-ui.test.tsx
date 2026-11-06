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
  AVISO_CARGOS_APARTE,
  AYUDA_FLUJO_COMPRAS,
  BOTON_AGREGAR_GASTO,
  BOTON_REGISTRAR_GASTO,
  BOTON_VINCULAR_GASTO,
  DESCRIPCION_AGREGAR_GASTO,
  DESCRIPCION_GASTOS_COMPRA,
  ETIQUETA_ACCION,
  ETIQUETA_COMPROBANTE,
  ETIQUETA_QUE_PAGASTE,
  ETIQUETA_SIN_GASTO,
  ETIQUETA_SIN_LINEAS,
  ETIQUETA_TC_COMPRA,
  ETIQUETA_TOTAL_COMPRA,
  ETIQUETA_Y_EL_PAGO,
  OPCIONES_PAGO_COMPRA,
  TEXTO_COMPRA_COMPLETA,
  TITULO_CARGOS_FACTURA,
  TITULO_GASTOS_COMPRA,
  VACIO_GASTOS_COMPRA,
  descripcionRegistrarGasto,
  hintTcSugerido,
  textoEquivalente,
  tituloAgregarGasto,
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
  agregarGastoCompraAction: vi.fn(),
  updateCompraAction: vi.fn(),
  createCompraAction: vi.fn(),
  deleteCompraAction: vi.fn(),
  entradaDesdeGastoAction: vi.fn(),
  listGastosCandidatosCompraAction: vi.fn(async () => ({ ok: true, data: { data: [], total: 0, truncado: false, ventana: {} } })),
  recibirCompraAction: vi.fn(),
  registrarGastoCompraAction: vi.fn(),
  removePagoCompraAction: vi.fn(),
  updatePagoRolAction: vi.fn(),
}));
// La tarjeta «Gastos de esta compra» (4-nov-2026) arrastra piezas de Gastos
// que cargan el cliente de Supabase (env) o acciones de servidor: se
// stubbean las hojas, no la tarjeta.
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "oficina/x.pdf" }));
vi.mock("@/components/admin/comprobante-preview", () => ({ ComprobantePreview: () => null }));
vi.mock("@/components/admin/flights/historial-gasto-editar", () => ({ HistorialGastoEditar: () => null }));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({ FacturacionBadge: () => <span /> }));
vi.mock("@/components/admin/expenses/gasto-factura-button", () => ({ GastoFacturaButton: () => <span /> }));
vi.mock("@/components/admin/expenses/gasto-banco-sheet", () => ({
  useDetalleBancoGasto: () => ({ abrir: () => {} }),
  GastoBancoSheet: () => null,
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
const { CompraAgregarGastoDialog } = await import("../compra-agregar-gasto-dialog");
const { CompraPagosCard } = await import("../compra-pagos-card");
const { CompraCargosFacturaCard } = await import("../compra-cargos-factura-card");
const { CompraRegistrarGastoDialog } = await import("../compra-registrar-gasto-dialog");
const { CompraRegistrarDialog } = await import("../compra-registrar-dialog");

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
    expect(html).toContain("Recibida en bodega · 12/10/2026");
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
    // 4-nov-2026: «Agregar gasto» en la cabecera; «Vincular» vive en la tarjeta de gastos.
    expect(acciones).toContain(BOTON_AGREGAR_GASTO);
    expect(acciones).toMatch(/<button[^>]*data-accion="agregar-gasto"[^>]*>/);
    expect(acciones).not.toContain(BOTON_VINCULAR_GASTO);
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
    expect(pagina).toContain("<CompraRegistrarDialog providers={providers} items={items} tcOficialHoy={tcOficialHoy} />");
    expect(pagina).toContain("getTipoCambioOficial().catch(() => null)");
    expect(AYUDA_FLUJO_COMPRAS).toBe(
      "Registra la compra cuando la pides, recíbela en bodega cuando llega y registra (o vincula) su gasto cuando la pagas: cada compra dice qué le falta.",
    );
  });

  it("el detalle pinta los pasos y pasa el T.C. oficial y los proveedores a las acciones y a la tarjeta de gastos", () => {
    const pagina = leer("app/admin/inventory/compras/[id]/page.tsx");
    expect(pagina).toContain("<CompraPasos compra={compra} />");
    expect(pagina).toContain("<CompraActions compra={compra} providers={providers} tcOficialHoy={tcOficialHoy} />");
    expect(pagina).toContain("getTipoCambioOficial()");
    // 4-nov-2026: los gastos de la compra a lo ancho y ANTES de los cargos impresos en la factura.
    const gastos = pagina.indexOf("<CompraPagosCard");
    const cargos = pagina.indexOf("<CompraCargosFacturaCard");
    expect(gastos).toBeGreaterThan(0);
    expect(cargos).toBeGreaterThan(gastos);
    expect(pagina.slice(gastos, cargos)).toContain("tcOficialHoy={tcOficialHoy}");
    expect(pagina.slice(gastos, cargos)).toContain("providers={providers}");
  });

  it("la action «Agregar gasto» pega a POST /v1/compras/:id/gastos y refresca Gastos y caja chica", () => {
    const actions = leer("app/admin/inventory/compras/actions.ts");
    const i = actions.indexOf("export async function agregarGastoCompraAction");
    expect(i).toBeGreaterThan(0);
    const cuerpo = actions.slice(i, actions.indexOf("export async function", i + 10));
    expect(cuerpo).toContain("`/v1/compras/${id}/gastos`");
    expect(cuerpo).toContain('method: "POST"');
    expect(cuerpo).toContain("revalidateCompra(id);");
    expect(cuerpo).toContain('revalidatePath("/admin/caja-chica", "layout");');
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

// ===== Los gastos de la compra, uno por uno (4-nov-2026, API 0.0.120) =====

describe("«Agregar gasto»: el diálogo y la tarjeta «Gastos de esta compra»", () => {
  it("el diálogo: qué pagaste (envío en pesos por default), monto y moneda capturables, T.C. obligatorio sugerido y comprobante", () => {
    const c = detalle();
    const html = renderToStaticMarkup(
      <CompraAgregarGastoDialog open onOpenChange={() => {}} compra={c} providers={[]} tcOficialHoy={18.2345} />,
    );
    expect(html).toContain(esc(tituloAgregarGasto(12)));
    expect(html).toContain(esc(DESCRIPCION_AGREGAR_GASTO));
    expect(html).toContain(esc(ETIQUETA_QUE_PAGASTE));
    expect(html).toContain("Envío (UPS, DHL, FedEx…)");
    expect(html).toMatch(/<input[^>]*data-monto-otro-gasto[^>]*>/);
    expect(html).toContain("MXN (pesos)");
    expect(html).toContain(esc(ETIQUETA_TC_COMPRA));
    expect(inputTc(html)).toContain('value="18.2345"');
    expect(html).toContain(esc(ETIQUETA_COMPROBANTE));
    expect(html).toContain("data-comprobante-archivo");
    expect(html).toContain('data-select="Elige el medio de pago"');
    expect(html).toContain(BOTON_AGREGAR_GASTO);
    // Sin el monto del API: aquí el monto es de SU factura.
    expect(html).not.toContain("data-monto-gasto-compra");
  });

  it("la tarjeta: título y ayuda nuevos, «Agregar gasto» (primario) + «Vincular», el texto vacío y el total informativo con enlace a Gastos por fila", () => {
    const vacia = renderToStaticMarkup(<CompraPagosCard compra={detalle()} fotoUrls={{}} providers={[]} />);
    expect(vacia).toContain(TITULO_GASTOS_COMPRA);
    expect(vacia).toContain(esc(DESCRIPCION_GASTOS_COMPRA));
    expect(vacia).toContain(esc(VACIO_GASTOS_COMPRA));
    expect(vacia).toMatch(/<button[^>]*data-accion="agregar-gasto"[^>]*>/);
    expect(vacia).toMatch(/<button[^>]*data-accion="vincular"[^>]*>/);
    expect(vacia).toContain(BOTON_VINCULAR_GASTO);
    const conPagos = renderToStaticMarkup(
      <CompraPagosCard
        compra={detalle({
          pagos: [
            {
              id: "7c1f0a3e-5d2b-4e6f-9a8b-1c2d3e4f5a6b",
              fecha_gasto: "2026-11-04T18:00:00+00:00",
              categoria: "PAQUETERIA",
              monto: 1850.5,
              moneda: "MXN",
              tc_gasto: 18.8052,
              medio_pago: "TARJETA_CORP",
              proveedor: { nombre: "UPS" },
              foto_url: null,
              notas: "Envío de la compra #12",
              compra_rol: "ENVIO",
              conciliado: false,
            },
          ],
        })}
        fotoUrls={{}}
        providers={[]}
      />,
    );
    expect(conPagos).toContain(ETIQUETA_TOTAL_COMPRA);
    expect(conPagos).toContain('data-abrir-gasto="7c1f0a3e-5d2b-4e6f-9a8b-1c2d3e4f5a6b"');
    expect(conPagos).toContain("/admin/expenses?");
    expect(conPagos).toContain("UPS");
    expect(conPagos).toContain(">Comprobante<");
  });

  it("«Cargos impresos en ESTA factura»: título nuevo y el aviso de que lo pagado aparte va por «Agregar gasto»", () => {
    const html = renderToStaticMarkup(<CompraCargosFacturaCard compra={detalle()} />);
    expect(html).toContain(TITULO_CARGOS_FACTURA);
    expect(html).toContain(esc(AVISO_CARGOS_APARTE));
    expect(html).toContain("data-aviso-cargos-aparte");
    expect(html).not.toContain("Cargos en la factura de mercancía");
  });

  it("«Registrar compra»: ¿Y el pago? con tres caminos, «Ya la pagué» por default con los campos del gasto y sin el T.C. duplicado", () => {
    const fuente = leer("components/admin/inventory/compras/compra-registrar-dialog.tsx");
    expect(fuente).toContain("registrarGastoCompraAction(compra.id");
    expect(fuente).toContain("uploadGastoComprobante(archivo)");
    expect(fuente).toContain("avisoCompraSinGasto(compra.folio, g.error)");
    expect(fuente).toContain("lineasConCosto(form)");
    // La compra nace ANTES del gasto y el comprobante se sube ANTES de crear nada.
    const subida = fuente.indexOf("uploadGastoComprobante(archivo)");
    const alta = fuente.indexOf("createCompraAction(cuerpoCompra)");
    const gasto = fuente.indexOf("registrarGastoCompraAction(compra.id");
    expect(subida).toBeLessThan(alta);
    expect(alta).toBeLessThan(gasto);
    expect(OPCIONES_PAGO_COMPRA.map((o) => o.value)).toEqual(["ahora", "despues", "vincular"]);
    expect(fuente).toContain("{directa ? ETIQUETA_COMO_SE_PAGO : ETIQUETA_Y_EL_PAGO}");
    expect(ETIQUETA_Y_EL_PAGO).toBe("¿Y el pago?");
    // Con «Ya la pagué» el T.C. de la compra es el del gasto (un solo campo).
    expect(fuente).toContain("{ ...form, tc_usd_mxn: gastoForm.tc }");
    expect(fuente).toContain("{!conGasto && (");
  });
});

// ===== «Compra directa» desde Inventario/Tienda (6-nov-2026) =====

describe("«Compra directa»: el botón de Inventario/Tienda y el diálogo en modo directa", () => {
  it("el botón de Inventario abre el mismo diálogo en modo directa (con el T.C. oficial y los artículos de la bodega)", () => {
    const html = renderToStaticMarkup(<CompraRegistrarDialog modo="directa" providers={[]} items={[]} tcOficialHoy={18.5} />);
    expect(html).toContain("data-compra-directa");
    expect(html).toContain("Compra directa");
    expect(html).not.toContain("data-registrar-compra");
    const normal = renderToStaticMarkup(<CompraRegistrarDialog providers={[]} items={[]} />);
    expect(normal).toContain("data-registrar-compra");
    expect(normal).not.toContain("data-compra-directa");
    const inventario = leer("app/admin/inventory/page.tsx");
    expect(inventario).toContain('<CompraRegistrarDialog modo="directa" providers={providers} items={itemsCompra} tcOficialHoy={tcOficialHoy} />');
    expect(inventario).toContain("getTipoCambioOficial().catch(() => null)");
    expect(inventario).toContain("{puedeAltaMasiva && (");
    // 6-nov-2026: el botón «Compras» se retiró de la cabecera; queda un enlace
    // discreto a los pedidos pendientes de recibir.
    expect(inventario).not.toContain("ShoppingCartIcon");
    expect(inventario).not.toContain("buttonVariants(");
    expect(inventario).toContain("data-enlace-compras-pedidas");
    expect(inventario).toContain("Compras pedidas (pendientes de recibir)");
  });

  it("el diálogo: en modo directa el pago es «ahora» sin radios, pregunta cómo se pagó, «Ya está en bodega» nace sin marcar, registra los gastos aparte y al final recibe (si se marcó) y se queda en Inventario", () => {
    const fuente = leer("components/admin/inventory/compras/compra-registrar-dialog.tsx");
    expect(fuente).toContain('setPago(modo === "directa" ? "ahora" : PAGO_COMPRA_DEFAULT)');
    expect(fuente).toContain("setRecibirAhora(recibirAhoraDefault(modo))");
    expect(fuente).toContain("{!directa && OPCIONES_PAGO_COMPRA.map((o) => (");
    expect(fuente).toContain("{directa ? ETIQUETA_COMO_SE_PAGO : ETIQUETA_Y_EL_PAGO}");
    expect(fuente).toContain("data-recibir-ahora={recibirAhora ?");
    // Orden: compra → gasto → gastos aparte → recibir; si todo salió, se queda en Inventario.
    const crea = fuente.indexOf("await createCompraAction(cuerpoCompra)");
    const gasto = fuente.indexOf("await registrarGastoCompraAction(compra.id");
    const otros = fuente.indexOf("await agregarGastoCompraAction(compra.id, cuerpo.cuerpo)");
    const recibe = fuente.indexOf("await recibirCompraAction(compra.id)");
    expect(crea).toBeGreaterThan(0);
    expect(gasto).toBeGreaterThan(crea);
    expect(otros).toBeGreaterThan(gasto);
    expect(recibe).toBeGreaterThan(otros);
    // Los comprobantes de los gastos aparte se suben ANTES de crear nada.
    expect(fuente.indexOf("fotosOtros[o.key] = f ? await uploadGastoComprobante(f) : null;")).toBeLessThan(crea);
    expect(fuente).toContain("data-otros-gastos={otros.length}");
    expect(fuente).toContain("{BOTON_AGREGAR_OTRO_GASTO}");
    expect(fuente).toContain("if (directa && todoBien) router.refresh();");
    expect(fuente).toContain("avisoCompraSinRecepcion(compra.folio, rec.error)");
    expect(fuente).toContain("toastCompraDirecta(gastoOk, lineas)");
    // Dinero o entrada a bodega ⇒ confirmación.
    expect(fuente).toContain("if (conGasto || recibirAhora) setConfirmar(true);");
  });
});
