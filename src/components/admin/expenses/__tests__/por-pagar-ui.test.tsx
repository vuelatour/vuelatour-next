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
import {
  MSG_FECHA_FUTURA_CON_CARGOS,
  NOTA_QUEDARA_POR_PAGAR,
  NOTA_SIGUE_POR_PAGAR,
  chipEstadoPago,
} from "@/lib/admin/gasto-por-pagar";
import { MSG_INVENTARIO_FECHA_FUTURA, NOTA_REFACCION_POR_PAGAR_SIN_AVION } from "@/lib/admin/refaccion-inventario";

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
// El historial del vuelo monta «Editar» con el diálogo de verificar: fuera (P20).
vi.mock("@/components/admin/flights/historial-gasto-editar", () => ({ HistorialGastoEditar: () => null }));
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
const { NotaFechaPorPagar, AvisoInventarioFechaFutura } = await import("../nota-por-pagar");
const { PorPagarProvider } = await import("@/components/admin/por-pagar-provider");
const { ExpensesTable } = await import("../expenses-table");
const { FlightGastosTable } = await import("@/components/admin/flights/flight-gastos-table");
const { FlightGastosHistorialCard } = await import("@/components/admin/flights/flight-gastos-historial-card");

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

  it("P19: SOCIO y ANALISTA no lo tienen (el PATCH les responde 403); los roles del PATCH y sin rol, sí", () => {
    for (const rol of ["SOCIO", "ANALISTA"]) {
      const html = renderToStaticMarkup(
        <ExpenseActions gasto={gasto({ estado_pago: "VENCIDO" })} aircraft={[]} providers={[]} rol={rol} />,
      );
      expect(items(html), rol).not.toContain("Marcar pagado");
    }
    for (const rol of ["COORDINADOR", "FACTURACION", null]) {
      const html = renderToStaticMarkup(
        <ExpenseActions gasto={gasto({ estado_pago: "VENCIDO" })} aircraft={[]} providers={[]} rol={rol} />,
      );
      expect(items(html)[0], String(rol)).toBe("Marcar pagado");
    }
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const raiz = path.resolve(__dirname, "../../../..");
  const fuente = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

  it("los dos diálogos de captura usan la regla ÚNICA y pintan la nota", () => {
    for (const rel of ["components/admin/expenses/expense-create-dialog.tsx", "components/admin/expenses/expense-verify-dialog.tsx"]) {
      const s = fuente(rel);
      // Revisión del lote (P17/P18): la capacidad de la FECHA pasa por
      // `capacidadFechaCaptura` (con cargos o conciliado ⇒ sin capacidad).
      expect(s, rel).toContain("evaluarFechaGasto(values.fecha_gasto, capacidadFecha).pideConfirmacion");
      expect(s, rel).not.toContain("evaluarFechaGasto(values.fecha_gasto, capacidadPorPagar)");
      expect(s, rel).not.toContain("fechaGastoSospechosa(");
      expect(s, rel).toContain("const capacidadPorPagar = usePorPagar();");
      expect(s, rel).toMatch(/<NotaFechaPorPagar\s+fecha=/);
    }
    expect(fuente("components/admin/expenses/expense-verify-dialog.tsx")).toContain(
      "estadoGuardado={estadoPagoDe(gasto)}",
    );
  });

  it("P17: «Créalo por la suma» evalúa la fecha SIN capacidad y frena una fecha futura antes de la red", () => {
    const s = fuente("components/admin/expenses/expense-create-dialog.tsx");
    expect(s).toContain("const capacidadFecha = capacidadFechaCaptura(capacidadPorPagar, { conCargos });");
    expect(s).toContain("<NotaFechaPorPagar fecha={fechaGasto} conCargos={conCargos} />");
    const submit = s.slice(s.indexOf("const onSubmit = handleSubmit("), s.indexOf("const fechaIaOtroAnio"));
    // La regla es PURA (`errorFechaAlGuardarAlta`, probada por comportamiento
    // en `refaccion-inventario.test.ts`): aquí solo el cableado y el ORDEN.
    const iError = submit.indexOf("const errorFecha = errorFechaAlGuardarAlta({");
    const iToast = submit.indexOf("toast.error(errorFecha);");
    const iConfirma = submit.indexOf("evaluarFechaGasto(values.fecha_gasto, capacidadFecha)");
    expect(iError).toBeGreaterThan(-1);
    expect(submit.slice(iError, iToast)).toMatch(
      /conCargos,\s*categoria: values\.categoria,\s*destino: refDestino,\s*fecha: values\.fecha_gasto,\s*capacidad: capacidadPorPagar,/,
    );
    // El freno va ANTES de la confirmación de fecha (y de `guardarGasto`).
    expect(iToast).toBeGreaterThan(iError);
    expect(iConfirma).toBeGreaterThan(iToast);
    expect(submit.slice(iToast, iConfirma)).toMatch(/toast\.error\(errorFecha\);\s*return;/);
  });

  it("P12: la refacción «A Inventario/Tienda» con fecha futura no se guarda; el aviso va AL FINAL del bloque", () => {
    const s = fuente("components/admin/expenses/expense-create-dialog.tsx");
    expect(s).toMatch(/errorFechaAlGuardarAlta\(\{\s*conCargos,\s*categoria: values\.categoria,\s*destino: refDestino,\s*fecha: values\.fecha_gasto,\s*capacidad: capacidadPorPagar,\s*\}\)/);
    // Último hijo del fragmento del destino INVENTARIO: un hijo nuevo antes
    // correría los ids de `useId` de los campos (el golden del alta).
    expect(s).toMatch(/<AvisoInventarioFechaFutura fecha=\{fechaGasto\} \/>\s*<\/>\s*\)\}/);
  });

  it("P18: «Verificar / editar» de un conciliado evalúa la fecha sin capacidad y la nota lo sabe", () => {
    const s = fuente("components/admin/expenses/expense-verify-dialog.tsx");
    expect(s).toContain("const gastoConciliado = gasto.conciliado === true;");
    expect(s).toContain("const capacidadFecha = capacidadFechaCaptura(capacidadPorPagar, { conciliado: gastoConciliado });");
    expect(s).toMatch(/<NotaFechaPorPagar\s+fecha=\{watch\("fecha_gasto"\)\}\s+estadoGuardado=\{estadoPagoDe\(gasto\)\}\s+conciliado=\{gastoConciliado\}\s+\/>/);
  });

  /**
   * Las etiquetas de APERTURA `<Nombre …>` / `<Nombre … />` del fuente, de su
   * `<` a su `>` (llaves, comillas y comentarios contados: un `=>` o un `/>`
   * dentro de un prop no la cortan). Segunda revisión del lote (P19): la regex
   * `[\s\S]*?rol=…[\s\S]*?\/>` cruzaba el cierre del componente y casaba con
   * el `rol` de OTRO (`<FlightSeguimientoCard>`), así que quitar el prop del
   * de verdad seguía en verde.
   */
  const etiquetasJsx = (src: string, nombre: string): string[] => {
    const salida: string[] = [];
    for (const m of src.matchAll(new RegExp(`<${nombre}(?=[\\s/>])`, "g"))) {
      const inicio = m.index ?? 0;
      let i = inicio + m[0].length;
      let llaves = 0;
      let comilla: string | null = null;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (comilla) {
          if (ch === "\\") i++;
          else if (ch === comilla) comilla = null;
          continue;
        }
        if (ch === "/" && src[i + 1] === "/") {
          const fin = src.indexOf("\n", i);
          i = fin < 0 ? src.length : fin;
          continue;
        }
        if (ch === "/" && src[i + 1] === "*") {
          const fin = src.indexOf("*/", i + 2);
          i = fin < 0 ? src.length : fin + 1;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") comilla = ch;
        else if (ch === "{") llaves++;
        else if (ch === "}") llaves--;
        else if (ch === ">" && llaves === 0) break;
      }
      salida.push(src.slice(inicio, i + 1));
    }
    return salida;
  };
  /** Cada uso de `<nombre>` en el fuente lleva el prop (al menos un uso). */
  const cadaUsoLleva = (src: string, nombre: string, prop: string) => {
    const usos = etiquetasJsx(src, nombre);
    expect(usos.length, nombre).toBeGreaterThan(0);
    for (const uso of usos) expect(uso, nombre).toContain(prop);
  };

  it("el lector de etiquetas no cruza al componente siguiente (si cruzara, el P19 de abajo no probaría nada)", () => {
    const src = [
      "<A",
      "  x={1}",
      "  // un comentario con «comillas» y un /> suelto",
      "  f={() => (n > 1 ? <B rol={r} /> : null)}",
      '  t="a > b"',
      "/>",
      "<C rol={me?.rol ?? null} />",
    ].join("\n");
    const [a] = etiquetasJsx(src, "A");
    expect(a.startsWith("<A")).toBe(true);
    expect(a.endsWith('t="a > b"\n/>')).toBe(true);
    expect(a).not.toContain("<C");
    // Sin el prop en la etiqueta, falla aunque OTRA lo traiga.
    expect(etiquetasJsx(src, "C")).toEqual(["<C rol={me?.rol ?? null} />"]);
    expect(etiquetasJsx("<AB rol={1} />", "A")).toEqual([]);
  });

  it("P19: el rol llega a «Marcar pagado» del detalle del vuelo, de Gastos y de la caja chica", () => {
    cadaUsoLleva(fuente("app/admin/flights/[id]/page.tsx"), "FlightGastosCard", "rol={me?.rol ?? null}");
    cadaUsoLleva(fuente("components/admin/flights/flight-gastos-card.tsx"), "FlightGastosTable", "rol={rol}");
    const tabla = fuente("components/admin/flights/flight-gastos-table.tsx");
    expect(tabla).toContain("<BotonChipPorPagar gasto={g} className=\"ml-1.5\" puedeMarcar={puedeMarcarPagado} />");
    cadaUsoLleva(tabla, "ExpenseActions", "rol={rol}");
    expect(fuente("components/admin/expenses/expenses-table.tsx")).toContain(
      "puedeMarcar={puedeMarcarPagadoGasto(rol)}",
    );
    expect(fuente("components/admin/expenses/expense-actions.tsx")).toContain(
      "const porPagar = porPagarVigente(gasto) && puedeMarcarPagadoGasto(rol);",
    );
    cadaUsoLleva(fuente("app/admin/caja-chica/[id]/page.tsx"), "PorPagarCaja", "rol={me?.rol ?? null}");
  });

  it("P1/P2: el renglón del pre-cierre decide su destino con `resolverPrecierreGastosPorPagar` y pinta el aviso de Nómina", () => {
    const card = fuente("components/admin/reportes/pre-cierre-card.tsx");
    expect(card).toContain("resolverPrecierreGastosPorPagar(item, { desde, hasta }, baseResolver)");
    expect(card).toContain("data-precierre-por-pagar-nomina");
    const pagina = fuente("app/admin/expenses/page.tsx");
    expect(pagina).toMatch(
      /notaVista=\{\s*foco\.clave === CLAVE_PRECIERRE_GASTOS_POR_PAGAR \? NOTA_VISTA_POR_PAGAR_GASTOS : undefined\s*\}/,
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

describe("revisión del lote: la fecha de un gasto que YA está pagado (P17, P18) y la refacción a Inventario (P12)", () => {
  it("P17: con cargos del banco y fecha futura, el ERROR (nunca «Quedará POR PAGAR»)", () => {
    const html = renderToStaticMarkup(
      <PorPagarProvider capacidad={CAPACIDAD}>
        <NotaFechaPorPagar fecha="2026-10-25" conCargos />
      </PorPagarProvider>,
    );
    expect(html).toContain(`>${MSG_FECHA_FUTURA_CON_CARGOS}<`);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(NOTA_QUEDARA_POR_PAGAR);
    // Con la fecha de hoy, o sin la capacidad (API previo): nada, como antes.
    for (const [cap, fecha] of [
      [CAPACIDAD, "2026-10-19"],
      [{ habilitado: false, fechaMax: null }, "2026-10-25"],
    ] as const) {
      expect(
        renderToStaticMarkup(
          <PorPagarProvider capacidad={cap}>
            <NotaFechaPorPagar fecha={fecha} conCargos />
          </PorPagarProvider>,
        ),
      ).toBe("");
    }
  });

  it("P18: un gasto CONCILIADO con fecha futura no promete «Quedará POR PAGAR»", () => {
    expect(
      renderToStaticMarkup(
        <PorPagarProvider capacidad={CAPACIDAD}>
          <NotaFechaPorPagar fecha="2026-10-25" estadoGuardado="PAGADO" conciliado />
        </PorPagarProvider>,
      ),
    ).toBe("");
    // El mismo gasto SIN conciliar sí la lleva (la nota no se apagó para todos).
    expect(
      renderToStaticMarkup(
        <PorPagarProvider capacidad={CAPACIDAD}>
          <NotaFechaPorPagar fecha="2026-10-25" estadoGuardado="PAGADO" />
        </PorPagarProvider>,
      ),
    ).toContain(NOTA_QUEDARA_POR_PAGAR);
  });

  it("P12: el aviso de la refacción a Inventario/Tienda con fecha futura: texto EXACTO del API; con hoy o sin capacidad, nada", () => {
    const html = renderToStaticMarkup(
      <PorPagarProvider capacidad={CAPACIDAD}>
        <AvisoInventarioFechaFutura fecha="2026-11-05" />
      </PorPagarProvider>,
    );
    // El texto del API va COMPLETO en su propio renglón (no se toca)…
    expect(html).toContain(`<p>${esc(MSG_INVENTARIO_FECHA_FUTURA)}</p>`);
    expect(html).toContain('role="alert"');
    expect(html).toContain("data-error-inventario-fecha-futura");
    // …y debajo, en el suyo, la salida real sin avión (segunda revisión, NUEVO-1).
    const iSalida = html.indexOf("<p data-salida-inventario-fecha-futura=");
    expect(iSalida).toBeGreaterThan(html.indexOf(esc(MSG_INVENTARIO_FECHA_FUTURA)));
    expect(html.slice(iSalida)).toContain(`>${esc(NOTA_REFACCION_POR_PAGAR_SIN_AVION)}</p>`);
    expect(
      renderToStaticMarkup(
        <PorPagarProvider capacidad={CAPACIDAD}>
          <AvisoInventarioFechaFutura fecha="2026-10-19" />
        </PorPagarProvider>,
      ),
    ).toBe("");
    expect(renderToStaticMarkup(<AvisoInventarioFechaFutura fecha="2026-11-05" />)).toBe("");
  });
});

describe("«Marcar pagado» por rol (revisión del lote, P19)", () => {
  it("sin permiso, el chip es de SOLO LECTURA (span, sin botón ni diálogo)", () => {
    const html = renderToStaticMarkup(<BotonChipPorPagar gasto={gasto({ estado_pago: "VENCIDO" })} puedeMarcar={false} />);
    expect(html).toMatch(/^<span/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-haspopup");
    expect(html).toContain('data-estado-pago="VENCIDO"');
  });

  it("Gastos: un ANALISTA (llega por «Resolver →») ve el chip sin botón; ADMIN y sin rol, con botón", () => {
    const filas = [gasto({ id: "g-por", estado_pago: "POR_PAGAR" }), gasto({ id: "g-ven", estado_pago: "VENCIDO" })];
    const analista = renderToStaticMarkup(
      <ExpensesTable gastos={filas} aircraft={[]} providers={[]} fotoUrls={{}} rol="ANALISTA" />,
    );
    expect(analista.match(/<span[^>]*data-estado-pago="/g)).toHaveLength(2);
    expect(analista).not.toMatch(/<button[^>]*data-estado-pago="/);
    for (const rol of ["ADMIN", undefined]) {
      const html = renderToStaticMarkup(<ExpensesTable gastos={filas} aircraft={[]} providers={[]} fotoUrls={{}} rol={rol} />);
      expect(html.match(/<button[^>]*data-estado-pago="/g), String(rol)).toHaveLength(2);
    }
  });

  it("Gastos del vuelo: un SOCIO ve el chip sin botón (el detalle del vuelo lo ve cualquier rol)", () => {
    const filas = [gasto({ id: "g-por", estado_pago: "POR_PAGAR" })];
    const socio = renderToStaticMarkup(<FlightGastosTable gastos={filas} fotoUrls={{}} aircraft={[]} providers={[]} rol="SOCIO" />);
    expect(socio).toMatch(/<span[^>]*data-estado-pago="POR_PAGAR"/);
    expect(socio).not.toMatch(/<button[^>]*data-estado-pago="/);
    const admin = renderToStaticMarkup(<FlightGastosTable gastos={filas} fotoUrls={{}} aircraft={[]} providers={[]} rol="ADMIN" />);
    expect(admin).toMatch(/<button[^>]*data-estado-pago="POR_PAGAR"/);
  });
});

describe("«Historial de gastos» del vuelo: `por_pagar` en es-MX (revisión del lote, P20)", () => {
  it("«Pago: Por pagar → Pagado» al marcarlo pagado, y al revés al re-programarlo; jamás true/false", () => {
    const evento = (antes: boolean, despues: boolean) => ({
      gasto_id: G,
      accion: "UPDATE" as const,
      actor_nombre: "Pablo",
      created_at: "2026-10-22T19:05:00Z",
      diff: { por_pagar: { antes, despues } },
      descripcion_gasto: "Taxi / estacionamiento · $500 MXN",
    });
    const pagado = renderToStaticMarkup(<FlightGastosHistorialCard eventos={[evento(true, false)]} />);
    expect(pagado).toMatch(
      /Pago:<\/span> <span class="line-through text-muted-foreground">Por pagar<\/span> → <span class="font-medium">Pagado<\/span>/,
    );
    expect(pagado).not.toMatch(/>(true|false)</);
    const reprogramado = renderToStaticMarkup(<FlightGastosHistorialCard eventos={[evento(false, true)]} />);
    expect(reprogramado).toMatch(
      /Pago:<\/span> <span class="line-through text-muted-foreground">Pagado<\/span> → <span class="font-medium">Por pagar<\/span>/,
    );
  });
});
