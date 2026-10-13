import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CABLEADO de la fila activa + teclado de las tablas (13-oct-2026), leído del
 * FUENTE (el runner no tiene DOM): que DataTable y las dos tablas de resumen
 * monten el hook y `FilaNavegable` como se decidió, que el hook haga el
 * trabajo DOM que no se puede probar aquí (guard de portales ANTES de todo,
 * la hija resuelta a su fila, foco sin scroll, scroll instantáneo que
 * descuenta el thead, Enter = clic del enlace exacto) SIN estado de React
 * (la activa vive en el estado del hook y cada fila se suscribe), que la
 * regla CSS viva FUERA de las capas, solo con los tokens propios y como CAPA
 * (background-image), que la marca mida ≥ 3:1 también en oscuro con los
 * tokens FINALES, y que lo que NO se toca (ui/table.tsx, el atajo ←/→ del
 * detalle de cotización) siga intacto.
 */
const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const tabla = leer("src/components/admin/data-table.tsx");
const hook = leer("src/hooks/use-filas-activas.ts");
const filaNavegable = leer("src/components/admin/fila-navegable.tsx");
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
  it("importa useFilasActivas y FilaNavegable, llama al hook UNA vez, fuera de todo if, con las filas pintadas (sub-filas incluidas)", () => {
    expect(tabla).toContain('import { useFilasActivas } from "@/hooks/use-filas-activas";');
    expect(tabla).toContain('import { FilaNavegable } from "@/components/admin/fila-navegable";');
    expect(tabla).toMatch(
      /const clavesRender = subRows\s*\?\s*visibles\.flatMap\(\(r\) => \[rowKey\(r\), \.\.\.\(subRows\(r\) \?\? \[\]\)\.map\(rowKey\)\]\)\s*:\s*visibles\.map\(rowKey\);/,
    );
    expect(tabla).toMatch(/^  const filasActivas = useFilasActivas\(clavesRender\);$/m);
    expect(veces(tabla, "useFilasActivas(")).toBe(1);
  });

  it("el <TableBody> lleva propsCuerpo y cada fila de datos es un <FilaNavegable filas clave href> dentro de pintarFila (ningún propsFila)", () => {
    expect(tabla).toContain("<TableBody {...filasActivas.propsCuerpo}>");
    const pintar = tramo(tabla, "const pintarFila = (row: T) => {", "\n  };");
    expect(pintar).toMatch(
      /<FilaNavegable\s+key=\{rowKey\(row\)\}\s+filas=\{filasActivas\}\s+clave=\{rowKey\(row\)\}\s+href=\{href\}/,
    );
    expect(pintar).toContain("</FilaNavegable>");
    expect(pintar).not.toContain("<TableRow");
    // La expresión del className sigue literal: las clases de siempre no cambian.
    expect(pintar).toMatch(
      /\(href \? "cursor-pointer hover:bg-muted\/40 " : ""\) \+\s*\(rowClassName\?\.\(row\) \?\? ""\)/,
    );
    expect(tabla).not.toContain("propsFila");
  });

  it("la fila «Sin resultados» NO es navegable; nada de data-state; la búsqueda sigue en su sitio", () => {
    const vacio = tramo(tabla, "visibles.length === 0 ? (", ") : (");
    expect(vacio).not.toContain("FilaNavegable");
    expect(tabla).not.toContain("data-state");
    expect(tabla).toMatch(/rows\.filter\(\(r\) => coincideBusqueda\(searchText\(r\), busqueda\)\)/);
  });
});

