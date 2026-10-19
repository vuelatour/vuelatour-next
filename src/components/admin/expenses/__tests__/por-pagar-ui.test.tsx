/**
 * Gastos «por pagar» en el panel (19-oct-2026, API 0.0.95, contrato §7). El
 * runner no tiene DOM: render estático de las piezas reales + cableado por
 * regex sobre los fuentes.
 *  1. Chip junto a la fecha (Gastos y gastos del vuelo): «Por pagar · 20 oct»
 *     ámbar / «Vencido · 20 oct» rojo, botón que abre «Marcar pagado»; sin
 *     `estado_pago` (API previo) o PAGADO ⇒ NADA.
 *  2. Nota de la captura: con la capacidad, la nota EXACTA; sin ella, nada.
 *  3. El diálogo «Marcar pagado»: fecha del pago default hoy, máximo hoy.
 *  4. Menú ⋯: «Marcar pagado» solo con `estado_pago` ≠ PAGADO.
 *  5. Cableado: la regla única en los dos diálogos de captura, la capacidad
 *     en el shell, el filtro solo con la capacidad (también al Excel), el
 *     renglón del pre-cierre y el bloque de la caja chica.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Gasto } from "@/types/expenses";
import { NOTA_QUEDARA_POR_PAGAR, NOTA_SIGUE_POR_PAGAR, chipEstadoPago } from "@/lib/admin/gasto-por-pagar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/expenses",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, warning: () => {}, info: () => {} }),
}));
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
  marcarPagadoGastoAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  unirGastosEnCompraAction: async () => ({ ok: false }),
}));
vi.mock("@/components/admin/expenses/expense-actions", () => ({
  ExpenseActions: ({ gasto }: { gasto: Gasto }) => <span data-acciones={gasto.id} />,
}));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({
  FacturacionBadge: () => <span data-facturacion="" />,
}));
vi.mock("@/components/admin/expenses/gasto-factura-button", () => ({
  GastoFacturaButton: () => <span data-subir-factura="" />,
}));
vi.mock("@/components/admin/expenses/gasto-banco-sheet", () => ({
  useDetalleBancoGasto: () => ({ abrir: () => {} }),
  GastoBancoSheet: () => null,
}));
// Diálogo abierto sin portal.
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

// «Hoy» Cancún = 19-oct-2026.
vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
afterAll(() => vi.useRealTimers());

const { ChipEstadoPagoGasto, BotonChipPorPagar, BotonMarcarPagado } = await import("../marcar-pagado");
const { MarcarPagadoDialog } = await import("../marcar-pagado-dialog");
const { NotaFechaPorPagar } = await import("../nota-por-pagar");
const { PorPagarProvider } = await import("@/components/admin/por-pagar-provider");
const { ExpensesTable } = await import("../expenses-table");

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const G = "0f3c2b1a-3333-4a7b-8c9d-0e1f2a3b4c5d";

function gasto(over: Partial<Gasto> = {}): Gasto {
  return {
    id: G,
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "TAXI",
    monto: "500",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-20",
    proveedor_id: null,
    medio_pago: "EFECTIVO",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "SIN_COMPROBANTE",
    estatus_facturacion: "PENDIENTE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    requiere_visto_bueno: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: "Taxi al hangar",
    created_at: "2026-10-19T15:33:00Z",
    capturado_en: "2026-10-19T15:33:00Z",
    updated_at: "2026-10-19T15:33:00.123Z",
    captura: { nombre: "Mary Cruz" },
    ...over,
  } as Gasto;
}

const CAPACIDAD = { habilitado: true, fechaMax: "2026-11-18" };

describe("chip junto a la fecha", () => {
  it("«Por pagar · 20 oct» ámbar y «Vencido · 15 oct» rojo, como BOTÓN que abre «Marcar pagado»", () => {
    const por = renderToStaticMarkup(<BotonChipPorPagar gasto={gasto({ estado_pago: "POR_PAGAR" })} />);
    expect(por).toMatch(/^<button type="button"/);
    expect(por).toContain('aria-haspopup="dialog"');
    expect(por).toContain('data-estado-pago="POR_PAGAR"');
    expect(por).toMatch(/class="[^"]*\bcursor-pointer\b/);
    expect(por).toMatch(/class="[^"]*\bborder-amber-500\/50\b/);
    expect(por).toContain(">Por pagar · 20 oct<");
    expect(por).toContain("Clic para marcarlo pagado.");
    // Sin abrir no se monta el diálogo.
    expect(por).not.toContain("data-dialogo");

    const venc = renderToStaticMarkup(
      <BotonChipPorPagar gasto={gasto({ estado_pago: "VENCIDO", fecha_gasto: "2026-10-15" })} />,
    );
    expect(venc).toContain('data-estado-pago="VENCIDO"');
    expect(venc).toMatch(/class="[^"]*\bdestructive\b/);
    expect(venc).toContain(">Vencido · 15 oct<");
  });

  it("PAGADO o sin `estado_pago` (API previo) ⇒ NADA", () => {
    expect(renderToStaticMarkup(<BotonChipPorPagar gasto={gasto({ estado_pago: "PAGADO" })} />)).toBe("");
    expect(renderToStaticMarkup(<BotonChipPorPagar gasto={gasto()} />)).toBe("");
    expect(renderToStaticMarkup(<ChipEstadoPagoGasto chip={null} />)).toBe("");
  });

  it("el chip de solo lectura lleva el título en sr-only", () => {
    const chip = chipEstadoPago({ estado_pago: "VENCIDO", fecha_gasto: "2026-10-15" });
    const html = renderToStaticMarkup(<ChipEstadoPagoGasto chip={chip} />);
    expect(html).toMatch(/^<span/);
    expect(html).toContain(`title="${esc(chip!.titulo)}"`);
    expect(html).toContain('class="sr-only"');
  });

  it("la tabla de Gastos pinta el chip bajo la fecha SOLO con `estado_pago` ≠ PAGADO", () => {
    const html = renderToStaticMarkup(
      <ExpensesTable
        gastos={[
          gasto({ id: "g-por", estado_pago: "POR_PAGAR" }),
          gasto({ id: "g-ven", estado_pago: "VENCIDO", fecha_gasto: "2026-10-15" }),
          gasto({ id: "g-pag", estado_pago: "PAGADO", fecha_gasto: "2026-10-14" }),
          gasto({ id: "g-viejo", fecha_gasto: "2026-10-13" }),
        ]}
        aircraft={[]}
        providers={[]}
        fotoUrls={{}}
      />,
    );
    expect(html.match(/data-estado-pago="/g)).toHaveLength(2);
    expect(html).toContain(">Por pagar · 20 oct<");
    expect(html).toContain(">Vencido · 15 oct<");
  });

  it("«Marcar pagado» suelto (caja chica): botón con manita que abre el MISMO diálogo", () => {
    const html = renderToStaticMarkup(<BotonMarcarPagado gasto={gasto({ estado_pago: "POR_PAGAR" })} />);
    expect(html).toContain("Marcar pagado");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/class="[^"]*\bcursor-pointer\b/);
  });
});

describe("nota de la captura bajo «Fecha del gasto»", () => {
  it("sin capacidad (fuera del Provider = API previo): NADA aunque la fecha sea futura", () => {
    expect(renderToStaticMarkup(<NotaFechaPorPagar fecha="2026-10-25" />)).toBe("");
    expect(
      renderToStaticMarkup(
        <PorPagarProvider capacidad={{ habilitado: false, fechaMax: null }}>
          <NotaFechaPorPagar fecha="2026-10-25" />
        </PorPagarProvider>,
      ),
    ).toBe("");
  });

  it("con capacidad y fecha > hoy: la nota ámbar EXACTA; con hoy, nada", () => {
    const html = renderToStaticMarkup(
      <PorPagarProvider capacidad={CAPACIDAD}>
        <NotaFechaPorPagar fecha="2026-10-25" />
      </PorPagarProvider>,
    );
    expect(html).toContain(`>${NOTA_QUEDARA_POR_PAGAR}<`);
    expect(html).toContain('role="status"');
    expect(html).toContain("text-amber-700");
    expect(
      renderToStaticMarkup(
        <PorPagarProvider capacidad={CAPACIDAD}>
          <NotaFechaPorPagar fecha="2026-10-19" />
        </PorPagarProvider>,
      ),
    ).toBe("");
  });

  it("«Verificar / editar» de un gasto que sigue por pagar: cómo se marca pagado", () => {
    const html = renderToStaticMarkup(
      <PorPagarProvider capacidad={CAPACIDAD}>
        <NotaFechaPorPagar fecha="2026-10-15" estadoGuardado="VENCIDO" />
      </PorPagarProvider>,
    );
    expect(html).toContain(esc(NOTA_SIGUE_POR_PAGAR));
  });
});

describe("el diálogo «Marcar pagado»", () => {
  it("fecha del pago con etiqueta ligada, default hoy y máximo hoy; resumen del gasto", () => {
    const html = renderToStaticMarkup(
      <MarcarPagadoDialog gasto={gasto({ estado_pago: "VENCIDO", fecha_gasto: "2026-10-15" })} onCerrar={() => {}} />,
    );
    expect(html).toContain("data-dialogo");
    expect(html).toContain(">Marcar pagado<");
    expect(html).toContain("Taxi / estacionamiento · $500 MXN · vencido desde el 15 oct 2026");
    expect(html).toContain("esa queda como la fecha del gasto (la fecha del gasto es la del pago)");
    const input = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('max="2026-10-19"');
    expect(input).toContain('value="2026-10-19"');
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(">Fecha del pago<");
    // Con hoy no hay error a la vista; el botón principal dice qué hace.
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*data-confirmar-pagado=""[^>]*>Marcar pagado<\/button>/);
  });
});

describe("menú ⋯: «Marcar pagado» solo si `estado_pago` ≠ PAGADO", () => {
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
    vi.doUnmock("@/components/admin/expenses/expense-actions");
    vi.doMock("@/app/admin/expenses/actions", () => ({
      deleteGastoAction: async () => ({ ok: true }),
      dismissDuplicadoAction: async () => ({ ok: true }),
      vistoBuenoGastoAction: async () => ({ ok: true }),
      verifyGastoAction: async () => ({ ok: true }),
      marcarPagadoGastoAction: async () => ({ ok: true }),
    }));
    vi.doMock("@/app/admin/inventory/compras/actions", () => ({
      createCompraAction: async () => ({ ok: false }),
      addPagoCompraAction: async () => ({ ok: false }),
      listComprasAbiertasAction: async () => ({ ok: true, data: [] }),
    }));
    vi.doMock("@/app/admin/users/actions", () => ({
      listCardsOptionsAction: async () => ({ ok: true, data: [] }),
    }));
    vi.doMock("@/components/admin/expenses/expense-verify-dialog", () => ({ ExpenseVerifyDialog: () => null }));
    vi.doMock("@/components/ui/dropdown-menu", () => ({
      DropdownMenu: ({ children }: { children: ReactNode }) => <div data-menu="">{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
      DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DropdownMenuItem: ({ children }: { children: ReactNode }) => <div data-item={texto(children).trim()}>{children}</div>,
    }));
    ({ ExpenseActions } = await import("../expense-actions"));
  }, 20_000);

  const items = (html: string) => [...html.matchAll(/data-item="([^"]*)"/g)].map((m) => m[1]);

  it("POR_PAGAR y VENCIDO: «Marcar pagado» PRIMERO; PAGADO o sin la llave: no está", () => {
    for (const estado of ["POR_PAGAR", "VENCIDO"]) {
      const html = renderToStaticMarkup(
        <ExpenseActions gasto={gasto({ estado_pago: estado })} aircraft={[]} providers={[]} rol="ADMIN" />,
      );
      expect(items(html)[0], estado).toBe("Marcar pagado");
      // El diálogo solo se monta al elegirlo.
      expect(html).not.toContain("data-confirmar-pagado");
    }
    for (const g of [gasto({ estado_pago: "PAGADO" }), gasto()]) {
      const html = renderToStaticMarkup(<ExpenseActions gasto={g} aircraft={[]} providers={[]} rol="ADMIN" />);
      expect(items(html)).not.toContain("Marcar pagado");
    }
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const raiz = path.resolve(__dirname, "../../../..");
  const fuente = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

  it("los dos diálogos de captura usan la regla ÚNICA y pintan la nota", () => {
    for (const rel of ["components/admin/expenses/expense-create-dialog.tsx", "components/admin/expenses/expense-verify-dialog.tsx"]) {
      const s = fuente(rel);
      expect(s, rel).toContain("evaluarFechaGasto(values.fecha_gasto, capacidadPorPagar).pideConfirmacion");
      expect(s, rel).not.toContain("fechaGastoSospechosa(");
      expect(s, rel).toContain("const capacidadPorPagar = usePorPagar();");
      expect(s, rel).toMatch(/<NotaFechaPorPagar fecha=/);
    }
    expect(fuente("components/admin/expenses/expense-verify-dialog.tsx")).toContain(
      "estadoGuardado={estadoPagoDe(gasto)}",
    );
  });

  it("la capacidad la monta el shell desde `/v1/me`", () => {
    const shell = fuente("components/admin/admin-shell.tsx");
    expect(shell).toContain("<PorPagarProvider capacidad={capacidadPorPagarDeMe(me)}>");
  });

  it("Gastos: el filtro SOLO con la capacidad, lo conservan las pestañas y viaja al Excel", () => {
    const pagina = fuente("app/admin/expenses/page.tsx");
    expect(pagina).toContain("const porPagar = capacidadPorPagarDeMe(await getMe().catch(() => null));");
    expect(pagina).toMatch(/filtroGastosDeUrl\(\s*sp as Record<string, string \| undefined>,\s*inicio,\s*porPagar\.habilitado,\s*\)/);
    expect(pagina).toMatch(/"categoria",\s*\/\/[^\n]*\n\s*"por_pagar",\s*\] as const;/);
    expect(pagina).toContain("vacioGastos(filtro, conFiltros, !!filtros.por_pagar)");
    expect(pagina).toContain('data-franja="por-pagar-ignorado"');
    expect(pagina).toContain("query={queryExcelGastos(filtros, hoy)}");
    const barra = fuente("components/admin/expenses/expenses-filter-bar.tsx");
    expect(barra).toContain("leerFiltrosGastos((k) => sp.get(k), inicio, porPagar.habilitado)");
    expect(barra).toMatch(/\{porPagar\.habilitado &&\s*selector\(\{\s*campo: "pago",/);
    expect(barra).toContain("[PARAM_POR_PAGAR]: null,");
  });

  it("las tablas pintan el chip; el diálogo se carga solo al abrirlo (sin SSR)", () => {
    expect(fuente("components/admin/expenses/expenses-table.tsx")).toContain("<BotonChipPorPagar gasto={f.gasto}");
    expect(fuente("components/admin/flights/flight-gastos-table.tsx")).toContain("<BotonChipPorPagar gasto={g}");
    const chip = fuente("components/admin/expenses/marcar-pagado.tsx");
    expect(chip).toMatch(/dynamic\(\s*\(\) => import\("\.\/marcar-pagado-dialog"\)\.then\(\(m\) => m\.MarcarPagadoDialog\),\s*\{ ssr: false \},\s*\)/);
    expect(chip).not.toContain("@/app/admin/expenses/actions");
    const dialogo = fuente("components/admin/expenses/marcar-pagado-dialog.tsx");
    // Nunca un `await` desnudo: la action va con `.catch`.
    expect(dialogo).toMatch(/await marcarPagadoGastoAction\([\s\S]*?\}\)\.catch\(/);
    expect(dialogo).toContain("if (toastMesCerradoSiAplica(r)) return;");
    expect(dialogo.split("marcarPagadoGastoAction(").length - 1).toBe(1);
  });

  it("pre-cierre: el renglón con «Resolver →» a Gastos «Por pagar» del periodo", () => {
    const card = fuente("components/admin/reportes/pre-cierre-card.tsx");
    expect(card).toContain("[CLAVE_PRECIERRE_GASTOS_POR_PAGAR]: hrefPrecierreGastosPorPagar,");
  });

  it("caja chica: el bloque SOLO con la lista aditiva del API", () => {
    const pagina = fuente("app/admin/caja-chica/[id]/page.tsx");
    expect(pagina).toContain("const porPagar = porPagarDeFondo(fondo);");
    expect(pagina).toMatch(/\{porPagar && \(\s*<PorPagarCaja/);
  });
});
