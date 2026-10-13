import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CABLEADO de la fila activa + teclado de las tablas (13-oct-2026), leído del
 * FUENTE (el runner no tiene DOM): que DataTable y las dos tablas de resumen
 * monten el hook como se decidió, que el hook haga el trabajo DOM que no se
 * puede probar aquí (guard de portales ANTES de todo, foco sin scroll, scroll
 * instantáneo que descuenta el thead, Enter = clic del enlace exacto), que
 * la regla CSS viva FUERA de las capas y solo con tokens, y que lo que NO se
 * toca (ui/table.tsx, el atajo ←/→ del detalle de cotización) siga intacto.
 */
const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const tabla = leer("src/components/admin/data-table.tsx");
const hook = leer("src/hooks/use-filas-activas.ts");
const desglose = leer("src/components/admin/profit-sharing/desglose-section.tsx");
const movimientos = leer("src/components/admin/profit-sharing/movimientos-cuenta.tsx");
const css = leer("src/app/globals.css");
const primitivos = leer("src/components/ui/table.tsx");
const navegacion = leer("src/lib/admin/quote-navegacion.ts");
const libro = leer("src/lib/admin/libro-excel.ts");

const veces = (src: string, texto: string) => src.split(texto).length - 1;
const tramo = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  expect(i, desde).toBeGreaterThan(-1);
  const j = src.indexOf(hasta, i + desde.length);
  expect(j, hasta).toBeGreaterThan(i);
  return src.slice(i, j);
};

describe("DataTable monta el hook sin interruptor (todas las tablas)", () => {
  it("importa useFilasActivas y lo llama UNA vez, fuera de todo if, con las filas pintadas (sub-filas incluidas)", () => {
    expect(tabla).toContain('import { useFilasActivas } from "@/hooks/use-filas-activas";');
    expect(tabla).toMatch(
      /const clavesRender = subRows\s*\?\s*visibles\.flatMap\(\(r\) => \[rowKey\(r\), \.\.\.\(subRows\(r\) \?\? \[\]\)\.map\(rowKey\)\]\)\s*:\s*visibles\.map\(rowKey\);/,
    );
    expect(tabla).toMatch(/^  const filasActivas = useFilasActivas\(clavesRender\);$/m);
    expect(veces(tabla, "useFilasActivas(")).toBe(1);
  });

  it("el <TableBody> lleva propsCuerpo y cada fila de datos propsFila(rowKey(row), href) dentro de pintarFila", () => {
    expect(tabla).toContain("<TableBody {...filasActivas.propsCuerpo}>");
    const pintar = tramo(tabla, "const pintarFila = (row: T) => {", "\n  };");
    expect(pintar).toMatch(/<TableRow\s+key=\{rowKey\(row\)\}\s+\{\.\.\.filasActivas\.propsFila\(rowKey\(row\), href\)\}/);
    // La expresión del className sigue literal: las clases de siempre no cambian.
    expect(pintar).toMatch(
      /\(href \? "cursor-pointer hover:bg-muted\/40 " : ""\) \+\s*\(rowClassName\?\.\(row\) \?\? ""\)/,
    );
  });

  it("la fila «Sin resultados» NO es navegable; nada de data-state; la búsqueda sigue en su sitio", () => {
    const vacio = tramo(tabla, "visibles.length === 0 ? (", ") : (");
    expect(vacio).not.toContain("propsFila");
    expect(tabla).not.toContain("data-state");
    expect(tabla).toMatch(/rows\.filter\(\(r\) => coincideBusqueda\(searchText\(r\), busqueda\)\)/);
  });
});

