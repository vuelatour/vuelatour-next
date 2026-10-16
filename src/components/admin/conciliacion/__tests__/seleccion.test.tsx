/**
 * Selección de movimientos en Conciliación (14-oct-2026, API 0.0.77):
 *  1. SIN `seleccion` —o con un API ≤ 0.0.76, sin la llave `omision`— la
 *     tabla sale BYTE A BYTE igual que antes (golden congelado ANTES del
 *     cambio con las mismas filas: `seleccion.golden.html`) y sin casillas;
 *  2. con `seleccion`: casilla NATIVA solo en las filas seleccionables, con
 *     `cursor-pointer` y `aria-label` único; «Seleccionar los N…» arriba;
 *  3. la fila OMITIDA: badge gris «Omitido», el motivo y el tooltip;
 *  4. la barra: región con nombre (el conteo YA NO es región viva: la región
 *     `aria-live` es PERMANENTE en la tabla), ningún botón con `disabled` por
 *     una regla de negocio (el motivo se ve);
 *  5. cableado por regex: `rowClassName` literal, la rama «Omitido» antes de
 *     la de clasificación, `alCambiarFiltradas` solo con la selección y
 *     DataTable sin tocar;
 *  6. revisión del 15-oct-2026: la poda CONSOLIDADA (ajuste guardado en el
 *     render), «Seleccionar los N…» que SUMA y se queda montado
 *     (`aria-disabled`), el foco a un lugar estable, la barra ANTES de la
 *     tabla en el DOM con su alto MEDIDO (hueco y `scroll-padding-bottom`), la
 *     celda marcada teñida DEBAJO de la marca de la fila activa, la moneda por
 *     cuenta en todas las pestañas y el cableado de la casilla en el hook de
 *     filas activas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ALIAS_CUENTAS,
  ID_ABONO,
  ID_CLASIF,
  ID_IVA,
  ID_LIGADO,
  ID_OMITIDO,
  ID_SPEI,
  MONEDA_CUENTAS,
  cargoOmitido,
  cargoUsd,
  filasConOmision,
  filasSinOmision,
} from "./seleccion.fixtures";
import { resumenSeleccion, TOPE_SELECCION } from "@/lib/admin/conciliacion-seleccion";
import type { MovimientoBancario } from "@/types/conciliacion";

vi.mock("@/lib/api/ingresos-browser", () => ({
  registrarIngreso: async () => ({ ok: false, error: "no" }),
  editarIngreso: async () => ({ ok: false, error: "no" }),
  motivoComprobanteIngresoInvalido: () => null,
}));
vi.mock("@/lib/api/browser", () => ({ apiBrowser: async () => ({ data: [] }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/conciliacion",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }),
}));
// El mock de SIEMPRE (sin las acciones nuevas): solo se usan al hacer clic y
// viven en diálogos dinámicos, así que la tabla se pinta igual.
vi.mock("@/app/admin/conciliacion/actions", () => ({
  candidatosCobroAction: vi.fn(),
  clasificarMovimientoAction: vi.fn(),
  crearClasificacionAction: vi.fn(),
  linkMovimientoAction: vi.fn(),
  linkMovimientoCobroAction: vi.fn(),
  listClasificacionesAction: vi.fn(),
  quitarReversoAction: vi.fn(),
}));
vi.mock("@/app/admin/ingresos/actions", () => ({
  clasificarAbonoAction: vi.fn(),
  ligarAbonoIngresoAction: vi.fn(),
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

const { MovimientosTable } = await import("../movimientos-table");
const { BarraSeleccionMovimientos } = await import("../barra-seleccion-movimientos");

const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const GOLDEN = leer("./seleccion.golden.html");

const tabla = (rows: MovimientoBancario[], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<MovimientosTable movimientos={rows} gastos={[]} cuentas={ALIAS_CUENTAS} {...props} />);
const lista = { vista: "lista" as const, monedaPorCuenta: MONEDA_CUENTAS };
const omitidos = { vista: "omitidos" as const, monedaPorCuenta: MONEDA_CUENTAS };
const fila = (html: string, id: string) => {
  const i = html.indexOf(`data-fila="${id}"`);
  if (i < 0) return "";
  const ini = html.lastIndexOf("<tr", i);
  return html.slice(ini, html.indexOf("</tr>", i) + 5);
};
const casillas = (html: string) => html.match(/<input type="checkbox"[^>]*>/g) ?? [];
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("sin selección: el marcado de SIEMPRE (golden del 14-oct, antes del cambio)", () => {
  it("sin la prop, con `seleccion={null}` y en «Conciliados» (sin prop) es IDÉNTICO al golden", () => {
    expect(tabla(filasSinOmision())).toBe(GOLDEN);
    expect(tabla(filasSinOmision(), { seleccion: null })).toBe(GOLDEN);
    expect(GOLDEN).not.toContain('type="checkbox"');
  });

  it("«Conciliados» con la moneda por cuenta propia (15-oct, para el ⋯ de una omitida): el MISMO HTML", () => {
    expect(tabla(filasSinOmision(), { seleccion: null, monedaPorCuenta: MONEDA_CUENTAS })).toBe(GOLDEN);
    expect(tabla(filasConOmision(), { monedaPorCuenta: MONEDA_CUENTAS })).toBe(GOLDEN);
  });

  it("API ≤ 0.0.76 (las filas no traen la llave `omision`): aun con `seleccion`, idéntico y sin casillas", () => {
    expect(tabla(filasSinOmision(), { seleccion: lista })).toBe(GOLDEN);
    expect(tabla(filasSinOmision(), { seleccion: omitidos })).toBe(GOLDEN);
  });

  it("con el API 0.0.77 (`omision: null` en cada fila) y sin la prop, el MISMO HTML", () => {
    expect(tabla(filasConOmision())).toBe(GOLDEN);
  });
});

describe("con selección (pestañas «Todos»/«Pendientes»)", () => {
  const html = tabla([...filasConOmision(), cargoOmitido()], { seleccion: lista });

  it("casilla NATIVA solo en los pendientes libres (cargos y abonos), nunca en conciliados u omitidos", () => {
    expect(casillas(html)).toHaveLength(3);
    for (const id of [ID_IVA, ID_SPEI, ID_ABONO]) expect(fila(html, id)).toContain('type="checkbox"');
    for (const id of [ID_CLASIF, ID_LIGADO, ID_OMITIDO]) expect(fila(html, id)).not.toContain('type="checkbox"');
  });

  it("cada casilla con cursor-pointer, accent de la casa y un aria-label ÚNICO que dice qué es", () => {
    const etiquetas = casillas(html).map((c) => c.match(/aria-label="([^"]*)"/)?.[1] ?? "");
    expect(new Set(etiquetas).size).toBe(3);
    for (const c of casillas(html)) {
      expect(c).toContain("cursor-pointer");
      expect(c).toContain("accent-brand-600");
    }
    expect(etiquetas).toContain(esc("Seleccionar el cargo de $1.12 MXN del 24 sep 2026 · IVA - COMISIONES (GASTOS GNRAL)"));
    expect(etiquetas).toContain(
      esc("Seleccionar el abono de $825.13 MXN del 23 sep 2026 · CARGO INDEBIDO 21 SEP 35552 (GASTOS GNRAL)"),
    );
  });

  it("encabezado de la columna sin casilla (texto solo para el lector de pantalla)", () => {
    expect(html).toContain('<span class="sr-only">Seleccionar</span>');
  });

  it("el botón explícito «Seleccionar los N…» ARRIBA de la tabla, con cursor-pointer", () => {
    const i = html.indexOf("Seleccionar los 3 pendientes de la lista");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('data-slot="table-container"'));
    const boton = html.slice(html.lastIndexOf("<button", i), i);
    expect(boton).toContain("cursor-pointer");
    // Con algo por marcar no está «ya seleccionados» (aria-disabled).
    expect(boton).not.toContain('aria-disabled="true"');
    // Sin nada marcado no hay barra ni «Quitar selección» ni el hueco.
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain("Quitar selección");
    expect(html).not.toContain("data-hueco-barra-seleccion");
  });

  it("la barra de herramientas es un GRUPO siempre montado (lugar estable del foco) con la región VIVA permanente", () => {
    const i = html.indexOf('role="group" aria-label="Selección de movimientos" tabindex="-1"');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(html.indexOf('data-slot="table-container"'));
    // La región viva nace con la tabla (vacía de selección): así SÍ se anuncia la primera.
    expect(html).toContain('<p aria-live="polite" aria-atomic="true" class="sr-only">Ningún movimiento seleccionado.</p>');
    expect(html.indexOf('aria-live="polite"')).toBeGreaterThan(i);
    // Una sola región viva (la barra ya no lo es).
    expect(html.split("aria-live=").length - 1).toBe(1);
  });

  it("la celda de la casilla se tiñe con su FONDO (debajo de la marca de la fila activa), sin capa encima", () => {
    const celda = html.match(/<td[^>]*><input type="checkbox"/)?.[0] ?? "";
    expect(celda).toContain("has-checked:bg-brand-50");
    expect(celda).toContain("dark:has-checked:bg-brand-900/30");
    expect(html).not.toContain("pointer-events-none absolute inset-0");
  });

  it("la fila OMITIDA: badge gris «Omitido», su motivo y el tooltip con quién y cuándo", () => {
    const f = fila(html, ID_OMITIDO);
    expect(f).toContain(">Omitido</span>");
    expect(f).toContain("Comisión o IVA del banco");
    expect(f).toContain('title="Omitido por Alejandro Canales el 14-oct-2026: Comisión o IVA del banco"');
    // No se pinta como una clasificación cualquiera.
    expect(f).not.toContain("Omitido de la conciliación</span>");
  });
});

describe("pestaña «Omitidos»", () => {
  const html = tabla([cargoOmitido()], { seleccion: omitidos });

  it("la casilla en la fila omitida dice «cargo omitido» y el botón cuenta omitidos", () => {
    expect(casillas(html)).toHaveLength(1);
    expect(casillas(html)[0]).toContain(
      esc("Seleccionar el cargo omitido de $1.12 MXN del 24 sep 2026 · IVA - COMISIONES (GASTOS GNRAL)"),
    );
    expect(html).toContain("Seleccionar el omitido de la lista");
  });
});

describe("la barra «Movimientos seleccionados»", () => {
  const movs = [...filasConOmision().slice(0, 3), cargoUsd()];
  const barra = (vista: "lista" | "omitidos", r = resumenSeleccion(movs, MONEDA_CUENTAS)) =>
    renderToStaticMarkup(
      <BarraSeleccionMovimientos vista={vista} resumen={r} retirados={0} onOmitir={() => {}} onDeshacer={() => {}} onLimpiar={() => {}} />,
    );

  it("región con nombre y los totales por tipo y moneda (MXN primero); el conteo YA NO es región viva", () => {
    const html = barra("lista");
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Movimientos seleccionados"');
    expect(html).toMatch(/<p class="text-sm font-medium">4 seleccionados · 2 cargos \$8\.12 MXN · 1 abono \$825\.13 MXN · 1 cargo \$17\.00 USD<\/p>/);
    expect(html).not.toContain("aria-live");
    expect(html).toContain("fixed bottom-6 left-1/2 z-40");
    expect(html).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("vista lista sin `onVincular`: «Omitir…» y «Limpiar» (con él, ver vincular-cargos.test.tsx); ningún botón apagado", () => {
    const html = barra("lista");
    expect(html).toContain("Omitir…");
    expect(html).toContain("Limpiar");
    expect(html).not.toContain("Vincular a un gasto…");
    expect(html).not.toContain("Deshacer la omisión…");
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toContain("cursor-pointer");
  });

  it("vista omitidos: «Deshacer la omisión…» y «Limpiar»", () => {
    const html = barra("omitidos");
    expect(html).toContain("Deshacer la omisión…");
    expect(html).not.toContain("Omitir…");
  });

  it("más de 200: el motivo se VE y el botón sigue activo (el clic lo repite)", () => {
    const r = { ...resumenSeleccion(movs, MONEDA_CUENTAS), n: TOPE_SELECCION + 1 };
    const html = barra("lista", r);
    expect(html).toContain("Se pueden seleccionar hasta 200 movimientos por lote.");
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
  });

  it("lo que dejó de calificar se dice en gris", () => {
    const html = renderToStaticMarkup(
      <BarraSeleccionMovimientos
        vista="lista"
        resumen={resumenSeleccion(movs.slice(0, 1), MONEDA_CUENTAS)}
        retirados={2}
        onOmitir={() => {}}
        onDeshacer={() => {}}
        onLimpiar={() => {}}
      />,
    );
    expect(html).toContain("2 movimientos ya no están pendientes: se quitaron de la selección.");
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const src = leer("../movimientos-table.tsx");

  it("la línea `rowClassName` sigue LITERAL y el orden de MovimientoActions no cambia", () => {
    expect(src).toContain("rowClassName={(m) => ((resaltar && m.id === resaltar) || resaltadosSet.has(m.id.toLowerCase()) ? CLASE_FILA_ENFOCADA : undefined)}");
    expect(src).toMatch(/<MovimientoActions\s+movimiento=\{m\}\s+gastos=\{gastos\}\s+abonos=\{abonos\}/);
    // La selección se marca en la CELDA, nunca con data-state/aria-selected.
    expect(src).not.toContain('data-state="selected"');
    expect(src).not.toContain("aria-selected");
  });

  it("la rama «Omitido» va ANTES de la de clasificación", () => {
    const iOmitido = src.indexOf(") : m.conciliado && esOmitido(m) ? (");
    const iClasif = src.indexOf(") : m.conciliado && m.clasificacion_id ? (");
    expect(iOmitido).toBeGreaterThan(-1);
    expect(iOmitido).toBeLessThan(iClasif);
  });

  it("`alCambiarFiltradas` SOLO con la selección; la búsqueda encuentra «omitido» y el motivo", () => {
    expect(src).toContain("alCambiarFiltradas={conSeleccion ? setFiltradas : undefined}");
    expect(src).toMatch(/searchText=\{[\s\S]*textoBusquedaOmision\(m\)/);
    // Sin selección se devuelve la tabla tal cual (sin envoltura que cambie el árbol).
    expect(src).toContain("if (!conSeleccion || !vista) return tabla;");
  });

  it("la barra NO decide (lee los helpers) y ningún botón lleva `disabled`", () => {
    const b = leer("../barra-seleccion-movimientos.tsx");
    expect(b).toContain("accionesDeSeleccion(p.resumen, p.vista)");
    expect(b).toContain("toast.info(accion.motivo)");
    expect(b).not.toMatch(/disabled=/);
  });

  it("la página: «Omitidos (N)» del API con su degradación, tarjetas, Excel y la tabla con key + seleccion", () => {
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    // La línea que congela enfoque.test.tsx no cambia: «Omitidos» no participa del `?mov=`.
    expect(page).toContain('const pestanaDeLista = filtro === "todos" || filtro === "pendientes" || filtro === "conciliados";');
    expect(page).toContain('if (filtro === "omitidos") query.solo_omitidos = true;');
    const iConc = page.indexOf('{ key: "conciliados", label: "Conciliados" },');
    const iOmit = page.indexOf('{ key: "omitidos", label: textoPestanaOmitidos(conteoOmitidos) },');
    expect(iConc).toBeGreaterThan(-1);
    expect(iOmit).toBeGreaterThan(iConc);
    expect(page).toContain("conteoOmitidosDeResumen(resumen, pwCuenta || null)");
    // El resumen caído es null (no `[]`): el conteo no inventa un 0.
    expect(page).toContain('degradado.opcional("el resumen por cuenta", conciliacionResumen(desdeVista, hastaVista), null)');
    // La lista de omitidos: 400 de la llave ⇒ «no activa»; otra falla ⇒ «no se pudo»; jamás el vacío.
    expect(page).toContain("fallaOmitidos: fallaListaOmitidos(err)");
    expect(page.indexOf(") : fallaOmitidos ? (")).toBeLessThan(page.indexOf(") : movs.length === 0 ? ("));
    expect(page).toContain("{TEXTO_OMITIDOS_NO_DISPONIBLE}");
    expect(page).toContain("<AvisoListaSinBancoNoCargo texto={TEXTO_OMITIDOS_NO_CARGO} />");
    // Tarjetas «· incluye N omitidos» con el enlace a la pestaña de esa cuenta.
    expect(page).toContain("const omitidos = partesTarjetaOmitidos(c.omitidos);");
    expect(page).toMatch(/<Link\s+href=\{hrefVista\("omitidos", c\.cuenta_bancaria_id\)\}\s+className="cursor-pointer/);
    // Excel desde «Omitidos» = «Conciliados».
    expect(page).toContain("filtroActivo={filtroReporteDeVista(filtro)}");
    // La tabla: se reinicia por vista y lleva la selección solo donde aplica.
    expect(page).toContain("const claveVista = `${filtro}|${pwCuenta}|${desdeVista ?? \"\"}|${hastaVista ?? \"\"}`;");
    expect(page).toMatch(/<MovimientosTable\s+key=\{claveVista\}/);
    expect(page).toContain("seleccion={vistaSeleccion ? { vista: vistaSeleccion, monedaPorCuenta } : null}");
  });

  it("DataTable no se toca", () => {
    const dt = leer("../../data-table.tsx");
    expect(dt).not.toMatch(/seleccion|omitid/i);
  });

  it("la PODA se consolida en el estado (ajuste guardado en el render, sin efectos) y lo dice", () => {
    expect(src).toContain("podaSeleccion(movimientos, sel, vista)");
    expect(src).toMatch(/if \(poda\.sel !== sel\) \{\s*setSel\(poda\.sel\);\s*setRetirados\(\(n\) => n \+ poda\.retirados\);\s*\}/);
    // El aviso de lo retirado vive hasta la siguiente acción del operador.
    expect(src.match(/setRetirados\(0\);/g)?.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toContain("seleccionVigente(");
  });

  it("«Seleccionar los N…» SUMA a lo vigente y, con todas marcadas, se queda montado con aria-disabled", () => {
    expect(src).toContain("const todas = estadoSeleccionarTodas(filasVista, idsVigentes, vista);");
    expect(src).toContain("const r = seleccionarTodas(filasVista, idsVigentes, vista);");
    expect(src).toContain("aria-disabled={todas.completo || undefined}");
    expect(src).toMatch(/\{todas\.n > 0 && \(\s*<button\s+ref=\{botonTodasRef\}/);
    expect(src).toContain("textoTodasSeleccionadas({ n: todas.n, conBusqueda, vista })");
    expect(src).toContain("textoSeleccionarTodas({ n: todas.n, tope: todas.cupo, conBusqueda, vista })");
  });

  it("el FOCO: tras vaciar o tras un éxito va a un lugar estable; los diálogos de la barra no lo devuelven solos", () => {
    // «Quitar selección» y «Limpiar» piden el foco para «Seleccionar los N…» (o el grupo).
    expect(src).toMatch(/const vaciarSeleccion = \(\) => \{\s*focoPendienteRef\.current = \{ preferido: null, estable: false \};/);
    expect(src).toContain("onClick={vaciarSeleccion}");
    expect(src).toContain("onLimpiar={vaciarSeleccion}");
    // Éxito ⇒ el grupo (estable ante el refresh); cancelar ⇒ el botón que lo abrió.
    expect(src).toMatch(/focoPendienteRef\.current = exitoRef\.current\s*\?\s*\{ preferido: null, estable: true \}\s*:\s*\{ preferido: disparadorRef\.current, estable: false \};/);
    for (const d of ["onOmitidos={trasExito}", "onRestaurados={trasExito}", "onVinculados={trasExito}"]) expect(src).toContain(d);
    // Los TRES diálogos de la tabla (el «Vincular gasto» de UN cargo, intocable, no lo recibe).
    expect(src.match(/\n\s+finalFocus=\{false\}\n/g)?.length).toBe(3);
    // El efecto que lo aplica corre DESPUÉS del commit, sin desplazar la página.
    expect(src).toMatch(/const destino = p\.preferido\?\.isConnected \? p\.preferido : boton\?\.isConnected \? boton : herramientasRef\.current;\s*destino\?\.focus\(\{ preventScroll: true \}\);/);
    for (const d of ["../omitir-movimientos-dialog.tsx", "../vincular-cargos-gasto-dialog.tsx"]) {
      expect(leer(d)).toContain('<DialogContent className="sm:max-w-xl" finalFocus={p.finalFocus}>');
    }
    expect(leer("../quitar-omision-dialog.tsx")).toContain("finalFocus={p.finalFocus}");
  });

  it("la barra va ANTES de la tabla en el DOM, mide su alto y el hueco + `scroll-padding-bottom` salen de él", () => {
    const iBarra = src.indexOf("<BarraSeleccionMovimientos");
    expect(iBarra).toBeGreaterThan(-1);
    expect(iBarra).toBeLessThan(src.indexOf("      {tabla}\n"));
    expect(src).toContain("alMedir={setAltoBarra}");
    expect(src).toContain("const hueco = barraVisible ? huecoBarraSeleccionPx(altoBarra) : null;");
    expect(src).toContain("raiz.style.scrollPaddingBottom = `${hueco}px`;");
    expect(src).toContain('className={hueco == null ? "h-24" : undefined}');
    const b = leer("../barra-seleccion-movimientos.tsx");
    expect(b).toContain("new ResizeObserver(() => alMedir(el.getBoundingClientRect().height))");
    expect(b).toContain("ref={medir}");
  });

  it("la moneda por cuenta viaja en TODAS las pestañas (el ⋯ de una omitida en «Conciliados»)", () => {
    expect(src).toContain("const monedaPorCuenta = monedaPorCuentaProp ?? seleccion?.monedaPorCuenta;");
    const page = leer("../../../../app/admin/conciliacion/page.tsx");
    expect(page).toMatch(/seleccion=\{vistaSeleccion \? \{ vista: vistaSeleccion, monedaPorCuenta \} : null\}\s*monedaPorCuenta=\{monedaPorCuenta\}/);
  });

  it("la casilla no apaga ↑/↓/Esc: el hook de filas activas le pasa su `type` (sin esto la suite seguía verde)", () => {
    const hook = leer("../../../../hooks/use-filas-activas.ts");
    const ctx = hook.slice(hook.indexOf("function contextoDeTecla("), hook.indexOf("function enControlDe("));
    expect(ctx).toContain("tipoEntrada: objetivo instanceof HTMLInputElement ? objetivo.type : null,");
  });
});
