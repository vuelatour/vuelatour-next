/**
 * Caja chica MADRE en el panel (15-oct-2026). Pedidos del cliente sobre la
 * caja de Mary Cruz: «que diga a quien le repuso en el movimiento», «que
 * pueda seleccionar a quien le va a reponer el fondo» y «un filtro de fecha
 * de desde hasta». Sin DOM (`renderToStaticMarkup` con los primitivos del
 * diálogo pasados de largo) + regex sobre los fuentes para el cableado:
 *  1. el renglón del espejo con y sin `repuesto_a` (API previo ⇒ referencia;
 *     sin nada ⇒ lo de hoy) y la búsqueda rápida por el nombre;
 *  2. el diálogo de una caja madre ofrece «Reponer a una caja que fondea»;
 *     sin cajas (undefined, null, []) o en corrección queda IDÉNTICO;
 *  3. el prellenado y la confirmación ANTES de llamar a la server action, que
 *     es la de SIEMPRE con el fondo HIJO, y el Excel de lo repuesto;
 *  4. el filtro Desde/Hasta: borrador compartido con Gastos, URL, «Limpiar»,
 *     página que filtra FILAS y deja tarjetas y saldo del libro completo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CajaFondeada, CajaMovimiento } from "@/types/caja-chica";
import type { MovimientoFondoRow } from "../fondo-historial-table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/caja-chica/x",
  useSearchParams: () => new URLSearchParams("desde=2026-10-01&hasta=2026-10-15"),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/expenses/actions", () => ({
  marcarFacturacionAction: async () => ({ ok: true }),
}));
vi.mock("@/app/admin/caja-chica/actions", () => ({
  createCajaMovimientoAction: vi.fn(),
  updateCajaMovimientoAction: vi.fn(),
}));
vi.mock("@/lib/descargar-archivo", () => ({ descargarArchivoDelPanel: () => {} }));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("../movimiento-actions", () => ({
  MovimientoActions: () => <span data-menu="1">⋯</span>,
}));
vi.mock("@/components/ui/dialog", () => {
  const Pasa = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
    DialogContent: Pasa,
    DialogHeader: Pasa,
    DialogFooter: Pasa,
    DialogTitle: Pasa,
    DialogDescription: Pasa,
  };
});

const { FondoHistorialTable } = await import("../fondo-historial-table");
const { MovimientoDialog } = await import("../movimiento-dialog");
const { HistorialPeriodoFiltro } = await import("../historial-periodo-filtro");
const madre = await import("@/lib/admin/caja-chica-madre");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const GREGORIO = "9a6b0c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d";
const JIMMY = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const NOTA_ESPEJO = "Espejo automático de la reposición en la caja vinculada.";

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    id: "m",
    fondo_id: "f",
    tipo: "REINTEGRO",
    monto: 5000,
    moneda: "MXN",
    fecha: "2026-10-15",
    autorizado_por: null,
    referencia: "Fondeo a Gregorio Jurado",
    notas: NOTA_ESPEJO,
    registrado_por: "u",
    created_at: "2026-10-15T12:00:00-05:00",
    espejo_de_id: "rep-greg",
    ...p,
  };
}

function filaEspejo(repuestoA: MovimientoFondoRow["repuestoA"]): MovimientoFondoRow {
  return {
    key: "caja-espejo",
    fechaFmt: "15 oct 2026",
    tipoLabel: "Reintegro a dirección",
    esGasto: false,
    descripcion: NOTA_ESPEJO,
    negativo: true,
    montoAbsFmt: "$5,000.00",
    saldoFmt: "$12,000.00",
    vueloId: null,
    vueloFolio: null,
    gasto: null,
    movimiento: mov({}),
    repuestoA,
  };
}

const tabla = (filas: MovimientoFondoRow[]) =>
  renderToStaticMarkup(
    <FondoHistorialTable
      movimientos={filas}
      aircraft={[]}
      providers={[]}
      fondoId="f"
      persona="Mary Cruz"
      moneda="MXN"
      usuarios={[]}
    />,
  );

describe("historial · el espejo dice a quién se repuso", () => {
  it("con repuesto_a: «Reposición a la caja de» + enlace a su caja; el tipo queda secundario y la nota tenue", () => {
    const fila = filaEspejo(
      madre.repuestoADeEntrada(
        { origen: "caja", repuesto_a: { fondo_id: GREGORIO, usuario_id: "u", nombre: "Gregorio Jurado" } },
        mov({}),
      ),
    );
    const html = tabla([fila]);
    expect(html).toContain("Reposición a la caja de");
    expect(html).toMatch(
      new RegExp(
        `<a class="cursor-pointer[^"]*" title="${esc(madre.tituloEnlaceCaja("Gregorio Jurado"))}" href="/admin/caja-chica/${GREGORIO}">Gregorio Jurado</a>`,
      ),
    );
    // «Reintegro a dirección» como badge (tipo secundario) y la nota tenue.
    expect(html).toMatch(/<span[^>]*data-slot="badge"[^>]*>Reintegro a dirección<\/span>/);
    expect(html).toMatch(new RegExp(`opacity-80">${esc(NOTA_ESPEJO)}</span>`));
    // Sigue siendo espejo: no se corrige desde aquí.
    expect(html).toContain(">espejo</span>");
  });

  it("API previo (sin repuesto_a): el nombre de la referencia «Fondeo a X», sin enlace", () => {
    const fila = filaEspejo(madre.repuestoADeEntrada({ origen: "caja" }, mov({})));
    const html = tabla([fila]);
    expect(html).toContain('Reposición a la caja de <span class="font-medium">Gregorio Jurado</span>');
    expect(html).not.toContain("/admin/caja-chica/");
  });

  it("sin nada que diga a quién: el renglón de hoy, idéntico", () => {
    const sinNada = filaEspejo(madre.repuestoADeEntrada({ origen: "caja" }, mov({ referencia: null })));
    const hoy = filaEspejo(undefined);
    expect(sinNada.repuestoA).toBeNull();
    expect(tabla([sinNada])).toBe(tabla([hoy]));
    expect(tabla([hoy])).toContain(">Reintegro a dirección<");
    expect(tabla([hoy])).not.toContain("Reposición a la caja de");
  });

  it("la búsqueda rápida encuentra por el nombre (searchText con «Reposición a la caja de X»)", () => {
    const src = leer("../fondo-historial-table.tsx");
    expect(src).toMatch(/m\.repuestoA \? textoRepuestoA\(m\.repuestoA\.nombre\) : ""/);
  });
});

const CAJAS: CajaFondeada[] = [
  {
    fondo_id: GREGORIO,
    usuario_id: "u-greg",
    nombre: "Gregorio Jurado",
    moneda: "MXN",
    activo: true,
    por_reponer: 5000,
    ultima_reposicion: { fecha: "2026-10-01", monto: 3000 },
  },
  {
    fondo_id: JIMMY,
    usuario_id: "u-jimmy",
    nombre: "Jimmy Chi",
    moneda: "MXN",
    activo: true,
    por_reponer: 0,
    ultima_reposicion: null,
  },
];

const dialogo = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <MovimientoDialog
      open
      onOpenChange={() => {}}
      fondoId="f-mary"
      persona="Mary Cruz"
      moneda="MXN"
      usuarios={[]}
      {...extra}
    />,
  );

describe("«Registrar movimiento» de una caja MADRE", () => {
  it("sin cajas (API previo, lectura caída, no fondea) el diálogo queda IDÉNTICO", () => {
    const hoy = dialogo();
    expect(dialogo({ cajasFondeadas: null })).toBe(hoy);
    expect(dialogo({ cajasFondeadas: [] })).toBe(hoy);
    expect(hoy).not.toContain(madre.OPCION_OTRA_CAJA);
    expect(hoy).toContain("Movimiento de caja chica");
    expect(hoy).toContain(">Registrar</button>");
    expect(hoy).toContain("Monto (MXN)");
  });

  it("corregir un movimiento tampoco ofrece reponer a otra caja", () => {
    const m = mov({ tipo: "REPOSICION", espejo_de_id: null, referencia: null, notas: null });
    expect(dialogo({ movimiento: m, cajasFondeadas: CAJAS })).toBe(dialogo({ movimiento: m }));
  });

  it("con cajas: «Movimiento de esta caja» / «Reponer a una caja que fondea (2)», con cursor-pointer; arranca como siempre", () => {
    const html = dialogo({ cajasFondeadas: CAJAS });
    for (const t of [madre.OPCION_ESTA_CAJA, `${madre.OPCION_OTRA_CAJA} (2)`]) {
      const i = html.indexOf(`>${t}</button>`);
      expect(i, t).toBeGreaterThan(-1);
      const boton = html.slice(html.lastIndexOf("<button", i), i);
      expect(boton).toContain("cursor-pointer");
    }
    expect(html).toContain(`title="${esc(madre.TITULO_OPCION_OTRA_CAJA)}"`);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-modo="esta"/);
    // El formulario de siempre sigue debajo (tipo, monto en la moneda de la madre, Registrar).
    expect(html).toContain("Monto (MXN)");
    expect(html).toContain(">Registrar</button>");
  });

  it("cableado: elegir caja prellena lo por reponer (editable) y la fecha de hoy Cancún", () => {
    const src = leer("../movimiento-dialog.tsx");
    expect(src).toMatch(/const v = valoresReponerA\(c, todayCancun\(\)\);/);
    for (const k of ['setValue("tipo", v.tipo);', 'setValue("monto", v.monto);', 'setValue("moneda", v.moneda);', 'setValue("fecha", v.fecha);']) {
      expect(src, k).toContain(k);
    }
    expect(src).toContain("options={hijas.map(opcionCajaFondeada)}");
    expect(src).toContain("label={ETIQUETA_REPONER_A}");
    expect(src).toContain("hint={hija ? pistaMontoReponerA(hija) : undefined}");
  });

  it("cableado: confirmación ANTES de llamar a la server action; la de SIEMPRE con el fondo HIJO", () => {
    const src = leer("../movimiento-dialog.tsx");
    const registrar = src.slice(src.indexOf("const registrar = ("), src.indexOf("const onSubmit ="));
    const iConfirmar = registrar.indexOf('if (pasoAlRegistrar({ hija, confirmado }) === "confirmar") {');
    const iLlamada = registrar.indexOf("createCajaMovimientoAction(");
    expect(iConfirmar).toBeGreaterThan(-1);
    expect(iConfirmar).toBeLessThan(iLlamada);
    expect(registrar).toMatch(/=== "confirmar"\) \{\s*setPorConfirmar\(values\);\s*return;\s*\}/);
    // El «Revisar y registrar» del formulario NUNCA confirma solo.
    expect(src).toContain("const onSubmit = handleSubmit((values) => registrar(values, false));");
    // Solo el botón de la confirmación registra.
    expect(src).toMatch(/onClick=\{\(\) => registrar\(confirmacion, true\)\}/);
    expect(src.split("registrar(confirmacion, true)").length - 1).toBe(1);
    // La ruta de siempre en la HIJA, en su moneda, recargando también la madre.
    expect(registrar).toMatch(
      /createCajaMovimientoAction\(\s*hija\.fondo_id,\s*\{ \.\.\.values, tipo: "REPOSICION", moneda: hija\.moneda \},\s*\{ fondoMadreId: fondoId \},\s*\)/,
    );
    // El Excel de lo repuesto con el MISMO aviso, a nombre de la caja hija.
    expect(registrar).toMatch(/avisarReposicionYDescargar\(\s*nuevaReposicion\.id,\s*hija \? nombreCajaFondeada\(hija\) : persona,/);
    // Una reposición de 0 no llega a confirmarse.
    expect(registrar.indexOf("setError(\"monto\"")).toBeLessThan(iConfirmar);
  });

  it("la confirmación dice monto, caja hija y caja madre", () => {
    const src = leer("../movimiento-dialog.tsx");
    expect(src).toMatch(/textoConfirmarReposicionHija\(\{\s*monto: confirmacion\.monto,\s*hija,\s*madre: persona,\s*\}\)/);
    expect(src).toContain(": BOTON_CONFIRMAR_REPOSICION_HIJA}");
    expect(src).toContain("{BOTON_VOLVER}");
  });

  it("la server action recarga también la caja madre (uuid validado)", () => {
    const act = leer("../../../../app/admin/caja-chica/actions.ts");
    expect(act).toContain("opciones?: { fondoMadreId?: string },");
    expect(act).toMatch(
      /if \(madre && madre !== fondoId && esUuid\(madre\)\) revalidatePath\(`\/admin\/caja-chica\/\$\{madre\}`\);/,
    );
  });
});

describe("filtro Desde/Hasta del historial", () => {
  it("pinta los dos días de la URL con cursor-pointer, la marca de activo y «Limpiar»", () => {
    const html = renderToStaticMarkup(<HistorialPeriodoFiltro />);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*value="2026-10-01"/);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*value="2026-10-15"/);
    for (const i of html.match(/<input[^>]*>/g) ?? []) expect(i).toContain("cursor-pointer");
    expect(html).toContain(`title="${esc(madre.TITULO_FECHA_HISTORIAL)}"`);
    const i = html.indexOf(`${madre.TEXTO_LIMPIAR_PERIODO}</button>`);
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf("<button", i), i)).toContain("cursor-pointer");
  });

  it("cableado: el MISMO borrador de Gastos/Cotizaciones, URL validada, página 1 y sin brincar", () => {
    const src = leer("../historial-periodo-filtro.tsx");
    expect(src).toContain('import { useRangoBorrador, type CambiosUrl } from "@/hooks/use-rango-borrador";');
    expect(src).toContain('rangoHistorialCaja(sp.get("desde"), sp.get("hasta"))');
    expect(src).toContain("consultaBaseParaNavegar(sp.toString(), pendiente.current)");
    expect(src).toContain("pendiente.current = pendienteVigente(sp.toString(), pendiente.current);");
    expect(src).toContain('params.delete("tp");');
    expect(src).toContain("{ scroll: false }");
    expect(src).toContain("navegar({ desde: null, hasta: null });");
    // Gastos usa el MISMO hook (no hay dos copias del borrador).
    const gastos = leer("../../expenses/expenses-filter-bar.tsx");
    expect(gastos).toContain('import { useRangoBorrador, type CambiosUrl } from "@/hooks/use-rango-borrador";');
    expect(gastos).not.toContain("function useRangoBorrador(");
  });

  it("cableado de la página: filas filtradas sobre el libro completo; tarjetas y Excel intactos", () => {
    const page = leer("../../../../app/admin/caja-chica/[id]/page.tsx");
    expect(page).toContain("const rango = rangoHistorialCaja(sp.desde, sp.hasta);");
    expect(page).toContain("const entradas = filtrarHistorialPorRango(fondo.historial, rango);");
    expect(page).toContain("const historial: MovimientoFondoRow[] = entradas.map((e) => {");
    expect(page).toContain("textoPeriodoHistorial(rango, entradas.length, fondo.historial.length)");
    // Las tarjetas leen el fondo COMPLETO (la cifra del Excel).
    expect(page).toContain("const porReponer = porReponerDeFondo(fondo);");
    expect(page).toContain("{TEXTO_SIN_MOVIMIENTOS_PERIODO}");
    expect(page).toContain("conRango && historial.length === 0 ?");
    // Espejo y caja madre.
    expect(page).toContain("repuestoA: repuestoADeEntrada(e, movimiento),");
    expect(page).toContain("const cajasFondeadas = cajasParaReponer(fondo);");
    expect(page).toContain("cajasFondeadas={cajasFondeadas}");
  });
});