describe("use-filas-activas: el trabajo DOM", () => {
  it('es "use client" e importa las reglas puras de lib/admin/filas-activas', () => {
    expect(hook.startsWith('"use client";')).toBe(true);
    const importacion = hook.match(/import \{[^}]*\} from "@\/lib\/admin\/filas-activas";/)?.[0] ?? "";
    for (const nombre of [
      "accionDeTeclaFila",
      "indiceFilaSiguiente",
      "filaDeEntrada",
      "atributosFila",
      "indiceEnlaceDeFila",
      "scrollParaVerFila",
    ]) {
      expect(importacion, nombre).toContain(nombre);
    }
  });

  it("en los TRES handlers el guard currentTarget.contains(target) va ANTES de buscar la fila (portales de Base UI)", () => {
    for (const nombre of ["const onKeyDown =", "const onClick =", "const onFocus ="]) {
      const i = hook.indexOf(nombre);
      expect(i, nombre).toBeGreaterThan(-1);
      const cuerpo = hook.slice(i, hook.indexOf("\n  };", i));
      const guard = cuerpo.indexOf(".contains(");
      const fila = cuerpo.indexOf("filaDe(");
      expect(guard, `${nombre} guard`).toBeGreaterThan(-1);
      expect(fila, `${nombre} filaDe`).toBeGreaterThan(guard);
    }
  });

  it("foco sin scroll, scroll instantáneo que descuenta el thead y la ventana con nearest/instant; Enter = clic del enlace exacto", () => {
    expect(hook).toContain("focus({ preventScroll: true })");
    expect(hook).toContain('scrollIntoView({ block: "nearest", behavior: "instant" })');
    expect(hook).toContain(".tHead");
    expect(hook).toContain("getBoundingClientRect");
    expect(hook).toContain("getAttribute(ATRIBUTO_FILA_HREF)");
    expect(hook).toContain("indiceEnlaceDeFila(");
    expect(hook).toContain(".click()");
    expect(hook).toContain("ownerDocument.activeElement");
  });

  it("nunca escucha en window/document, no persiste, no pone roles, no toca ←/→, sin smooth, sin router, sin efectos ni refs", () => {
    for (const prohibido of [
      "window.addEventListener",
      "document.addEventListener",
      "localStorage",
      "searchParams",
      "replaceState",
      "role=",
      '"ArrowLeft"',
      '"ArrowRight"',
      "smooth",
      "next/navigation",
      "next/link",
      "useEffect(",
      "useRef(",
      'querySelector("a[href]")?.click()',
    ]) {
      expect(hook, prohibido).not.toContain(prohibido);
    }
  });
});

describe("tablas de resumen del reparto", () => {
  it("desglose: dos instancias (vuelos y gastos), el href del vuelo sale de UNA función para el Link y para Enter, el pie sin propsFila, el panel plegado inert", () => {
    expect(veces(desglose, "useFilasActivas(")).toBe(2);
    expect(desglose).toContain("propsFila(v.id, hrefVuelo(v.id))");
    expect(desglose).toContain("href={hrefVuelo(v.id)}");
    expect(desglose).toContain("propsFila(claveGasto(g))");
    expect(veces(desglose, ".propsCuerpo}")).toBe(2);
    expect(tramo(desglose, "<TableFooter>", "</TableFooter>")).not.toContain("propsFila");
    expect(desglose).toContain("inert={!open || undefined}");
  });

  it("movimientos: la clave sale de claveMovimiento (una sola expresión), el renglón principal lleva propsFila y el detalle es data-fila-hija sin propsFila", () => {
    expect(veces(movimientos, "function claveMovimiento(")).toBe(1);
    expect(veces(movimientos, 'pago?.id ?? `${m.tipo}-${m.fecha}-${m.aeronave?.id ?? ""}-${i}`')).toBe(1);
    expect(movimientos).toContain("key={clave}");
    expect(movimientos).toContain("{...filasActivas.propsFila(clave)}");
    expect(movimientos).toMatch(
      /<TableRow className="hover:bg-transparent" data-entrega-id=\{pago\.id\} data-fila-hija="">/,
    );
    expect(movimientos).toContain("{...filasActivas.propsCuerpo}");
    expect(veces(movimientos, "propsFila(")).toBe(1);
  });
});

