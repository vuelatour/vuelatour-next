/**
 * Nómina: un espacio propio (15-oct-2026). Pedido del cliente: «Necesitamos un
 * nuevo espacio debajo de Gastos y Otros Gastos que se llame Nomina para tener
 * en ese apartado todo lo de nomina».
 *
 * El runner no tiene DOM: se congela el MARCADO estático (resumen con los
 * montos REALES de prod, la tabla de Gastos sin el proveedor de «Unir en
 * compra», el botón y la ayuda del alta) y el CABLEADO por regex sobre los
 * fuentes (menú, página, alta). Los mocks son los de `gastos-una-tabla` y
 * `alta-con-cargos-ui`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import type { Gasto } from "@/types/expenses";
import { NAV_GROUPS, filterNavGroupsForRole, itemNavActivo } from "@/lib/admin/nav-items";
import { getPageTitleFromPathname } from "@/lib/admin/page-title";
import {
  AYUDA_ALTA_NOMINA,
  AYUDA_CAPTURA_NOMINA,
  ETIQUETA_REGISTRAR_NOMINA,
  NOTA_QUINCENA,
  resumenNomina,
  type GastoNominaResumen,
} from "@/lib/admin/nomina";

/** Query VIVA de la página (lo que `useSearchParams` devuelve en cada prueba). */
const urlViva = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/nomina",
  useSearchParams: () => new URLSearchParams(urlViva.query),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  createGastoAction: async () => ({ ok: false }),
  buscarVuelosCercanosAction: async () => ({ ok: true, data: [] }),
  leerFacturaIAAction: async () => ({ ok: false }),
  listArticulosRefaccionAction: async () => ({ ok: true, data: [] }),
  listAvionesActivosAction: async () => ({ ok: false }),
  marcarFacturacionAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/users/actions", () => ({
  listCardsOptionsAction: async () => ({ ok: true, data: [] }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  unirGastosEnCompraAction: async () => ({ ok: false }),
}));
vi.mock("@/lib/storage/gasto-fotos", () => ({ uploadGastoComprobante: async () => "x" }));
vi.mock("@/components/admin/expenses/expense-actions", () => ({
  ExpenseActions: ({ gasto }: { gasto: Gasto }) => <span data-acciones={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({
  FacturacionBadge: ({ gasto }: { gasto: Gasto }) => <span data-facturacion={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/gasto-factura-button", () => ({
  GastoFacturaButton: ({ gasto }: { gasto: Gasto }) => <span data-subir-factura={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/gasto-banco-sheet", () => ({
  useDetalleBancoGasto: () => ({ abrir: () => {} }),
  GastoBancoSheet: () => null,
}));
// Diálogos abiertos sin portal (el alta en modo controlado).
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
  SearchableSelect: (p: { placeholder?: string; value: string | null | undefined }) => (
    <span data-select={p.placeholder ?? ""} data-valor={p.value ?? ""} />
  ),
}));

const { NominaResumen } = await import("../nomina-resumen");
const { ExpensesTable } = await import("@/components/admin/expenses/expenses-table");
const { ExpenseCreateDialog } = await import("@/components/admin/expenses/expense-create-dialog");
const { GastosPersonalesFilterBar } = await import("@/components/admin/expenses/gastos-personales-filter-bar");
const { NominaNavMeses } = await import("../nomina-nav-meses");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pago = (fecha_gasto: string, monto: string, medio_pago = "TRANSFERENCIA", moneda = "MXN"): GastoNominaResumen => ({
  fecha_gasto,
  monto,
  medio_pago,
  moneda,
});

/** Octubre 2026 (prod): 12 pagos MXN = $109,921.46, todos del 1 al 15 (medios ilustrativos). */
const OCTUBRE = [
  pago("2026-10-07", "5663.86"),
  pago("2026-10-14", "5000.00"),
  pago("2026-10-15", "6830.00"),
  pago("2026-10-15", "3565.80", "PAYWISE"),
  pago("2026-10-15", "4725.60"),
  pago("2026-10-15", "4725.60"),
  pago("2026-10-15", "1910.60", "EFECTIVO"),
  pago("2026-10-15", "7500.00"),
  pago("2026-10-15", "2500.00", "EFECTIVO"),
  pago("2026-10-15", "22500.00"),
  pago("2026-10-15", "17500.00"),
  pago("2026-10-15", "27500.00"),
];

/** Septiembre 2026 (prod): 5 pagos del 30-sep = $21,757.80. */
const SEPTIEMBRE = [
  pago("2026-09-30", "1910.60", "EFECTIVO"),
  pago("2026-09-30", "4725.60"),
  pago("2026-09-30", "4725.60"),
  pago("2026-09-30", "3566.00", "PAYWISE"),
  pago("2026-09-30", "6830.00"),
];

/** Las tres tarjetas del resumen, cada una con su marcado hasta la siguiente. */
const tarjetas = (html: string): Record<string, string> =>
  Object.fromEntries(
    html
      .split('data-tarjeta-nomina="')
      .slice(1)
      .map((p) => [p.slice(0, p.indexOf('"')), p]),
  );

describe("resumen del mes (presentacional, montos REALES de prod)", () => {
  it("octubre 2026: $109,921.46 MXN · 12 pagos, todo en la 1.ª quincena y «Sin pagos» en la 2.ª", () => {
    const html = renderToStaticMarkup(<NominaResumen mes="2026-10" resumen={resumenNomina(OCTUBRE)} />);
    const t = tarjetas(html);
    expect(Object.keys(t)).toEqual(["mes", "q1", "q2"]);
    expect(t.mes).toContain(">Total de octubre 2026<");
    expect(t.mes).toContain(">$109,921.46 MXN<");
    expect(t.mes).toContain(">12 pagos<");
    // Desglose por medio con las etiquetas de medios-pago.ts, de mayor a menor.
    expect(t.mes).toMatch(/>Transferencia<\/span><span[^>]*>\$101,945\.06 MXN</);
    expect(t.mes).toMatch(/>Efectivo<\/span><span[^>]*>\$4,410\.60 MXN</);
    expect(t.mes).toMatch(/>Paywise<\/span><span[^>]*>\$3,565\.80 MXN</);
    expect(t.mes.indexOf(">Transferencia<")).toBeLessThan(t.mes.indexOf(">Efectivo<"));
    expect(t.mes.indexOf(">Efectivo<")).toBeLessThan(t.mes.indexOf(">Paywise<"));
    // Si el renglón envuelve (tarjeta angosta), el monto sigue a la DERECHA:
    // `ml-auto` en cada monto del desglose (revisión 15-oct-2026).
    const montosMedio = [...t.mes.matchAll(/<li[^>]*><span[^>]*>[^<]*<\/span><span class="([^"]*)">/g)].map((m) => m[1]);
    expect(montosMedio).toHaveLength(3);
    for (const clase of montosMedio) {
      expect(clase.split(" ")).toEqual(expect.arrayContaining(["ml-auto", "text-right", "tabular-nums"]));
    }
    expect(t.q1).toContain(">1ª quincena · 1–15 oct<");
    expect(t.q1).toContain(">$109,921.46 MXN<");
    expect(t.q1).toContain(">12 pagos<");
    expect(t.q2).toContain(">2ª quincena · 16–31 oct<");
    expect(t.q2).toContain(">Sin pagos<");
    expect(t.q2).not.toContain("$");
    expect(html).toContain(`>${NOTA_QUINCENA}<`);
    expect(html).toContain('aria-label="Resumen de la nómina del mes"');
    expect(html).toContain('aria-label="Por medio de pago"');
  });

  it("septiembre 2026: $21,757.80 MXN · 5 pagos, «Sin pagos» en la 1.ª y todo en la 2.ª (16–30 sep)", () => {
    const html = renderToStaticMarkup(<NominaResumen mes="2026-09" resumen={resumenNomina(SEPTIEMBRE)} />);
    const t = tarjetas(html);
    expect(t.mes).toContain(">Total de septiembre 2026<");
    expect(t.mes).toContain(">$21,757.80 MXN<");
    expect(t.mes).toContain(">5 pagos<");
    expect(t.q1).toContain(">1ª quincena · 1–15 sep<");
    expect(t.q1).toContain(">Sin pagos<");
    expect(t.q2).toContain(">2ª quincena · 16–30 sep<");
    expect(t.q2).toContain(">$21,757.80 MXN<");
    expect(t.q2).toContain(">5 pagos<");
  });

  it("MXN y USD NO se mezclan: cada moneda en su renglón, jamás una suma entre ellas", () => {
    const html = renderToStaticMarkup(
      <NominaResumen
        mes="2026-10"
        resumen={resumenNomina([
          pago("2026-10-05", "1000", "EFECTIVO", "MXN"),
          pago("2026-10-20", "250.50", "TRANSFERENCIA", "USD"),
        ])}
      />,
    );
    const t = tarjetas(html);
    expect(t.mes).toMatch(/>\$1,000 MXN<\/p><p[^>]*>\$250\.50 USD<\/p>/);
    expect(t.mes).toContain(">2 pagos<");
    expect(t.q1).toContain(">$1,000 MXN<");
    expect(t.q1).not.toContain("USD");
    expect(t.q2).toContain(">$250.50 USD<");
    expect(t.q2).not.toContain("MXN");
    expect(html).not.toMatch(/1,250\.5/);
  });

  it("el aviso del corte y las fechas ilegibles se DICEN (en ámbar)", () => {
    const html = renderToStaticMarkup(
      <NominaResumen
        mes="2026-10"
        resumen={resumenNomina([pago("2026-10-05", "100"), { monto: "5", moneda: "MXN" }])}
        aviso="El resumen suma solo lo que cargó (2 de 3 pagos): recarga la página para ver el total completo del mes."
      />,
    );
    expect(html).toContain("1 pago no tiene una fecha legible: cuenta en el total, pero en ninguna quincena.");
    expect(html).toContain("El resumen suma solo lo que cargó (2 de 3 pagos)");
  });

  it("es presentacional: sin hooks, sin «use client» y sin toLocaleString (formatos de lib/format)", () => {
    const fuente = leer("../nomina-resumen.tsx");
    expect(fuente).not.toContain('"use client"');
    expect(fuente).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(fuente).not.toMatch(/toLocale/);
    expect(fuente).toContain('className="grid gap-3 sm:grid-cols-3"');
  });
});

function gastoNomina(over: Partial<Gasto> = {}): Gasto {
  return {
    id: "g-nom",
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "NOMINA",
    monto: "6830.00",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-15",
    proveedor_id: null,
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "SIN_COMPROBANTE",
    estatus_facturacion: "NO_FACTURABLE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    requiere_visto_bueno: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "Sueldo · persona 1 · 1a oct",
    created_at: "2026-10-15T15:33:00Z",
    capturado_en: "2026-10-15T15:33:00Z",
    captura: { nombre: "Oficina" },
    ...over,
  } as Gasto;
}

describe("la MISMA tabla de Gastos, sin el proveedor de «Unir en compra»", () => {
  it("se pinta sin ExpensesSeleccionProvider: el pago con su menú ⋯, «Nómina» y «Sin repartir»; sin casillas", () => {
    const html = renderToStaticMarkup(
      <ExpensesTable gastos={[gastoNomina()]} aircraft={[]} providers={[]} fotoUrls={{}} rol="ADMIN" />,
    );
    expect(html).toContain('data-acciones="g-nom"');
    expect(html).toContain(">Nómina<");
    // 16-oct-2026 (API 0.0.90): una nómina SIN reparto no entra a ningún
    // balance ⇒ «Sin repartir» (ya no «VuelaTour»).
    expect(html).toContain(">Sin repartir<");
    expect(html).toContain('title="Nómina sin repartir: no entra a ningún balance hasta repartirla entre aviones en el módulo Nómina."');
    expect(html).not.toContain(">VuelaTour<");
    expect(html).toContain(">$6,830 MXN<");
    expect(html).toContain("Sueldo · persona 1 · 1a oct");
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Falta avión");
  });
});

describe("alta: botón con etiqueta propia (prop ADITIVA) y la ayuda de NÓMINA", () => {
  const GOLDEN = JSON.parse(leer("../../expenses/__tests__/alta-gasto.golden.json")) as Record<string, string>;
  const boton = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<ExpenseCreateDialog aircraft={[]} providers={[]} {...extra} />);

  it("sin etiquetaBoton el botón dice EXACTAMENTE lo de hoy (golden), «Registrar gasto» con vuelo", () => {
    expect(boton()).toBe(GOLDEN.boton);
    expect(boton({ varianteBoton: "default" })).toBe(GOLDEN.boton_primario);
    expect(boton()).toMatch(/>Nuevo gasto<\/button>$/);
    expect(boton({ defaultVueloId: "b3a1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d" })).toMatch(/>Registrar gasto<\/button>$/);
  });

  it("con etiquetaBoton: «Registrar pago de nómina» y el resto del botón idéntico", () => {
    const html = boton({
      varianteBoton: "default",
      defaultCategoria: "NOMINA",
      etiquetaBoton: ETIQUETA_REGISTRAR_NOMINA,
      titulo: ETIQUETA_REGISTRAR_NOMINA,
      contexto: AYUDA_CAPTURA_NOMINA,
    });
    expect(html).toMatch(/>Registrar pago de nómina<\/button>$/);
    expect(html).not.toContain("Nuevo gasto");
    expect(html.replace(ETIQUETA_REGISTRAR_NOMINA, "Nuevo gasto")).toBe(GOLDEN.boton_primario);
  });

  it("abierto con NÓMINA: el título, la ayuda de captura y el cuadro de la fuente única (empresa aunque traiga avión)", () => {
    const html = renderToStaticMarkup(
      <ExpenseCreateDialog
        aircraft={[]}
        providers={[]}
        abierto
        onAbiertoChange={() => {}}
        defaultCategoria="NOMINA"
        titulo={ETIQUETA_REGISTRAR_NOMINA}
        contexto={AYUDA_CAPTURA_NOMINA}
      />,
    );
    expect(html).toContain(`<div>${ETIQUETA_REGISTRAR_NOMINA}</div>`);
    expect(html).toMatch(/<p class="[^"]*" data-contexto-alta="[^"]*">En «Notas» escribe/);
    expect(html).toContain(`>${esc(AYUDA_CAPTURA_NOMINA)}</p>`);
    // El cuadro de NÓMINA es `AYUDA_ALTA_NOMINA` tal cual (revisión
    // 15-oct-2026): ya no sugiere ligar el sueldo al avión del piloto.
    expect(html).toContain(
      `<p data-ayuda-nomina="" class="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><span class="font-medium">Nómina</span>: ${esc(AYUDA_ALTA_NOMINA)}</p>`,
    );
    expect(html).not.toContain("piloto de un solo avión");
    expect(html).toContain("queda solo como referencia y no le resta nada");
    expect(html).toContain("No sale en Gastos ni entra a ningún balance hasta que se reparte entre aviones");
  });

  it("cableado del diálogo: la prop es opcional y el contexto se pinta también sin el modo controlado", () => {
    const alta = leer("../../expenses/expense-create-dialog.tsx");
    expect(alta).toMatch(/etiquetaBoton\?: string;/);
    expect(alta).toContain('{etiquetaBoton ?? (defaultVueloId ? "Registrar gasto" : "Nuevo gasto")}');
    // `contexto` NO depende de `controlado`: el alta de la página Nómina (con
    // su propio botón) también lo enseña bajo la descripción.
    expect(alta).toMatch(/\{contexto && \(\s*<p/);
    expect(alta).not.toMatch(/controlado && contexto|contexto && controlado/);
  });
});

describe("menú: «Nómina» justo debajo de «Otros gastos»", () => {
  const operacion = NAV_GROUPS.find((g) => g.label === "Operación")?.items ?? [];
  const i = operacion.findIndex((it) => it.href === "/admin/nomina");

  it("posición, etiqueta e ícono", () => {
    expect(i).toBeGreaterThan(0);
    expect(operacion[i - 1].href).toBe("/admin/otros-gastos");
    expect(operacion[i + 1].href).toBe("/admin/gastos-personales");
    expect(operacion[i].label).toBe("Nómina");
    expect(operacion[i].icon).toBe(UserGroupIcon);
  });

  it("roles = los de «Gastos» y «Otros gastos» (no se abre exposición nueva)", () => {
    const gastos = operacion.find((it) => it.href === "/admin/expenses");
    const otros = operacion.find((it) => it.href === "/admin/otros-gastos");
    expect(operacion[i].roles).toEqual(["ADMIN", "COORDINADOR", "FACTURACION"]);
    expect(operacion[i].roles).toEqual(gastos?.roles);
    expect(operacion[i].roles).toEqual(otros?.roles);
    for (const rol of ["ADMIN", "COORDINADOR", "FACTURACION"] as const) {
      expect(filterNavGroupsForRole(rol).flatMap((g) => g.items).some((it) => it.href === "/admin/nomina"), rol).toBe(true);
    }
    for (const rol of ["SOCIO", "ANALISTA", "PILOTO", "MECANICO"] as const) {
      expect(filterNavGroupsForRole(rol).flatMap((g) => g.items).some((it) => it.href === "/admin/nomina"), rol).toBe(false);
    }
  });

  it("activo en su ruta y titulado en la barra superior", () => {
    expect(itemNavActivo("/admin/nomina", "/admin/nomina")).toBe(true);
    expect(itemNavActivo("/admin/nomina", "/admin/otros-gastos")).toBe(false);
    expect(getPageTitleFromPathname("/admin/nomina")).toBe("Nómina");
  });

  it("cableado: roles y etiqueta desde la fuente única y el pedido citado con su fecha", () => {
    const nav = leer("../../../../lib/admin/nav-items.ts");
    expect(nav).toContain('import { ROLES_NOMINA, TITULO_NOMINA } from "@/lib/admin/nomina";');
    expect(nav).toMatch(/label: TITULO_NOMINA,\s*href: "\/admin\/nomina",\s*icon: UserGroupIcon,\s*roles: \[\.\.\.ROLES_NOMINA\],/);
    expect(nav).toContain("15-oct-2026");
    expect(nav).toMatch(/Necesitamos un nuevo\s*\/\/\s*espacio debajo de Gastos y Otros Gastos/);
  });
});

describe("página /admin/nomina (cableado por regex)", () => {
  const page = leer("../../../../app/admin/nomina/page.tsx");

  it("falla CERRADO: /me ⇒ puedeVerNomina ⇒ notFound(), antes de leer nada", () => {
    expect(page).toMatch(/const me = await getMe\(\)\.catch\(\(\) => null\);\s*if \(!puedeVerNomina\(me\?\.rol\)\) notFound\(\);/);
    expect(page.indexOf("notFound();")).toBeLessThan(page.indexOf("await searchParams"));
    expect(page).toContain('export const dynamic = "force-dynamic";');
    expect(page).toContain("export const metadata: Metadata = { title: TITULOS_SECCION.nomina };");
  });

  it("mes de la URL validado y la lista PRINCIPAL con la categoría y el mes", () => {
    // Inicio oficial (16-oct-2026): un mes anterior al del inicio pasa al del inicio (con aviso).
    expect(page).toContain(
      "const { mes, ajustado: mesAjustado } = ajustarMesAlInicio(mesNominaDeUrl(sp.mes, hoy), inicio);",
    );
    expect(page).toContain("const hoy = todayCancun();");
    expect(page).toContain("const { desde, hasta } = rangoMesNomina(mes);");
    expect(page).toContain("principal(listGastosAll({ categoria: CATEGORIA_NOMINA, desde, hasta }))");
    expect(page).toMatch(/degradado\.opcional\("las aeronaves", listAircraft\(\{ limit: 100 \}\)/);
    expect(page).toMatch(/degradado\.opcional\("los proveedores", listProviders\(\{ limit: 200 \}\)/);
    expect(page).toMatch(/degradado\.opcional\(\s*ETIQUETA_FOTOS_COMPROBANTES,\s*signFuelPhotos\(fotoPaths\)/);
    expect(page).toContain(".map(avionCatalogoGasto)");
    expect(page).toContain("<AvisoDegradado faltantes={degradado.faltantes} />");
    expect(page).toContain("textoCorteGastos(gastos.length, lista.datos.count)");
  });

  it("alta: el diálogo de siempre con NOMINA, el botón propio, el título y la ayuda", () => {
    const alta = /<ExpenseCreateDialog[\s\S]*?\/>/.exec(page)?.[0] ?? "";
    expect(alta).toContain("defaultCategoria={CATEGORIA_NOMINA}");
    // «Repartir entre aviones» es el primario cuando se ofrece; si no, el alta.
    expect(alta).toContain('varianteBoton={ofrecerReparto ? "outline" : "default"}');
    expect(alta).toContain("etiquetaBoton={ETIQUETA_REGISTRAR_NOMINA}");
    expect(alta).toContain("titulo={ETIQUETA_REGISTRAR_NOMINA}");
    expect(alta).toContain("contexto={AYUDA_CAPTURA_NOMINA}");
    expect(alta).toContain("aircraft={aircraft}");
    expect(alta).toContain("providers={providers}");
  });

  it("Excel de Gastos con la categoría y el mes; SIN «Ver en Gastos» (la nómina ya no sale ahí)", () => {
    const excel = /<ExcelExportButton[\s\S]*?\/>/.exec(page)?.[0] ?? "";
    expect(excel).toContain('path="/v1/expenses/export"');
    expect(excel).toContain("filename={nombreExcelNomina(mes)}");
    expect(excel).toContain("query={queryExcelNomina(mes)}");
    expect(excel).toContain("title={tituloExcelGastos(me?.rol ?? null)}");
    expect(excel).toContain('className="h-8"');
    // 16-oct-2026 (API 0.0.90): Gastos excluye la nómina; el enlace mandaría
    // a una lista vacía.
    expect(page).not.toMatch(/hrefGastosNomina|ETIQUETA_VER_EN_GASTOS|tituloVerEnGastos/);
    expect(page).not.toContain("<Link");
  });

  it("«Repartir entre aviones»: botón primario solo con la lista cargada, pagos y permiso; maxDuration 120", () => {
    expect(page).toContain(
      "const ofrecerReparto = lista.ok && gastos.length > 0 && puedeRepartirNomina(me?.rol ?? null);",
    );
    expect(page).toMatch(
      /\{ofrecerReparto && \(\s*<NominaRepartoBoton\s+pagos=\{gastos\.map\(pagoNominaDeGasto\)\}\s+etiquetaMes=\{etiquetaMesNomina\(mes\)\}\s*\/>\s*\)\}/,
    );
    expect(page.indexOf("<NominaRepartoBoton")).toBeLessThan(page.indexOf("<ExpenseCreateDialog"));
    expect(page).toContain("export const maxDuration = 120;");
    // Resumen «Repartido / Sin repartir / Por avión» con las partes GUARDADAS.
    expect(page).toContain("<NominaRepartoResumen resumen={resumenRepartoNomina(gastos)} />");
    expect(page.indexOf("<NominaResumen")).toBeLessThan(page.indexOf("<NominaRepartoResumen"));
    expect(page.indexOf("<NominaRepartoResumen")).toBeLessThan(page.indexOf("<ExpensesTable"));
  });

  it("foco del pre-cierre (`nomina_sin_repartir`): los pagos primero y en ámbar, con la franja", () => {
    expect(page).toContain("const foco = leerFocoPreCierre(sp);");
    expect(page).toContain("filasResaltadasPrimero(gastosLista, foco.ids, (g) => g.id)");
    expect(page).toContain("const gastos = conFoco.filas;");
    expect(page).toMatch(/<FranjaPreCierre[\s\S]*?encontrados=\{lista\.ok \? conFoco\.encontrados : null\}/);
    expect(page).toContain('hrefQuitar={hrefQuitarResaltado("/admin/nomina", sp)}');
    expect(page).toContain("notaVista={NOTA_VISTA_MES}");
    const tabla = /<ExpensesTable[\s\S]*?\/>/.exec(page)?.[0] ?? "";
    expect(tabla).toContain("resaltados={foco?.ids}");
    // La FRANJA va después del aviso de degradación y antes de la lista.
    expect(page.indexOf("<AvisoDegradado")).toBeLessThan(page.indexOf("<FranjaPreCierre"));
    expect(page.indexOf("<FranjaPreCierre")).toBeLessThan(page.indexOf("<ExpensesTable"));
  });

  it("periodo: el selector de Gastos personales entre «‹ anterior» y «siguiente ›» (no hacia el futuro)", () => {
    expect(page).toMatch(
      /<NominaNavMeses\s+mes=\{mes\}\s+anterior=\{esMesNomina\(anterior\) \? anterior : null\}\s+siguiente=\{esMesFuturoNomina\(siguiente, hoy\) \? null : siguiente\}\s+anteriorDeshabilitado=\{anteriorDeshabilitado\}\s*\/>/,
    );
    // Los enlaces del mes viven en el componente de cliente (leen la query
    // VIVA): la página ya no arma ningún `hrefMesNomina`.
    expect(page).not.toContain("hrefMesNomina");
    // Sin «Ver en Gastos» la página ya no tiene enlaces propios.
    expect(page.match(/prefetch=\{false\}/g)).toBeNull();
    const nav = leer("../nomina-nav-meses.tsx");
    expect(nav.startsWith('"use client";')).toBe(true);
    expect(nav).toContain("const actuales = useSearchParams().toString();");
    expect(nav).toContain("href={hrefMesNomina(anterior, actuales)}");
    expect(nav).toContain("href={hrefMesNomina(siguiente, actuales)}");
    expect(nav.match(/prefetch=\{false\}/g)).toHaveLength(2);
    expect(nav).toMatch(/const CLASE_ENLACE_MES = cn\(buttonVariants\(\{ variant: "outline" \}\), "cursor-pointer"\);/);
    expect(nav.indexOf("hrefMesNomina(anterior")).toBeLessThan(nav.indexOf("<GastosPersonalesFilterBar"));
    expect(nav.indexOf("<GastosPersonalesFilterBar")).toBeLessThan(nav.indexOf("hrefMesNomina(siguiente"));
    const barra = leer("../../expenses/gastos-personales-filter-bar.tsx");
    expect(barra).toContain("usePathname");
    expect(barra).toContain("Nómina (`/admin/nomina`");
    // Otro mes ⇒ página 1 de la tabla (la clave = mes la remonta y DataTable
    // restauraría `tp` de la URL); la búsqueda `tq` se conserva. La regla es
    // `queryCambioDeMes`, la MISMA de los enlaces (`hrefMesNomina`).
    expect(barra).toContain('import { queryCambioDeMes } from "@/lib/admin/url-params";');
    expect(barra).toContain("const qs = queryCambioDeMes(params.toString(), valor);");
    expect(barra).not.toMatch(/sp\.delete\("t[pq]"\)/);
    // La etiqueta «Mes» ligada al campo (antes el campo no tenía nombre accesible).
    expect(barra).toMatch(/<Label htmlFor=\{idMes\}/);
    expect(barra).toContain('import { Label } from "@/components/ui/label";');
    expect(barra).toMatch(/id=\{idMes\}\s*type="month"/);
  });

  it("«‹ mes» / «mes ›» conservan la búsqueda de la tabla (`tq`) y sueltan la página (`tp`), como el campo «Mes»", () => {
    // La oficina buscó «luis» en octubre: DataTable escribió `tq` (y `tp`)
    // con replaceState; los enlaces leen esa query VIVA.
    urlViva.query = "mes=2026-10&tq=luis&tp=3";
    try {
      const html = renderToStaticMarkup(<NominaNavMeses mes="2026-10" anterior="2026-09" siguiente="2026-11" />);
      const enlaces = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
      expect(enlaces).toHaveLength(2);
      expect(enlaces[0]).toContain('href="/admin/nomina?mes=2026-09&amp;tq=luis"');
      expect(enlaces[1]).toContain('href="/admin/nomina?mes=2026-11&amp;tq=luis"');
      for (const a of enlaces) {
        expect(a).not.toContain("tp=");
        expect(a).toMatch(/class="[^"]*cursor-pointer/);
      }
      expect(enlaces[0]).toContain('aria-label="Ver la nómina de septiembre 2026"');
      expect(enlaces[1]).toContain('aria-label="Ver la nómina de noviembre 2026"');
      expect(html).toMatch(/^<nav aria-label="Cambiar de mes"/);
      // El campo «Mes» va ENTRE los dos enlaces.
      expect(html.indexOf("septiembre 2026")).toBeLessThan(html.indexOf('type="month"'));
      expect(html.indexOf('type="month"')).toBeLessThan(html.indexOf("noviembre 2026"));
    } finally {
      urlViva.query = "";
    }
  });

  it("sin búsqueda: «‹ mes» va a ?mes= a secas; un vecino en null no se pinta (el siguiente no va al futuro)", () => {
    urlViva.query = "mes=2026-10";
    try {
      const html = renderToStaticMarkup(<NominaNavMeses mes="2026-10" anterior="2026-09" siguiente={null} />);
      const enlaces = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
      expect(enlaces).toHaveLength(1);
      expect(enlaces[0]).toContain('href="/admin/nomina?mes=2026-09"');
      expect(html).not.toContain("noviembre");
    } finally {
      urlViva.query = "";
    }
  });

  it("el selector de mes reutilizado: «Mes» es la etiqueta LIGADA al campo (nombre accesible) y con manita", () => {
    const html = renderToStaticMarkup(<GastosPersonalesFilterBar mes="2026-10" />);
    // w-52 (208 px): con w-44 el ícono del calendario tapaba el año de
    // «septiembre/noviembre/diciembre de 2026» a 16 px (teléfono).
    expect(html).toMatch(/<div class="w-52"><label/);
    expect(html).not.toContain("w-44");
    const id = /<label[^>]*for="([^"]+)"[^>]*>Mes<\/label>/.exec(html)?.[1];
    expect(id).toBeTruthy();
    const input = /<input[^>]*>/.exec(html)?.[0] ?? "";
    for (const attr of [`id="${id}"`, 'type="month"', 'value="2026-10"']) expect(input, attr).toContain(attr);
    expect(input).toMatch(/class="[^"]*cursor-pointer/);
    expect(html).toMatch(/<label[^>]*class="[^"]*cursor-pointer/);
  });

  it("estados honestos: error ⇒ TarjetaErrorCarga, vacío ⇒ EmptyState, y SOLO con pagos el resumen y la tabla", () => {
    const error = page.indexOf("<TarjetaErrorCarga titulo={TITULO_ERROR_NOMINA} descripcion={DESCRIPCION_ERROR_NOMINA} />");
    const vacio = page.indexOf("<EmptyState");
    const resumen = page.indexOf("<NominaResumen");
    const tabla = page.indexOf("<ExpensesTable");
    expect(page.indexOf("{!lista.ok ? (")).toBeGreaterThan(0);
    expect(error).toBeGreaterThan(page.indexOf("{!lista.ok ? ("));
    expect(vacio).toBeGreaterThan(error);
    expect(resumen).toBeGreaterThan(vacio);
    expect(tabla).toBeGreaterThan(resumen);
    expect(page).toContain("icon={UserGroupIcon}");
    expect(page).toContain("title={tituloVacioNomina(mes)}");
    expect(page).toContain("description={DESCRIPCION_VACIO_NOMINA}");
    expect(page).toContain("resumen={resumenNomina(gastos)}");
  });

  it("la MISMA tabla de Gastos, una vez, con clave = mes y SIN el proveedor de «Unir en compra»", () => {
    expect(page.match(/<ExpensesTable/g)).toHaveLength(1);
    const tabla = /<ExpensesTable[\s\S]*?\/>/.exec(page)?.[0] ?? "";
    for (const prop of [
      "key={mes}",
      "gastos={gastos}",
      "aircraft={aircraft}",
      "providers={providers}",
      "fotoUrls={fotoUrls}",
      "huboCorte={huboCorte}",
      "rol={me?.rol ?? null}",
    ]) {
      expect(tabla, prop).toContain(prop);
    }
    expect(page).not.toMatch(/ExpensesSeleccionProvider|UnirCompraToggle/);
    expect(page).toContain('<Card role="region" aria-label={ETIQUETA_LISTA_NOMINA}');
    expect(page).toContain("{tituloListaNomina(mes)}");
    // La descripción nombra solo lo que el menú ⋯ de ESE rol trae (la MISMA
    // `rol` que recibe la tabla y, con ella, `ExpenseActions`).
    expect(page).toContain("<CardDescription>{descripcionListaNomina(me?.rol ?? null)}</CardDescription>");
    expect(page).not.toContain("DESCRIPCION_LISTA_NOMINA");
  });

  it("textos desde la fuente única (nada de dinero calculado aquí: solo resumenNomina)", () => {
    expect(page).toContain("{TITULO_NOMINA}");
    expect(page).toContain("{DESCRIPCION_NOMINA}");
    expect(page).not.toMatch(/toLocale|reduce\(|\* 100|\/ 100/);
  });

  it("loading idéntico al de Gastos personales", () => {
    expect(leer("../../../../app/admin/nomina/loading.tsx")).toBe(
      leer("../../../../app/admin/gastos-personales/loading.tsx"),
    );
  });
});