describe("use-filas-activas: el trabajo DOM, sin estado de React", () => {
  it('es "use client" e importa las reglas puras de lib/admin/filas-activas (el estado incluido)', () => {
    expect(hook.startsWith('"use client";')).toBe(true);
    const importacion = hook.match(/import \{[^}]*\} from "@\/lib\/admin\/filas-activas";/)?.[0] ?? "";
    for (const nombre of [
      "accionDeTeclaFila",
      "indiceFilaSiguiente",
      "crearEstadoFilaActiva",
      "indiceEnlaceDeFila",
      "scrollParaVerFila",
      "SELECTOR_FILA_HIJA",
    ]) {
      expect(importacion, nombre).toContain(nombre);
    }
    // Los atributos y la entrada del Tab los pinta FilaNavegable, no el hook.
    expect(importacion).not.toContain("atributosFila");
    expect(importacion).not.toContain("filaDeEntrada");
  });

  it("la activa vive en crearEstadoFilaActiva, creado UNA vez con un useState perezoso que NUNCA se re-asigna; los handlers leen/escriben ahí (sin useEffect, sin useRef, sin setActiva)", () => {
    expect(hook).toContain('import { useState } from "react";');
    expect(hook).toMatch(
      /const \[estado\] = useState<EstadoFilaActiva>\(\(\) =>\s*crearEstadoFilaActiva\(opciones\?\.inicial \?\? null\),?\s*\);/,
    );
    expect(veces(hook, "crearEstadoFilaActiva(")).toBe(1);
    // Un solo useState (el de la instancia) y ningún setter: la activa no es estado de React.
    expect((hook.match(/useState[<(]/g) ?? []).length).toBe(1);
    expect(hook).toContain("estado.leer() !== null");
    expect(veces(hook, "estado.escribir(")).toBeGreaterThanOrEqual(4);
    expect(hook).toMatch(/return \{\s*estado,\s*claves,\s*soltar: \(\) => estado\.escribir\(null\),\s*propsCuerpo:/);
    for (const prohibido of ["useEffect(", "useRef(", "setActiva", "setEstado"]) {
      expect(hook, prohibido).not.toContain(prohibido);
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

  it("un objetivo en el renglón pegado (data-fila-hija) resuelve a la fila ANTERIOR; rol/desplegable/control se miran en el renglón real", () => {
    const resolver = tramo(hook, "function filaDe(", "\n}");
    expect(resolver).toContain("closest<Fila>(SELECTOR_FILA)");
    expect(resolver).toContain("closest<Fila>(SELECTOR_FILA_HIJA)");
    expect(resolver).toContain("hija.previousElementSibling");
    expect(resolver).toContain("padre.matches(SELECTOR_FILA)");
    expect(resolver).toContain("{ fila: padre as Fila, renglon: hija }");
    // Solo hijos directos del <tbody>, como siempre.
    expect(resolver).toContain("fila.parentElement === cuerpo");
    expect(resolver).toContain("hija.parentElement !== cuerpo");
    expect(hook).toContain("rol: rolDentroDe(objetivo, r.renglon)");
    expect(hook).toContain("conDesplegable: dentroDe(r.renglon, objetivo.closest(SELECTOR_DESPLEGABLE))");
    expect(hook).toContain("esFila: objetivo === r.fila");
    // El clic en «Editar»/«Eliminar»/comprobante de la hija NO roba el foco.
    expect(hook).toContain("!enControlDe(objetivo, r.renglon) && r.fila.ownerDocument.activeElement !== r.fila");
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

  it("nunca escucha en window/document, no persiste, no pone roles, no toca ←/→, sin smooth, sin router", () => {
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
      'querySelector("a[href]")?.click()',
    ]) {
      expect(hook, prohibido).not.toContain(prohibido);
    }
  });
});

describe("FilaNavegable: el <tr> que se suscribe POR FILA", () => {
  it('es "use client", se suscribe con useSyncExternalStore a estado.suscribir y pinta atributosDeInstantanea sobre TableRow (props primero, atributos después)', () => {
    expect(filaNavegable.startsWith('"use client";')).toBe(true);
    expect(filaNavegable).toContain('import { TableRow } from "@/components/ui/table";');
    expect(filaNavegable).toContain(
      'import { atributosDeInstantanea, instantaneaFila } from "@/lib/admin/filas-activas";',
    );
    expect(filaNavegable).toContain("const leer = () => instantaneaFila(clave, estado.leer(), claves);");
    expect(filaNavegable).toContain("useSyncExternalStore(estado.suscribir, leer, leer)");
    expect(filaNavegable).toContain(
      "<TableRow {...props} {...atributosDeInstantanea(clave, instantanea, href)} />",
    );
    for (const prohibido of ["useState(", "useEffect(", "useRef(", "React.memo", "memo("]) {
      expect(filaNavegable, prohibido).not.toContain(prohibido);
    }
  });
});

describe("tablas de resumen del reparto", () => {
  it("desglose: dos instancias (vuelos y gastos), FilaNavegable con el href del vuelo de UNA función para el Link y para Enter, el pie sin filas navegables, el panel plegado inert", () => {
    expect(desglose).toContain('import { FilaNavegable } from "@/components/admin/fila-navegable";');
    expect(veces(desglose, "useFilasActivas(")).toBe(2);
    expect(desglose).toMatch(
      /<FilaNavegable\s+key=\{v\.id\}\s+filas=\{filasVuelos\}\s+clave=\{v\.id\}\s+href=\{hrefVuelo\(v\.id\)\}/,
    );
    expect(desglose).toContain("href={hrefVuelo(v.id)}");
    expect(desglose).toContain("<FilaNavegable key={claveGasto(g)} filas={filasGastos} clave={claveGasto(g)}>");
    expect(veces(desglose, ".propsCuerpo}")).toBe(2);
    expect(veces(desglose, "<FilaNavegable")).toBe(2);
    expect(desglose).not.toContain("propsFila");
    expect(tramo(desglose, "<TableFooter>", "</TableFooter>")).not.toContain("FilaNavegable");
    expect(desglose).toContain("inert={!open || undefined}");
  });

  it("movimientos: la clave sale de claveMovimiento (una sola expresión), el renglón principal es FilaNavegable y el detalle es data-fila-hija (TableRow a secas, pegado)", () => {
    expect(movimientos).toContain('import { FilaNavegable } from "@/components/admin/fila-navegable";');
    expect(veces(movimientos, "function claveMovimiento(")).toBe(1);
    expect(veces(movimientos, 'pago?.id ?? `${m.tipo}-${m.fecha}-${m.aeronave?.id ?? ""}-${i}`')).toBe(1);
    expect(movimientos).toContain("key={clave}");
    expect(movimientos).toMatch(/<FilaNavegable\s+filas=\{filasActivas\}\s+clave=\{clave\}/);
    expect(movimientos).toMatch(
      /<TableRow className="hover:bg-transparent" data-entrega-id=\{pago\.id\} data-fila-hija="">/,
    );
    expect(movimientos).toContain("{...filasActivas.propsCuerpo}");
    expect(veces(movimientos, "<FilaNavegable")).toBe(1);
    expect(movimientos).not.toContain("propsFila");
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

/** El bloque `selector { … }` de un tema (`:root`, `.dark`, `.dark .zona-clara`). */
function bloqueTema(selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(re);
  expect(m, selector).not.toBeNull();
  return m![2];
}

function token(bloque: string, nombre: string): string {
  const m = bloque.match(new RegExp(`--${nombre}:\\s*([^;]+);`));
  expect(m, nombre).not.toBeNull();
  return m![1].trim();
}

describe("globals.css: la regla de la fila activa vive FUERA de las capas, como CAPA y solo con sus tokens", () => {
  const resto = sinCapas(css);
  const bloque = tramo(css, "Fila activa de las tablas", 'input[type="date"]');

  it("las reglas existen fuera de todo @layer, a columna 0", () => {
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\],\n\[data-filas-activas\] > tr\[data-fila-activa\] \+ tr\[data-fila-hija\] \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] > \*,/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] > :first-child,/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] > :last-child,/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\]:has\(\+ tr\[data-fila-hija\]\) > \* \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr\[data-fila-activa\] \+ tr\[data-fila-hija\] > \* \{/m);
    expect(resto).toMatch(/^\[data-filas-activas\] > tr:focus-visible \{/m);
    expect(bloque).toContain("outline-offset: -2px;");
    // El helper sí quita las capas: el outline global vive en @layer base.
    expect(resto).not.toContain("*:focus-visible {");
  });

  it("el tinte es una CAPA (background-image con --fila-activa), nunca background-color ni --accent: el fondo de rowClassName sigue debajo", () => {
    expect(bloque).toContain("background-image: linear-gradient(var(--fila-activa), var(--fila-activa));");
    expect(bloque).not.toContain("background-color:");
    expect(bloque).not.toContain("var(--accent)");
    expect(veces(bloque, "var(--fila-activa)")).toBe(2);
  });

  it("la marca va celda por celda en --fila-activa-marca: barra de 4 px a la izquierda, 1 px a la derecha y arriba/abajo; con hija el contorno abraza a las dos", () => {
    expect(bloque).toContain("inset var(--fila-marca-izq, 0) 0 0 0 var(--fila-activa-marca)");
    expect(bloque).toContain("inset var(--fila-marca-der, 0) 0 0 0 var(--fila-activa-marca)");
    expect(bloque).toContain("inset 0 var(--fila-marca-arriba, 1px) 0 0 var(--fila-activa-marca)");
    expect(bloque).toContain("inset 0 var(--fila-marca-abajo, -1px) 0 0 var(--fila-activa-marca)");
    expect(veces(bloque, "var(--fila-activa-marca)")).toBe(4);
    expect(bloque).toMatch(/> :first-child \{\s*--fila-marca-izq: 4px;/);
    expect(bloque).toMatch(/> :last-child \{\s*--fila-marca-der: -1px;/);
    expect(bloque).toMatch(/:has\(\+ tr\[data-fila-hija\]\) > \* \{\s*--fila-marca-abajo: 0;/);
    expect(bloque).toMatch(/\+ tr\[data-fila-hija\] > \* \{\s*--fila-marca-arriba: 0;/);
    expect(bloque).not.toContain("var(--ring)");
  });

  it("sin hex sueltos, sin clases del hover, sin el gancho del primitivo y sin !important", () => {
    expect(bloque).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bloque).not.toContain("bg-muted");
    expect(bloque).not.toContain("data-state");
    expect(bloque).not.toContain("!important");
  });

  it("los tokens existen en los TRES temas: un color-mix de --ring (traslúcido) y la marca = --ring", () => {
    for (const tema of [":root", ".dark", ".dark .zona-clara"]) {
      const b = bloqueTema(tema);
      expect(token(b, "fila-activa"), tema).toMatch(/^color-mix\(in srgb, var\(--ring\) \d+%, transparent\)$/);
    }
    expect(token(bloqueTema(":root"), "fila-activa-marca")).toBe("var(--ring)");
    expect(token(bloqueTema(".dark"), "fila-activa-marca")).toBe("var(--ring)");
  });
});

// ---------------------------------------------------------------------------
// Contraste (WCAG) con los tokens FINALES del CSS: la marca (--ring) tiene que
// medir ≥ 3:1 (1.4.11, indicador de estado) contra la card, contra el fondo
// de la fila activa y contra la vecina con hover, en claro Y en oscuro. En
// oscuro --accent (el fondo anterior) era el tono del hover: 1.14:1.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

function hex(valor: string): Rgb {
  const m = valor.match(/^#([0-9a-f]{6})$/i);
  expect(m, valor).not.toBeNull();
  const n = parseInt(m![1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `color` con alfa `a` encima de `fondo` (composición normal). */
function encima(fondo: Rgb, color: Rgb, a: number): Rgb {
  return fondo.map((f, i) => f + a * (color[i] - f)) as Rgb;
}

function luminancia([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function porcentajeTinte(bloque: string): number {
  const m = token(bloque, "fila-activa").match(/var\(--ring\) (\d+)%/);
  expect(m).not.toBeNull();
  return Number(m![1]) / 100;
}

describe("contraste de la marca con los tokens finales (claro y oscuro)", () => {
  for (const tema of [":root", ".dark"]) {
    it(`${tema}: --ring ≥ 3:1 contra la card, contra el fondo activo (tinte sobre card) y contra la vecina con hover (muted/50)`, () => {
      const b = bloqueTema(tema);
      const card = hex(token(b, "card"));
      const muted = hex(token(b, "muted"));
      const ring = hex(token(b, "ring"));
      const tinte = porcentajeTinte(b);
      const fondoActivo = encima(card, ring, tinte);
      // `hover:bg-muted/50` (TableRow) sobre la card; con href es /40 (aún más cerca de la card).
      const vecinaHover = encima(card, muted, 0.5);
      expect(contraste(ring, card), "marca vs card").toBeGreaterThanOrEqual(3);
      expect(contraste(ring, fondoActivo), "marca vs fondo activo").toBeGreaterThanOrEqual(3);
      expect(contraste(ring, vecinaHover), "marca vs vecina con hover").toBeGreaterThanOrEqual(3);
      expect(contraste(ring, encima(card, muted, 0.4)), "marca vs vecina con hover (href)").toBeGreaterThanOrEqual(3);
    });
  }

  it("en oscuro el tinte difiere del hover por MATIZ (más rojo que azul), no por luminancia: por eso la marca es obligatoria", () => {
    const b = bloqueTema(".dark");
    const card = hex(token(b, "card"));
    const muted = hex(token(b, "muted"));
    const ring = hex(token(b, "ring"));
    const fondoActivo = encima(card, ring, porcentajeTinte(b));
    const vecinaHover = encima(card, muted, 0.5);
    // Rojo por encima del azul en la activa; azul por encima del rojo en el hover.
    expect(fondoActivo[0] - fondoActivo[2]).toBeGreaterThan(vecinaHover[0] - vecinaHover[2] + 20);
    expect(contraste(fondoActivo, vecinaHover)).toBeLessThan(1.5);
  });

  it("en claro el tinte sigue siendo (casi) brand-50 sobre blanco: nada cambia a la vista", () => {
    const b = bloqueTema(":root");
    const fondoActivo = encima(hex(token(b, "card")), hex(token(b, "ring")), porcentajeTinte(b));
    const brand50 = hex("#fef2f2");
    for (let i = 0; i < 3; i++) expect(Math.abs(fondoActivo[i] - brand50[i])).toBeLessThanOrEqual(4);
  });
});

describe("lo que NO se toca", () => {
  it("ui/table.tsx sigue sin data-filas-activas, tabIndex, aria-current ni aria-selected (el gancho data-[state=selected] queda sin uso)", () => {
    expect(primitivos).not.toContain("data-filas-activas");
    expect(primitivos).not.toContain("tabIndex");
    expect(primitivos).not.toContain("aria-current");
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