/** El CSS sin los bloques `@layer … { … }` (conteo de llaves). */
function sinCapas(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const j = src.indexOf("@layer", i);
    if (j < 0) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, j);
    const abre = src.indexOf("{", j);
    const puntoYComa = src.indexOf(";", j);
    // `@layer a, b;` (declaración sin bloque) vs `@layer x { … }`.
    if (abre < 0 || (puntoYComa >= 0 && puntoYComa < abre)) {
      i = puntoYComa + 1;
      continue;
    }
    let nivel = 0;
    let k = abre;
    for (; k < src.length; k++) {
      if (src[k] === "{") nivel++;
      else if (src[k] === "}") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    i = k + 1;
  }
  return out;
}

describe("globals.css: la regla de la fila activa vive FUERA de las capas y solo con tokens", () => {
  const resto = sinCapas(css);
  const bloque = tramo(css, "Fila activa de las tablas", 'input[type="date"]');

  it("las cuatro reglas existen fuera de todo @layer, a columna 0", () => {
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] > :first-child \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] \+ tr\[data-fila-hija\] \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr:focus-visible \{/m);
    expect(veces(bloque, "var(--accent)")).toBe(2);
    expect(bloque).toContain("box-shadow: inset 3px 0 0 0 var(--ring);");
    expect(bloque).toContain("outline-offset: -2px;");
    // El helper sí quita las capas: el outline global vive en @layer base.
    expect(resto).not.toContain("*:focus-visible {");
  });

  it("sin hex sueltos, sin clases del hover, sin el gancho del primitivo y sin !important", () => {
    expect(bloque).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bloque).not.toContain("bg-muted");
    expect(bloque).not.toContain("data-state");
    expect(bloque).not.toContain("!important");
  });
});

describe("lo que NO se toca", () => {
  it("ui/table.tsx sigue sin data-filas-activas, tabIndex ni aria-selected (el gancho data-[state=selected] queda sin uso)", () => {
    expect(primitivos).not.toContain("data-filas-activas");
    expect(primitivos).not.toContain("tabIndex");
    expect(primitivos).not.toContain("aria-selected");
    expect(primitivos).toContain("data-[state=selected]:bg-muted");
  });

  it("direccionDeTecla (atajo ←/→ del detalle de cotización) es idéntica y sus sets siguen ignorando grid/gridcell/listbox/option", () => {
    expect(navegacion).toContain(
      [
        "export function direccionDeTecla(",
        "  t: TeclaPulsada,",
        "  ctx: ContextoFoco,",
        "): DireccionFlecha | null {",
        '  if (t.key !== "ArrowLeft" && t.key !== "ArrowRight") return null;',
        "  if (t.altKey || t.ctrlKey || t.metaKey || t.shiftKey) return null;",
        "  if (t.repeat || t.defaultPrevented) return null;",
        "  if (ctx.hayCapaAbierta || ctx.editable) return null;",
        "  if (ctx.etiqueta && ETIQUETAS_CON_FLECHAS.has(ctx.etiqueta.toUpperCase())) return null;",
        "  if (ctx.rol && ROLES_CON_FLECHAS.has(ctx.rol)) return null;",
        '  return t.key === "ArrowLeft" ? "anterior" : "siguiente";',
      ].join("\n"),
    );
    const roles = navegacion.match(/const ROLES_CON_FLECHAS = new Set\(\[[^\]]*\]\)/)?.[0] ?? "";
    for (const r of ['"grid"', '"gridcell"', '"listbox"', '"option"']) expect(roles, r).toContain(r);
  });

  it("el LibroExcel (Decisión B) comparte la cuenta 1-D: ejeParaVer delega en desplazamientoParaVer", () => {
    expect(libro).toContain('import { desplazamientoParaVer } from "./desplazamiento-visible";');
    const eje = tramo(libro, "function ejeParaVer(", "\n}");
    expect(eje).toContain("desplazamientoParaVer({");
    expect(veces(libro, "desplazamientoParaVer(")).toBe(1);
  });
});
