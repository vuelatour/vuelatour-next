/**
 * «Unir en compra» como MODO (14-oct-2026, tabla única de Gastos): las
 * casillas solo aparecen al pulsar «Unir en compra…» en la fila de vistas;
 * «Terminar» las oculta y limpia la selección; unir con éxito apaga el modo.
 * Marcado estático del botón y de la barra flotante + cableado por regex.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AYUDA_MODO_UNIR,
  INSTRUCCION_MODO_UNIR,
  INSTRUCCION_MODO_UNIR_CORTA,
  TEXTO_UNIR_SIN_LISTA,
  TITULO_TERMINAR_UNIR,
  tituloUnirSinSeleccionables,
} from "@/lib/admin/gastos-vista";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/app/admin/inventory/compras/actions", () => ({
  unirGastosEnCompraAction: async () => ({ ok: false }),
}));

const { ExpensesSeleccionProvider, UnirCompraToggle } = await import("../expenses-seleccion");

const pintar = (opts: { modo?: boolean; ids?: string[]; cargaFallida?: boolean }) =>
  renderToStaticMarkup(
    <ExpensesSeleccionProvider
      idsVisibles={opts.ids ?? ["g-1", "g-2"]}
      modoInicial={opts.modo}
      cargaFallida={opts.cargaFallida}
    >
      <UnirCompraToggle />
    </ExpensesSeleccionProvider>,
  );
const boton = (html: string) => /<button[^>]*aria-pressed="(true|false)"[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";

describe("botón del modo", () => {
  it("sin modo: «Unir en compra…» con aria-pressed=false, su ayuda y sin barra flotante", () => {
    const html = pintar({});
    const b = boton(html);
    expect(b).toContain('aria-pressed="false"');
    expect(b).toContain("Unir en compra…");
    expect(b).toContain(`title="${AYUDA_MODO_UNIR}"`);
    // Siempre habilitado (un botón deshabilitado no enseña su title).
    expect(b).not.toContain('disabled=""');
    expect(html).not.toContain("data-barra-unir");
  });

  it("con modo: «Terminar de unir» con aria-pressed=true y la barra con la instrucción y «Terminar»", () => {
    const html = pintar({ modo: true });
    const b = boton(html);
    expect(b).toContain('aria-pressed="true"');
    expect(b).toContain("Terminar de unir");
    expect(b).toContain(`title="${TITULO_TERMINAR_UNIR}"`);
    expect(html).toContain("data-barra-unir");
    // Corta en teléfono, completa desde 640 px.
    expect(html).toContain(
      `<span class="sm:hidden">${INSTRUCCION_MODO_UNIR_CORTA}</span><span class="hidden sm:inline">${INSTRUCCION_MODO_UNIR}</span>`,
    );
    expect(html).toMatch(/>Terminar<\/button>/);
    // «Unir en compra» de la barra deshabilitado sin marcas.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Unir en compra<\/button>/);
  });

  it("con modo y SIN nada que unir en la vista: lo explica (y «Terminar»)", () => {
    const html = pintar({ modo: true, ids: [] });
    expect(html).toContain(tituloUnirSinSeleccionables());
    expect(html).not.toContain(INSTRUCCION_MODO_UNIR);
    expect(html).toMatch(/>Terminar<\/button>/);
  });

  it("fuera del provider no se pinta (otras tablas sin casillas)", () => {
    expect(renderToStaticMarkup(<UnirCompraToggle />)).toBe("");
  });
});

describe("la lista NO cargó (revisión del 14-oct-2026): jamás «no hay gastos que se puedan unir»", () => {
  it("sin modo: el botón no se ofrece (no hay qué unir a la vista)", () => {
    expect(pintar({ ids: [], cargaFallida: true })).toBe("");
  });

  it("con el modo encendido: la barra lo dice con role=status y deja «Terminar»", () => {
    const html = pintar({ modo: true, ids: [], cargaFallida: true });
    expect(html).toContain(`<p class="max-w-md text-sm text-muted-foreground" role="status">${TEXTO_UNIR_SIN_LISTA}</p>`);
    expect(html).not.toContain(tituloUnirSinSeleccionables());
    expect(html).not.toContain("no hay gastos");
    expect(html).not.toContain(INSTRUCCION_MODO_UNIR);
    expect(html).toMatch(/>Terminar<\/button>/);
    // El botón del modo sigue para poder apagarlo.
    expect(boton(html)).toContain('aria-pressed="true"');
  });
});

describe("barra flotante: ancho y hueco (revisión del 14-oct-2026)", () => {
  const html = pintar({ modo: true });
  const barra = /<div[^>]*data-barra-unir[^>]*>/.exec(html)?.[0] ?? "";

  it("todo el ancho del teléfono (1rem de margen), centrada con mx-auto + w-fit; sin left-1/2 ni translate", () => {
    expect(barra).toContain("fixed inset-x-4 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)]");
    expect(barra).not.toContain("left-1/2");
    expect(barra).not.toContain("translate-x");
  });

  it("el hueco del final arranca en h-20 y luego mide lo que la barra (ResizeObserver)", () => {
    expect(html).toContain('<div aria-hidden="true" data-hueco-barra-unir="" class="h-20"></div>');
  });
});

describe("cableado (regex sobre los fuentes)", () => {
  const sel = readFileSync(path.resolve(__dirname, "../expenses-seleccion.tsx"), "utf8");
  const tabla = readFileSync(path.resolve(__dirname, "../expenses-table.tsx"), "utf8");

  it("apagar el modo limpia la selección", () => {
    expect(sel).toMatch(/const setModoUnir = useCallback\(\(activo: boolean\) => \{\s*setModoUnirEstado\(activo\);\s*if \(!activo\) setSeleccion\(new Map\(\)\);/);
    expect(sel).toContain("haySeleccionables = idsVisibles.length > 0");
  });

  it("unir con éxito apaga el modo; la llamada no lanza (llamarSinLanzar)", () => {
    const confirmar = sel.slice(sel.indexOf("const confirmar = () =>"), sel.indexOf("return (", sel.indexOf("const confirmar = () =>")));
    expect(confirmar).toContain("llamarSinLanzar(");
    expect(confirmar).toMatch(/if \(r\.ok && r\.data\) \{[\s\S]*?ctx\.setModoUnir\(false\);[\s\S]*?router\.push/);
  });

  it("lista caída: la página lo pasa, lo marcado no se poda y el hueco sigue a la barra", () => {
    const page = readFileSync(path.resolve(__dirname, "../../../../app/admin/expenses/page.tsx"), "utf8");
    expect(page).toContain("<ExpensesSeleccionProvider idsVisibles={idsSeleccionables} cargaFallida={!lista.ok}>");
    expect(sel).toMatch(/useEffect\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(cargaFallida\) return;/);
    expect(sel).toContain("}, [idsVisibles, cargaFallida]);");
    expect(sel).toContain("if (ctx.cargaFallida && !activo) return null;");
    expect(sel).toMatch(/const ro = new ResizeObserver\([\s\S]*?ro\.observe\(el\);\s*return \(\) => ro\.disconnect\(\);/);
    expect(sel).toContain("style={altoBarra > 0 ? { height: Math.ceil(altoBarra) + 32 } : undefined}");
    expect(sel).toContain("ref={medirBarra}");
  });

  it("la barra flotante solo se pinta con el modo; la columna de casillas solo con seleccion?.modoUnir", () => {
    expect(sel).toContain("if (!ctx || !ctx.modoUnir) return null;");
    expect(tabla).toContain("if (seleccion?.modoUnir) {");
    expect(tabla).not.toMatch(/if \(seleccion\) \{/);
  });
});
