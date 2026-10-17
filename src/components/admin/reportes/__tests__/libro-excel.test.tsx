/**
 * El libro de Excel EN PANTALLA (12-oct-2026): el marcado que pinta
 * `LibroExcel` sobre un libro chico (números formateados, combinadas,
 * estilos en línea, notas, paneles fijos, pestañas y la descarga del MISMO
 * libro) y el cableado de la página `/admin/reportes/balance` y de los
 * enlaces «Ver en pantalla» de Reportes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibroExcel as LibroExcelJson } from "@/types/libro-excel";
import {
  ETIQUETA_ACTUALIZAR_LIBRO,
  ETIQUETA_PANTALLA_COMPLETA,
  GROSOR_BORDE_CELDA_PX,
  TITULO_ACTUALIZAR_LIBRO,
  TITULO_MANIJA_COLUMNA,
  letraColumna,
  nombreManijaColumna,
} from "@/lib/admin/libro-excel";
import {
  ALTO_FRANJA_PX,
  TEXTO_GASTO_NO_ENCONTRADO,
  TEXTO_LIBRO_SIN_VINCULOS,
} from "@/lib/admin/libro-vinculos";

interface PropsBotonExcel {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
}
const botonesExcel: PropsBotonExcel[] = [];

vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: (p: PropsBotonExcel) => {
    botonesExcel.push(p);
    return <button data-descarga={p.filename}>{p.label}</button>;
  },
}));

// «Actualizar datos» (14-oct-2026) usa el router de Next: aquí no hay App
// Router montado, así que se simula (solo lo pide la vista «pantalla»).
const refrescar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refrescar }) }));
// La captura del costo real AFAC (16-oct-2026) importa sus server actions;
// aquí no hay servidor (ni variables de Supabase).
vi.mock("@/app/admin/reportes/actions", () => ({
  guardarCostoRealAfacAction: async () => ({ ok: false }),
  quitarCostoRealAfacAction: async () => ({ ok: false }),
}));

const { LibroExcel } = await import("../libro-excel");
const { VerEnPantallaLink } = await import("../ver-en-pantalla-link");

const UUID = "3f9a1c2e-0000-4000-8000-000000000001";

const LIBRO: LibroExcelJson = {
  version: 1,
  titulo: "Balance XB-PEV · 2026-09-01 a 2026-09-30",
  archivo: "balance-XB-PEV-2026-09-01-a-2026-09-30.xlsx",
  generado: null,
  ancho_columna_default: 8.43,
  alto_fila_default: 15,
  estilos: [
    { b: true, sz: 14, co: "0F4C81" },
    { bg: "0F4C81", co: "FFFFFF", b: true, ha: "center", va: "center", wr: true, bd: "lrtb" },
    { nf: "#,##0.00" },
    { nf: "#,##0.00", bg: "FFC7CE", co: "9C0006" },
  ],
  hojas: [
    {
      nombre: "balance",
      pestana: "15803D",
      cuadricula: true,
      inmovilizar: { filas: 2, columnas: 1 },
      max_fila: 6,
      max_col: 4,
      columnas: [{ c: 1, ancho: 30 }],
      filas: [{ r: 2, alto: 38 }],
      combinadas: [{ r1: 1, c1: 1, r2: 1, c2: 3 }],
      celdas: [
        { r: 1, c: 1, v: "Balance XB-PEV", t: "Balance XB-PEV", s: 0 },
        { r: 2, c: 1, v: "Concepto", t: "Concepto", s: 1 },
        { r: 3, c: 2, v: 1234.5, t: "1,234.50", s: 2 },
        { r: 4, c: 2, v: -20, t: "-20.00", s: 3 },
        { r: 6, c: 2, v: 1214.5, t: "1,214.50", f: "=SUM(B3:B4)", s: 2 },
        { r: 3, c: 3, v: "texto", t: "texto", n: "nota de la celda" },
      ],
    },
    {
      nombre: "vacía",
      pestana: null,
      cuadricula: false,
      inmovilizar: null,
      max_fila: 1,
      max_col: 1,
      columnas: [],
      filas: [],
      combinadas: [],
      celdas: [],
    },
  ],
};

function pintar(
  descarga?: { path: string; filename: string; query?: Record<string, string>; label: string } | null,
  pantalla = false,
) {
  botonesExcel.length = 0;
  return renderToStaticMarkup(<LibroExcel libro={LIBRO} descarga={descarga} pantalla={pantalla} />);
}

describe("LibroExcel: la primera hoja como la pintaría Excel", () => {
  it("números con su formato, fórmulas visibles en el marcado y la combinada con colspan", () => {
    const html = pintar();
    expect(html).toContain("Balance XB-PEV");
    expect(html).toContain("1,234.50");
    expect(html).toContain("-20.00");
    expect(html).toContain("1,214.50");
    expect(html).toContain('data-formula="=SUM(B3:B4)"');
    expect(html).toContain('title="=SUM(B3:B4)"');
    // (react-dom/server escribe el atributo como `colSpan`.)
    expect(html).toMatch(/<td[^>]*colSpan="3"[^>]*>Balance XB-PEV<\/td>/);
    // Ningún texto crudo de fórmula en pantalla (la celda muestra su número).
    expect(html.replace(/data-formula="[^"]*"|title="[^"]*"/g, "")).not.toContain("=SUM(");
  });

  it("estilos del libro en línea: relleno, color, negrita, tamaño, bordes y el rojo del negativo", () => {
    const html = pintar();
    expect(html).toContain("background-color:#0F4C81");
    expect(html).toContain("color:#FFFFFF");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("font-size:14pt");
    expect(html).toContain("border-left:1px solid #7f7f7f");
    expect(html).toContain("background-color:#FFC7CE");
    expect(html).toContain("color:#9C0006");
    // Los números a la derecha; el encabezado centrado y con ajuste.
    expect(html).toMatch(/<td[^>]*text-align:right[^>]*>1,234\.50<\/td>/);
    expect(html).toMatch(/<td[^>]*text-align:center[^>]*white-space:pre-wrap[^>]*>Concepto<\/td>/);
  });

  it("la nota marca la celda y viaja al tooltip", () => {
    const html = pintar();
    expect(html).toMatch(/<td[^>]*class="[^"]*xl-con-nota[^"]*"[^>]*title="nota de la celda"[^>]*>texto<\/td>/);
  });

  it("cuadrícula de Excel: letras de columna, números de fila, anchos y altos del libro", () => {
    const html = pintar();
    expect(html).toContain('<col style="width:46px"/>');
    expect(html).toContain('<col style="width:215px"/>');
    expect(html).toContain('<col style="width:64px"/>');
    // La letra es el texto del <th>; detrás va SOLO su manija para ajustar
    // el ancho (14-oct-2026; su marcado completo, en «ajustar el ancho…»).
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>A<button[^>]*class="xl-manija"[^>]*><\/button><\/th>/);
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>N<button[^>]*class="xl-manija"[^>]*><\/button><\/th>/); // relleno mínimo de 14 columnas
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>40<\/th>/); // y de 40 filas
    expect(html).toContain('style="height:51px"');
    expect(html).toContain('style="height:20px"');
    expect(html).toContain('class="xl-marco xl-cuadricula"');
  });

  it("paneles inmovilizados: 2 filas y 1 columna fijas con su desplazamiento", () => {
    const html = pintar();
    expect(html).toMatch(
      /<th[^>]*xl-fija-col[^>]*style="left:46px"[^>]*>A<button[^>]*class="xl-manija"[^>]*><\/button><\/th>/,
    );
    expect(html).toMatch(/<th[^>]*xl-fija-fila[^>]*style="top:22px"[^>]*>1<\/th>/);
    expect(html).toMatch(/<th[^>]*xl-fija-fila[^>]*style="top:42px"[^>]*>2<\/th>/);
    expect(html).toMatch(/<td[^>]*xl-fija-fila xl-fija-col[^>]*top:22px;left:46px[^>]*>Balance XB-PEV<\/td>/);
  });

  it("pestañas abajo con el color de la hoja, la primera activa, y la barra de fórmulas vacía al abrir", () => {
    const html = pintar();
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>balance/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>vacía/);
    expect(html).toContain("background:#15803D");
    expect(html).toContain('class="xl-nombre"');
    expect(html).toContain(">fx<");
    expect(html).toContain("2 hojas");
    expect(html).toMatch(/<button[^>]*class="xl-pestana cursor-pointer"/);
  });

  it("la descarga es el MISMO libro (recibe ruta, archivo y parámetros tal cual); sin ella no hay botón", () => {
    const descarga = {
      path: `/v1/aircraft/${UUID}/balance.xlsx`,
      filename: "balance-XB-PEV-2026-09-01-2026-09-30.xlsx",
      query: { desde: "2026-09-01", hasta: "2026-09-30" },
      label: "Descargar este libro (Excel)",
    };
    const html = pintar(descarga);
    expect(botonesExcel).toEqual([descarga]);
    expect(html).toContain("Descargar este libro (Excel)");
    pintar(null);
    expect(botonesExcel).toEqual([]);
  });

  it("un libro sin hojas lo dice (nunca una cuadrícula vacía que parezca un balance en ceros)", () => {
    const html = renderToStaticMarkup(<LibroExcel libro={{ ...LIBRO, hojas: [] }} />);
    expect(html).toContain("Este libro no tiene hojas.");
    expect(html).not.toContain("<table");
  });
});

describe("«Ver en pantalla»", () => {
  it("enlaza a la vista del libro con el periodo y se ve como botón", () => {
    const html = renderToStaticMarkup(
      <VerEnPantallaLink destino={{ tipo: "vuelatour", modo: "general" }} desde="2026-09-01" hasta="2026-09-30" />,
    );
    expect(html).toContain('href="/admin/reportes/balance?modo=general&amp;desde=2026-09-01&amp;hasta=2026-09-30"');
    expect(html).toContain("Ver en pantalla");
    expect(html).toContain("cursor-pointer");
    const avion = renderToStaticMarkup(
      <VerEnPantallaLink destino={{ tipo: "avion", avionId: UUID }} desde="2026-09-01" hasta="2026-09-30" />,
    );
    expect(avion).toContain(`href="/admin/reportes/balance?avion=${UUID}&amp;desde=2026-09-01&amp;hasta=2026-09-30"`);
  });
});

/** Cableado leído del fuente: las páginas arrastran el runtime de Next. */
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../../", rel), "utf8");

describe("cableado", () => {
  it("la página /admin/reportes/balance es dinámica, con maxDuration = 300, y pinta el libro con el helper", () => {
    const src = leer("app/admin/reportes/balance/page.tsx");
    expect(src).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(src).toMatch(/^export const maxDuration = 300;$/m);
    expect(src).toContain('from "@/components/admin/reportes/libro-excel"');
    expect(src).toContain("parametrosVistaBalance(sp, periodoDefaultVista(todayCancun()))");
    expect(src).toContain("errorVistaBalance(");
    expect(src).toContain("descargaVistaBalance(destino, desde, hasta, matricula)");
    expect(src).toContain("getBalanceAvionLibro(destino.avionId, desde, hasta)");
    expect(src).toContain("getBalanceGeneralLibro(desde, hasta, destino.modo)");
    // Cabecera de UNA línea (12-oct-2026, tarde): selector compacto, libro a
    // pantalla y la descripción larga en el tooltip del ícono, nunca como párrafo.
    expect(src).toContain(
      '<PeriodSelector initial={{ desde, hasta }} compacto etiquetaGrupo="Periodo del libro" />',
    );
    // El libro a pantalla y, desde el 13-oct-2026 (punto 5), la llegada desde
    // Conciliación: `?gasto=` validado, la `key` que remonta al cambiar de
    // periodo, avión o chip (y que un refresh conserva) y los chips que
    // conservan el gasto. Sin gasto no hay key y el libro es el de siempre.
    expect(src).toContain("const { destino, desde, hasta, gasto, ajustado } = parametrosVistaBalance(");
    const libroJsx = src.match(/<LibroExcel\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(libroJsx).toContain("key={claveSalto(gasto, libro) ?? undefined}");
    expect(libroJsx).toContain("libro={libro}");
    expect(libroJsx).toContain("descarga={descarga}");
    expect(libroJsx).toMatch(/\spantalla\s/);
    expect(libroJsx).toContain("gastoInicial={gasto ?? null}");
    expect(src).toContain('from "@/lib/admin/libro-vinculos"');
    expect(src).toContain('hrefVistaBalance({ tipo: "vuelatour", modo }, desde, hasta, { gasto })');
    expect(src).toContain("InformationCircleIcon");
    expect(src).toContain("title={ayuda}");
    expect(src).toContain("aria-label={ayuda}");
    // El ícono es enfocable (con teclado el lector lo anuncia; el `title` solo
    // sale con el ratón).
    expect(src).toContain("tabIndex={0}");
    // El offset del marco va por breakpoint (la cabecera envuelve en pantallas
    // angostas): tres líneas en el teléfono, dos desde `sm`, una desde `xl`; y
    // el valor de `xl` es el MISMO fallback que trae la regla del CSS.
    expect(src).toContain(
      "[--xl-pantalla-offset:297px] sm:[--xl-pantalla-offset:259px] xl:[--xl-pantalla-offset:221px]",
    );
    const fallback = leer("styles/libro-excel.css").match(/var\(--xl-pantalla-offset, (\d+)px\)/)?.[1];
    expect(fallback).toBeDefined();
    expect(src).toContain(`xl:[--xl-pantalla-offset:${fallback}px]`);
    expect(src).not.toMatch(/<p[^>]*>[\s\S]*?\{DESCRIPCION_VISTA_BALANCE\}/);
    expect(src).not.toContain("Tesorería · Reportes");
    expect(src).not.toMatch(/text-2xl|text-3xl/);
    expect(src).toContain("<TarjetaErrorCarga");
    // Un error de Next (redirect/notFound) nunca se traga.
    expect(src).toContain("if (esErrorDeNext(e)) throw e;");
  });

  it("Reportes y el selector de avión ofrecen «Ver en pantalla» con el mismo enlace", () => {
    const reportes = leer("app/admin/reportes/page.tsx");
    expect(reportes).toContain('from "@/components/admin/reportes/ver-en-pantalla-link"');
    expect(reportes).toContain('destino={{ tipo: "vuelatour", modo: libro.modo }}');
    const picker = leer("components/admin/reportes/aircraft-balance-picker.tsx");
    expect(picker).toContain('destino={{ tipo: "avion", avionId: avion.id }}');
    const link = leer("components/admin/reportes/ver-en-pantalla-link.tsx");
    expect(link).toContain("hrefVistaBalance(destino, desde, hasta)");
    expect(link).toContain("{ETIQUETA_VER_EN_PANTALLA}");
  });

  it("el cliente del API pega a las rutas nuevas del 0.0.68 sin caché", () => {
    const src = leer("lib/api/balance-libro-server.ts");
    expect(src).toContain('"/v1/aircraft/balance-general/libro"');
    expect(src).toContain("/balance/libro`");
    expect((src.match(/cache: "no-store"/g) ?? []).length).toBe(2);
  });
});

describe("LibroExcel: vista «pantalla» (12-oct-2026, tarde)", () => {
  const DESCARGA = {
    path: `/v1/aircraft/${UUID}/balance.xlsx`,
    filename: "balance-XB-PEV-2026-09-01-2026-09-30.xlsx",
    label: "Descargar este libro (Excel)",
  };

  it("con `pantalla` la raíz lleva xl-libro--pantalla y la barra gana «Pantalla completa» con nombre accesible y cursor-pointer, antes de la descarga", () => {
    const html = pintar(DESCARGA, true);
    // `zona-clara` siempre: el libro es una isla clara dentro del admin oscuro.
    expect(html).toMatch(/<div[^>]*class="xl-libro zona-clara xl-libro--pantalla"/);
    const boton = html.match(/<button[^>]*aria-label="Pantalla completa"[^>]*>/)?.[0];
    expect(boton).toBeDefined();
    expect(boton).toContain("cursor-pointer");
    // Bajo `sm` no se pinta (la barra de fórmulas del teléfono ya va justa).
    expect(boton).toMatch(/class="[^"]*\bhidden\b[^"]*\bsm:inline-flex\b/);
    // (y el `inline-flex` suelto del Button base se fue: solo queda el de `sm:`)
    expect(boton).not.toMatch(/class="[^"]*[\s"]inline-flex[\s"]/);
    expect(boton).toContain('type="button"');
    expect(boton).toContain('data-pantalla-completa="inactiva"');
    expect(html).toContain(ETIQUETA_PANTALLA_COMPLETA);
    // El botón vive en la barra de acciones, ANTES de la descarga.
    expect(html).toMatch(
      /class="xl-barra-acciones">[\s\S]*?aria-label="Pantalla completa"[\s\S]*?data-descarga="balance-XB-PEV-2026-09-01-2026-09-30\.xlsx"/,
    );
    expect(botonesExcel).toEqual([DESCARGA]);
  });

  it("sin la prop, ni la clase ni el botón (el libro de siempre)", () => {
    const html = pintar();
    expect(html).toContain('class="xl-libro zona-clara"');
    expect(html).not.toContain("xl-libro--pantalla");
    expect(html).not.toContain('aria-label="Pantalla completa"');
    expect(html).not.toContain("data-pantalla-completa");
  });
});

describe("styles/libro-excel.css: el alto del marco", () => {
  const css = leer("styles/libro-excel.css");

  it("la vista «pantalla» mide contra 100dvh con el offset documentado y un mínimo de 60vh; sin la prop, el marco de siempre", () => {
    expect(css).toMatch(
      /\.xl-libro--pantalla \.xl-marco\s*\{[^}]*max-height:\s*calc\(100dvh - var\(--xl-pantalla-offset, \d+px\)\);[^}]*min-height:\s*60vh;/,
    );
    // La cuenta del offset está escrita junto a la regla (de la barra superior
    // del shell a las pestañas) y cierra con el MISMO número que el fallback:
    // si se retoca uno sin el otro, esto lo dice.
    const fallback = css.match(/var\(--xl-pantalla-offset, (\d+)px\)/)?.[1];
    expect(fallback).toBeDefined();
    expect(css).toMatch(/barra superior del shell[\s\S]*?\.xl-pestanas[\s\S]*?⇒ /);
    expect(css).toContain(`⇒ ${fallback} px`);
    expect(css).toMatch(/^\.xl-marco\s*\{[^}]*max-height:\s*calc\(100vh - 290px\);[^}]*min-height:\s*360px;/m);
  });

  it("a pantalla completa el marco toma todo menos la barra de fórmulas y las pestañas", () => {
    expect(css).toMatch(/\.xl-libro:fullscreen \.xl-marco\s*\{[^}]*max-height:\s*calc\(100vh - \d+px - \d+px\);/);
    expect(css).toMatch(/\.xl-libro:fullscreen\s*\{[^}]*border:\s*0;/);
  });

  it("el marco sigue a la selección con scroll INSTANTÁNEO: `.xl-marco` declara scroll-behavior: auto y el smooth de globals.css es solo de `html`", () => {
    expect(css).toMatch(/^\.xl-marco\s*\{[^}]*scroll-behavior:\s*auto;/m);
    // Si alguien globalizara el `smooth` (p. ej. en `*`), el libro dejaría de
    // desplazarse como Excel y esta prueba lo diría.
    const globals = leer("app/globals.css");
    expect(globals).toMatch(/html \{[^}]*scroll-behavior: smooth/);
    expect(globals).not.toMatch(/\*\s*\{[^}]*scroll-behavior/);
    expect((globals.match(/scroll-behavior:\s*smooth/g) ?? []).length).toBe(1);
  });
});

describe("el marco sigue a la selección (cableado, 13-oct-2026)", () => {
  const src = leer("components/admin/reportes/libro-excel.tsx");

  it("el ref vive en el div .xl-marco (el contenedor con scroll), no en la raíz .xl-libro", () => {
    expect(src).toContain("const marco = useRef<HTMLDivElement>(null);");
    expect(src).toMatch(/<div\s+ref=\{marco\}\s+className=\{cn\("xl-marco"/);
    expect(src).not.toMatch(/<div\s+ref=\{raiz\}[^>]*xl-marco/);
  });

  it("UN solo camino para teclado, clic y llegada: `seleccionar` = setSeleccion + `desplazarMarcoA` (scrollParaVerCelda + asignación directa)", () => {
    // Desde el 13-oct-2026 (punto 5) el desplazamiento vive en
    // `desplazarMarcoA`, que usan `seleccionar` (teclado y clic) y la llegada
    // desde Conciliación; `seleccionar` sigue siendo setSeleccion + mover.
    const bloque = src.match(/const seleccionar = \(sel: Seleccion\) => \{([\s\S]*?)\n  \};/)?.[1];
    expect(bloque).toBeDefined();
    expect(bloque).toContain("setSeleccion(sel);");
    expect(bloque).toContain("desplazarMarcoA(sel);");
    const desplazar = src.match(/const desplazarMarcoA = \(sel: Seleccion\) => \{([\s\S]*?)\n  \};/)?.[1];
    expect(desplazar).toBeDefined();
    expect(desplazar).toContain("scrollParaVerCelda(vista, sel, el)");
    expect(desplazar).toContain("el.scrollLeft = destino.scrollLeft;");
    expect(desplazar).toContain("el.scrollTop = destino.scrollTop;");
    // Mover el marco no toca estado (la llegada lo llama desde un efecto).
    expect(desplazar).not.toMatch(/\bset[A-Z]/);
    // Una sola llamada en todo el archivo: la de `desplazarMarcoA`.
    expect((src.match(/scrollParaVerCelda\(/g) ?? []).length).toBe(1);
    // Flechas, PageUp/PageDown y Home/End pasan por ahí y conservan el
    // preventDefault; PageUp/PageDown saltan las filas que caben en el marco
    // de HOY y Ctrl/⌘ + Home/End van a las esquinas (revisión 13-oct-2026:
    // antes eran scroll nativo y la siguiente flecha devolvía el marco a la
    // celda activa).
    expect(src).toMatch(
      /if \(!vista \|\| !esTeclaNavegacionHoja\(e\.key\)\) return;\s*e\.preventDefault\(\);[\s\S]*?seleccionar\(\s*desplazarSeleccion\(vista, actual, e\.key, \{/,
    );
    expect(src).toContain(
      'filasPorPagina(vista, marco.current, actual.r, e.key === "PageUp" ? "arriba" : "abajo")',
    );
    expect(src).toContain("conControl: e.ctrlKey || e.metaKey,");
    expect(src).not.toContain("esTeclaFlecha(");
    // El clic en la celda también, DELEGADO en el <tbody> (revisión 14-oct-2026:
    // las filas son memo y no llevan manejadores): la celda sale del `data-ref`
    // de su <td> y va por `seleccionar`; nadie llama a setSeleccion desde el marcado.
    expect(src).toContain("<tbody onClick={alClicCuerpo}>");
    const clic = src.match(/const alClicCuerpo = \(e: MouseEvent<HTMLTableSectionElement>\) => \{([\s\S]*?)\n  \};/)?.[1];
    expect(clic).toBeDefined();
    expect(clic).toContain('e.target.closest("td")');
    expect(clic).toContain("e.currentTarget.contains(td)");
    expect(clic).toContain('coordenadaDeReferencia(td.dataset.ref ?? "")');
    expect(clic).toContain("if (sel) seleccionar(sel);");
    expect(clic).not.toMatch(/setSeleccion|scroll/);
    expect(src).not.toContain("onClick={() => setSeleccion(");
    // Cambiar de hoja sigue limpiando la selección (sin mover el marco).
    expect(src).toMatch(
      /const cambiarHoja = \(i: number\) => \{\s*setHojaSel\(\{ idx: i, nombre: libro\.hojas\[i\]\?\.nombre \?\? null \}\);\s*setSeleccion\(null\);/,
    );
  });

  it("instantáneo y en el manejador: sin scrollIntoView, sin animación suave y sin efecto alrededor del scroll", () => {
    expect(src).not.toContain("scrollIntoView");
    expect(src).not.toMatch(/behavior:\s*"smooth"/);
    expect(src).not.toMatch(/behavior:\s*"instant"/);
    expect(src).not.toContain("useLayoutEffect");
    // Efectos del archivo: el de `fullscreenchange` y el de LLEGADA (13-oct-2026,
    // punto 5), que solo llama al evento `alLlegar`. Ninguno toca el scroll ni
    // la selección en su cuerpo (con deps `[vista, seleccion]` el
    // router.refresh() de RefreshOnFocus volvería a saltar a la celda activa).
    const efectos = src.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
    expect(efectos.length).toBeGreaterThan(0);
    expect((src.match(/useEffect\(/g) ?? []).length).toBe(efectos.length);
    for (const efecto of efectos) {
      expect(efecto).not.toMatch(/scroll/i);
      expect(efecto).not.toContain("seleccion");
    }
  });

  it("la llegada desde Conciliación: inicializadores perezosos y UN efecto de llegada con useEffectEvent, sin setState", () => {
    // La hoja, la celda y la franja nacen en los inicializadores (también en el
    // servidor): ningún efecto les pone estado (`react-hooks/set-state-in-effect`).
    expect(src).toContain(
      "const [llegada] = useState(() => (gastoInicial ? llegadaAGasto(libro, gastoInicial) : null));",
    );
    // La hoja nace en el inicializador (posición y nombre: «Actualizar datos» la conserva por nombre).
    expect(src).toMatch(/useState\(\(\) => \{\s*const idx = llegada\?\.hallazgo\?\.hojaIdx \?\? 0;\s*return \{ idx, nombre: libro\.hojas\[idx\]\?\.nombre \?\? null \};/);
    expect(src).toMatch(
      /useState<Seleccion \| null>\(\(\) =>\s*llegada\?\.hallazgo \? \{ r: llegada\.hallazgo\.r, c: llegada\.hallazgo\.c \} : null,?\s*\)/,
    );
    expect(src).toMatch(/useState<FranjaGasto \| null>\(\(\) =>\s*llegada \? franjaDeLlegada\(llegada\) : null,?\s*\)/);
    // El evento de llegada: mueve el marco y nada más.
    expect((src.match(/useEffectEvent\(/g) ?? []).length).toBe(1);
    const alLlegar = src.match(/const alLlegar = useEffectEvent\(\(\) => \{([\s\S]*?)\n  \}\);/)?.[1];
    expect(alLlegar).toBeDefined();
    expect(alLlegar).toContain("desplazarMarcoA(");
    expect(alLlegar).not.toMatch(/\bset[A-Z]/);
    // Se dispara UNA vez al montar (deps vacías): un refresh no vuelve a saltar.
    expect(src).toMatch(/useEffect\(\(\) => \{\s*alLlegar\(\);\s*\}, \[\]\);/);
  });

  it("el marcado estático de la cuadrícula NO cambió: ref y onClick no se serializan", () => {
    const html = pintar();
    expect(html).toContain('class="xl-marco xl-cuadricula" tabindex="0" role="grid"');
    expect(html).not.toMatch(/scroll/i);
    expect(pintar(null, true)).not.toMatch(/scroll/i);
  });

  it("el cuadro de nombres y la barra de fórmulas son regiones vivas (polite, atómicas): el lector anuncia la celda y su valor al moverse", () => {
    const html = pintar();
    expect(html).toMatch(/<div class="xl-nombre"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>—<\/div>/);
    expect(html).toMatch(/<div class="xl-formula"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>/);
    // Solo esas dos: la cuadrícula no es región viva (anunciaría cada repintado).
    expect((html.match(/aria-live=/g) ?? []).length).toBe(2);
  });
});

describe("llegada desde Conciliación (13-oct-2026, punto 5): el libro abre en la celda del gasto", () => {
  const UUID_GASTO = "9e9e9e9e-0000-4000-8000-000000002549";
  // La hoja 2 «permisos» trae en D9 el MONTO de ese gasto (rol `fila`).
  const LIBRO_GASTO: LibroExcelJson = {
    ...LIBRO,
    vinculos_gasto: true,
    hojas: [
      LIBRO.hojas[0],
      {
        nombre: "permisos",
        pestana: null,
        cuadricula: true,
        inmovilizar: { filas: 1, columnas: 0 },
        max_fila: 9,
        max_col: 4,
        columnas: [],
        filas: [],
        combinadas: [],
        celdas: [
          { r: 1, c: 4, v: "MONTO MXN", t: "MONTO MXN" },
          {
            r: 9,
            c: 4,
            v: 2549,
            t: "2,549.00",
            s: 2,
            vinculos: [{ tipo: "gasto", id: UUID_GASTO, rol: "fila", monto_mxn: 2549, columna: "MONTO MXN" }],
          },
        ],
      },
    ],
  };
  const llegar = (libro: LibroExcelJson, gastoInicial?: string | null) =>
    renderToStaticMarkup(<LibroExcel libro={libro} pantalla gastoInicial={gastoInicial} />);

  it("el HTML del servidor ya trae la pestaña, la celda seleccionada y el cuadro de nombres", () => {
    const html = llegar(LIBRO_GASTO, UUID_GASTO);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>permisos/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>balance/);
    expect(html).toMatch(/<td[^>]*class="[^"]*\bxl-seleccionada\b[^"]*"[^>]*data-ref="D9"[^>]*>2,549\.00<\/td>/);
    expect((html.match(/xl-seleccionada/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<div class="xl-nombre"[^>]*>D9<\/div>/);
    expect(html).toContain('data-hoja="permisos"');
  });

  it("la franja verde va ANTES de la barra, con role=status, el texto del gasto y «Quitar aviso»", () => {
    const html = llegar(LIBRO_GASTO, UUID_GASTO);
    const franja = html.match(/<div class="xl-franja"[^>]*>[\s\S]*?<\/button><\/div>/)?.[0];
    expect(franja).toBeDefined();
    expect(html.indexOf('class="xl-franja"')).toBeLessThan(html.indexOf('class="xl-barra"'));
    // Primer hijo de `.xl-libro`.
    expect(html).toMatch(/<div[^>]*class="xl-libro[^"]*"[^>]*><div class="xl-franja"/);
    expect(franja).toContain('data-tono="ok"');
    expect(franja).toContain('role="status"');
    expect(franja).toContain(
      '<span class="xl-franja-texto">Gasto $2,549.00 MXN · hoja «permisos» · fila 9</span>',
    );
    expect(franja).toContain(
      'title="Celda del gasto que abriste desde Conciliación: Gasto $2,549.00 MXN · hoja «permisos» · fila 9"',
    );
    const boton = franja!.match(/<button[^>]*>/)?.[0] ?? "";
    expect(boton).toContain('aria-label="Quitar aviso"');
    expect(boton).toContain("cursor-pointer");
    expect(boton).toContain('type="button"');
    // `role=status` ya es región viva: las únicas `aria-live` siguen siendo las dos de la barra.
    expect((html.match(/aria-live=/g) ?? []).length).toBe(2);
  });

  it("el gasto no está: con la bandera, ámbar «no está en este libro»; sin ella, ámbar «falta actualizar el servidor»", () => {
    const ausente = "00000000-0000-4000-8000-000000000000";
    const conBandera = llegar(LIBRO_GASTO, ausente);
    expect(conBandera).toMatch(/<div class="xl-franja" data-tono="aviso" role="status"/);
    expect(conBandera).toContain(TEXTO_GASTO_NO_ENCONTRADO);
    // Sin celda: la primera pestaña y el cuadro de nombres vacío.
    expect(conBandera).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>balance/);
    expect(conBandera).not.toContain("xl-seleccionada");
    const sinBandera = llegar({ ...LIBRO_GASTO, vinculos_gasto: undefined }, ausente);
    expect(sinBandera).toMatch(/data-tono="aviso"/);
    expect(sinBandera).toContain(TEXTO_LIBRO_SIN_VINCULOS);
  });

  it("un id que no es uuid o ninguna prop ⇒ sin franja y la primera pestaña: el libro de siempre", () => {
    const siempre = renderToStaticMarkup(<LibroExcel libro={LIBRO_GASTO} pantalla />);
    for (const html of [llegar(LIBRO_GASTO, "nada"), llegar(LIBRO_GASTO, null), llegar(LIBRO_GASTO)]) {
      expect(html).not.toContain("xl-franja");
      expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>balance/);
      expect(html).toBe(siempre);
    }
  });
});

describe("styles/libro-excel.css: la franja del gasto", () => {
  const css = leer("styles/libro-excel.css");

  it("mide ALTO_FRANJA_PX y el marco le cede EXACTAMENTE eso mientras existe (`:has`), en pantalla y a pantalla completa", () => {
    expect(css).toMatch(new RegExp(`\\.xl-franja\\s*\\{[^}]*height:\\s*${ALTO_FRANJA_PX}px;`));
    expect(css).toMatch(
      new RegExp(
        `\\.xl-libro--pantalla:has\\(\\.xl-franja\\) \\.xl-marco\\s*\\{[^}]*max-height:\\s*calc\\(100dvh - var\\(--xl-pantalla-offset, \\d+px\\) - ${ALTO_FRANJA_PX}px\\);`,
      ),
    );
    expect(css).toMatch(
      new RegExp(
        `\\.xl-libro:fullscreen:has\\(\\.xl-franja\\) \\.xl-marco\\s*\\{[^}]*max-height:\\s*calc\\(100vh - 41px - 38px - ${ALTO_FRANJA_PX}px\\);`,
      ),
    );
    // A pantalla completa la franja no se encoge (columna flex).
    expect(css).toMatch(/\.xl-libro:fullscreen \.xl-pestanas,\s*\.xl-libro:fullscreen \.xl-franja\s*\{\s*flex:\s*none;/);
    expect(css).toMatch(/\.xl-franja\[data-tono="aviso"\]\s*\{/);
    expect(css).toMatch(/\.xl-franja-cerrar:focus-visible\s*\{[^}]*outline:/);
  });

  it("todo `var(--xl-pantalla-offset, N)` lleva el MISMO N y es el `xl:` de la página (la cuenta 297/259/221 no cambia)", () => {
    const ns = [...css.matchAll(/var\(--xl-pantalla-offset, (\d+)px\)/g)].map((m) => m[1]);
    expect(ns.length).toBe(2);
    expect(new Set(ns).size).toBe(1);
    const page = leer("app/admin/reportes/balance/page.tsx");
    expect(page).toContain(`xl:[--xl-pantalla-offset:${ns[0]}px]`);
    expect(page).toContain("[--xl-pantalla-offset:297px] sm:[--xl-pantalla-offset:259px]");
  });
});

describe("una celda inmovilizada con nota no se recorre (14-oct-2026)", () => {
  // Reporte del cliente con la captura del Balance general: los encabezados
  // con nota de la fila 2 («TOTAL PARA PROVEEDOR (PESOS)», «REMANENTE VENTA
  // MENOS COMPRA (PESOS)») bajaban «como un escalón» sobre las filas 3 y 4.
  // La regla de la nota les ponía `position: relative` (le ganaba al sticky
  // del panel fijo por ir después en la hoja) y su `top` en línea —el
  // desplazamiento del panel— los RECORRÍA en vez de anclarlos.
  const css = leer("styles/libro-excel.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
  const esPseudo = (sel: string) => /::?(after|before)\b/.test(sel);

  it("el marcado: la celda fija con nota lleva las dos clases y su desplazamiento en línea (por eso importa el CSS)", () => {
    const hoja = LIBRO.hojas[0];
    const libro: LibroExcelJson = {
      ...LIBRO,
      hojas: [{ ...hoja, celdas: [...hoja.celdas, { r: 2, c: 2, v: "TOTAL", t: "TOTAL", s: 1, n: "nota del encabezado" }] }],
    };
    const html = renderToStaticMarkup(<LibroExcel libro={libro} />);
    const td = html.match(/<td[^>]*>TOTAL<\/td>/)?.[0] ?? "";
    expect(td).toMatch(/class="[^"]*xl-fija-fila[^"]*xl-con-nota[^"]*"/);
    expect(td).toMatch(/style="[^"]*top:42px/);
    expect(td).toContain('title="nota del encabezado"');
  });

  it("la regla de la nota NO toca el position de una celda fija: el sticky manda y el triángulo se ancla igual", () => {
    const nota = reglas.filter(([sel, cuerpo]) => sel.includes(".xl-con-nota") && !esPseudo(sel) && /position\s*:/.test(cuerpo));
    expect(nota).toHaveLength(1);
    expect(nota[0][0]).toBe(".xl-celda.xl-con-nota:not(.xl-fija-fila):not(.xl-fija-col)");
    expect(nota[0][1]).toMatch(/position:\s*relative/);
    // El triángulo sigue siendo absoluto respecto a la celda (relative o sticky).
    expect(css).toMatch(/\.xl-celda\.xl-con-nota::after\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*0;/);
  });

  it("guardia del «escalón»: ninguna regla de celdas le cambia el position a una celda fija (solo sticky)", () => {
    const posicionan = reglas.filter(([sel, cuerpo]) => /\.xl-celda/.test(sel) && !esPseudo(sel) && /position\s*:/.test(cuerpo));
    expect(posicionan.some(([sel, c]) => /\.xl-fija-fila/.test(sel) && /position:\s*sticky/.test(c))).toBe(true);
    for (const [sel, cuerpo] of posicionan) {
      const valor = cuerpo.match(/position\s*:\s*([a-z-]+)/)?.[1];
      if (valor === "sticky") continue;
      expect(sel, `«${sel}» pone position: ${valor} y le ganaría al sticky de una celda inmovilizada`).toMatch(
        /:not\(\.xl-fija-fila\)/,
      );
      expect(sel, `«${sel}» pone position: ${valor} y le ganaría al sticky de una columna inmovilizada`).toMatch(
        /:not\(\.xl-fija-col\)/,
      );
    }
  });
});

describe("«Actualizar datos» junto a «Pantalla completa» (14-oct-2026)", () => {
  // Pedido del cliente: «un botón para refrescar la información sin que se
  // refresque toda la página… porque me mueve la celda que tengo
  // seleccionada cuando recargo toda la página».
  const DESCARGA_B = { path: "/v1/x", filename: "libro.xlsx", label: "Descargar este libro (Excel)" };

  it("con `pantalla`: botón con texto, nombre accesible, tooltip y cursor-pointer, ANTES de «Pantalla completa» y de la descarga", () => {
    const html = pintar(DESCARGA_B, true);
    const boton = html.match(/<button[^>]*data-actualizar-libro="listo"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(boton).toContain(`aria-label="${ETIQUETA_ACTUALIZAR_LIBRO}"`);
    expect(boton).toContain(`title="${TITULO_ACTUALIZAR_LIBRO}"`);
    expect(boton).toContain('type="button"');
    expect(boton).toContain("cursor-pointer");
    // Listo para pulsar: sin el ATRIBUTO disabled (las clases `disabled:` del Button base no cuentan).
    expect(boton).not.toMatch(/\sdisabled(=""|\s|>)/);
    // Bajo `sm` queda solo el ícono (el texto se esconde, el nombre accesible no).
    expect(boton).toMatch(/<span class="hidden sm:inline">Actualizar datos<\/span>/);
    expect(html).toMatch(
      /class="xl-barra-acciones">[\s\S]*?data-actualizar-libro="listo"[\s\S]*?aria-label="Pantalla completa"[\s\S]*?data-descarga="libro\.xlsx"/,
    );
  });

  it("sin la vista «pantalla» no hay botón (ni router)", () => {
    const html = pintar(DESCARGA_B, false);
    expect(html).not.toContain("data-actualizar-libro");
    expect(html).not.toContain(ETIQUETA_ACTUALIZAR_LIBRO);
  });

  it("cableado: refresh dentro de una transición (sin recargar la página), un clic a la vez, toast al terminar y la hoja por nombre", () => {
    const src = leer("components/admin/reportes/libro-excel.tsx");
    const boton = src.slice(src.indexOf("function BotonActualizarLibro"), src.indexOf("export function LibroExcel"));
    expect(boton).toMatch(/const router = useRouter\(\);/);
    expect(boton).toMatch(/const \[actualizando, iniciar\] = useTransition\(\);/);
    expect(boton).toMatch(/iniciar\(\(\) => \{\s*router\.refresh\(\);\s*\}\);/);
    expect(boton).toMatch(/if \(actualizando\) return;/);
    expect(boton).toMatch(/disabled=\{actualizando\}/);
    expect(boton).toMatch(/toast\.success\(TOAST_LIBRO_ACTUALIZADO\)/);
    // El toast solo para un refresh pedido con el botón (no el de RefreshOnFocus).
    expect(boton).toMatch(/if \(actualizando \|\| !pidioActualizar\.current\) return;/);
    // Nunca una recarga de página completa.
    expect(src).not.toMatch(/location\.reload|window\.location\s*=/);
    // `useRouter` solo vive en el botón (la vista sin «pantalla» no lo necesita).
    expect((src.match(/useRouter\(\)/g) ?? []).length).toBe(1);
    expect(src).toMatch(/\{pantalla \? <BotonActualizarLibro \/> : null\}/);
    // La hoja se resuelve por nombre al cambiar el libro.
    expect(src).toMatch(/const hojaIdx = resolverHojaIdx\(libro\.hojas, hojaSel\);/);
    expect(src).not.toMatch(/setHojaIdx/);
  });
});

describe("ajustar el ancho de las columnas como en Excel (14-oct-2026)", () => {
  // Pedido del cliente con la captura del Balance general («otros
  // movimientos»: la columna F cortaba «TUAs + extras con IVA · 2 concept…»):
  // «que si das doble clic entre las columnas se pueda abrir a lo ancho del
  // contenido para alcanzar a leer todo como lo hacemos con el excel».
  const src = leer("components/admin/reportes/libro-excel.tsx");
  /** Del texto `desde` hasta el primer `hasta` que le sigue (inclusive); "" si no está. */
  const tramo = (texto: string, desde: string, hasta: string) => {
    const i = texto.indexOf(desde);
    const j = i < 0 ? -1 : texto.indexOf(hasta, i);
    return i < 0 || j < 0 ? "" : texto.slice(i, j + hasta.length);
  };
  const letras = (html: string) => [...html.matchAll(/<th scope="col"[^>]*>[\s\S]*?<\/th>/g)].map((m) => m[0]);

  it("cada letra lleva en su borde derecho UNA manija: botón sin tab stop, con nombre accesible y title; también la columna inmovilizada", () => {
    const html = pintar();
    const ths = letras(html);
    expect(ths).toHaveLength(14); // A..N: el relleno mínimo de la hoja
    ths.forEach((th, i) => {
      const letra = letraColumna(i + 1);
      // La letra conserva su nombre (el lector no le suma el de la manija) y su
      // texto; detrás va la manija y nada más.
      expect(th).toMatch(new RegExp(`^<th scope="col"[^>]*aria-label="${letra}">${letra}<button `));
      expect(th).toContain(
        `>${letra}<button type="button" tabindex="-1" class="xl-manija" aria-label="${nombreManijaColumna(letra)}" title="${TITULO_MANIJA_COLUMNA}"></button></th>`,
      );
    });
    // A está inmovilizada: su letra sigue sticky con su `left` y lleva manija igual.
    expect(ths[0]).toMatch(/^<th scope="col" class="xl-fija-col" style="left:46px" aria-label="A">A<button /);
    expect(ths[0]).toContain('aria-label="Ajustar el ancho de la columna A"');
    // Ninguna en la esquina, en la numeración de filas ni en las celdas.
    expect((html.match(/class="xl-manija"/g) ?? []).length).toBe(14);
    expect(html).toContain('<th class="xl-esquina" aria-hidden="true"></th>');
    expect(html.slice(html.indexOf("<tbody>"))).not.toContain("xl-manija");
    // Sin tab stops nuevos: el único enfocable de la cuadrícula sigue siendo el marco.
    expect(html.match(/tabindex="(\d+)"/g)).toEqual(['tabindex="0"']);
  });

  it("el HTML del servidor es el de siempre con o sin `claveAnchos` (los anchos manuales arrancan vacíos) y los <col> son los del libro", () => {
    const sin = pintar();
    expect(renderToStaticMarkup(<LibroExcel libro={LIBRO} claveAnchos="general" />)).toBe(sin);
    expect(sin).toContain('<col style="width:215px"/>');
    expect(sin).toContain('<table class="xl-tabla" style="width:1093px">'); // 46 + 215 + 64 × 13
    // Fuera de un arrastre, la raíz no lleva la clase del arrastre.
    expect(sin).not.toContain("xl-libro--redimensionando");
  });

  it("cableado: doble clic ⇒ autoajuste, medido con la fuente REAL de cada celda en UN canvas; qué celdas cuentan y la regla de px son puras", () => {
    expect(src).toContain("onDoubleClick={() => autoajustarColumna(col.c)}");
    const auto = tramo(src, "const autoajustarColumna = (c: number) => {", "\n  };");
    expect(auto).not.toBe("");
    expect(auto).toContain("celdasParaAutoajuste(vista, c)");
    expect(auto).toContain("const estilo = getComputedStyle(td);");
    expect(auto).toContain("ctx.font = fuenteCanvas(estilo);");
    expect(auto).toContain("ctx.measureText(r).width");
    expect(auto).toContain("cajaPx: cajaHorizontalPx(estilo)");
    expect(auto).toContain("td.dataset.ref !== x.ref");
    // Sin contenido, la regla da null y la columna vuelve al ancho del libro; una
    // inmovilizada nunca llena el marco (revisión 14-oct-2026).
    expect(auto).toContain(
      "fijarAncho(c, anchoAutoajustePx(medidas, topeAnchoColumnaPx(vista, c, marco.current?.clientWidth ?? 0)));",
    );
    // UN solo canvas: se crea al primer doble clic y se reutiliza.
    expect((src.match(/createElement\("canvas"\)/g) ?? []).length).toBe(1);
    expect(auto).toContain('lienzo.current ??= document.createElement("canvas").getContext("2d");');
    // Activada con teclado o lector (detail 0) también ajusta; un clic suelto del ratón, no.
    expect(src).toContain("if (e.detail === 0) autoajustarColumna(col.c);");
  });

  it("cableado: arrastre con pointer capture y UN ancho por cuadro (regla pura), que no selecciona celda ni texto", () => {
    const manija = src.match(/<button\s+type="button"\s+tabIndex=\{-1\}\s+className="xl-manija"[\s\S]*?\/>/)?.[0] ?? "";
    for (const h of [
      "aria-label={nombreManijaColumna(col.letra)}",
      "title={TITULO_MANIJA_COLUMNA}",
      "onMouseDown={(e) => e.preventDefault()}",
      "onPointerDown={(e) => empezarArrastre(e, col)}",
      "onPointerMove={moverArrastre}",
      "onPointerUp={terminarArrastre}",
      "onPointerCancel={terminarArrastre}",
      "onLostPointerCapture={terminarArrastre}",
    ]) {
      expect(manija, h).toContain(h);
    }
    const empezar = tramo(src, "const empezarArrastre", "\n  };");
    expect(empezar).toContain("if (e.button !== 0) return;");
    expect(empezar).toContain("e.currentTarget.setPointerCapture(e.pointerId);");
    // Los límites se miden UNA vez, al empezar (revisión 14-oct-2026): la x
    // hasta el borde visible del marco y una fija nunca lo llena.
    expect(empezar).toMatch(
      /limitesArrastre\(vista, col\.c, \{\s*izquierdaPx: el\.getBoundingClientRect\(\)\.left,\s*clientLeft: el\.clientLeft,\s*clientWidth: el\.clientWidth,\s*\}\)/,
    );
    const mover = tramo(src, "const moverArrastre", "\n  };");
    expect(mover).toContain("a.cuadro ??= requestAnimationFrame(aplicarArrastre);");
    const aplicar = tramo(src, "const aplicarArrastre", "\n  };");
    expect(aplicar).toContain("anchoArrastrePx(a.anchoInicialPx, a.xInicial, a.x, a.limites)");
    expect(aplicar).toContain("if (px === a.aplicadoPx) return;");
    const terminar = tramo(src, "const terminarArrastre", "\n  };");
    expect(terminar).toContain("cancelAnimationFrame(a.cuadro)");
    expect(terminar).toContain("aplicarArrastre();");
    // Ni la manija ni el arrastre ni el autoajuste tocan la selección o el marco.
    const auto = tramo(src, "const autoajustarColumna", "\n  };");
    for (const bloque of [manija, empezar, mover, aplicar, terminar, auto]) {
      expect(bloque).not.toMatch(/seleccionar\(|setSeleccion|desplazarMarcoA|scroll/);
    }
  });

  it("cableado: el ancho NO recalcula celdas (cuadriculaHoja solo con hoja y libro; aplicarAnchos reusa las filas) y vive en estado por tipo de libro y hoja: sin localStorage ni efectos nuevos", () => {
    expect(src).toContain(
      "const vistaBase = useMemo(() => (hoja ? cuadriculaHoja(hoja, libro) : null), [hoja, libro]);",
    );
    expect(src).toMatch(
      /const vista = useMemo\(\s*\(\) => \(vistaBase \? aplicarAnchos\(vistaBase, anchosHoja\) : null\),\s*\[vistaBase, anchosHoja\],?\s*\);/,
    );
    expect((src.match(/cuadriculaHoja\(/g) ?? []).length).toBe(1);
    expect(src).toContain('const claveHoja = claveAnchosHoja(claveAnchos, hoja?.nombre ?? "");');
    expect(src).toMatch(/^ {2}claveAnchos = "",$/m);
    expect(src).toContain(
      "setAnchosManuales((prev) => ({ ...prev, [claveHoja]: conAnchoColumna(prev[claveHoja], c, px) }));",
    );
    // Se pierden al recargar: nada de almacenamiento del navegador (en el
    // CÓDIGO; el comentario que explica por qué no, sí lo nombra).
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    // Ningún efecto nuevo: siguen el de «Actualizar datos», el de pantalla
    // completa y el de llegada, y ninguno habla de anchos ni de desplazar.
    expect((src.match(/useEffect\(/g) ?? []).length).toBe(3);
    const efectos = src.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g) ?? [];
    expect(efectos).toHaveLength(3);
    for (const efecto of efectos) expect(efecto).not.toMatch(/ancho|arrastre|autoajust|scroll/i);
    // La tabla lleva el ref para medir (un ref no se serializa: el marcado no cambia).
    expect(src).toContain('<table ref={tabla} className="xl-tabla" style={{ width: vista.anchoTablaPx }}>');
  });

  it("la página pasa el TIPO de libro como `claveAnchos`", () => {
    const page = leer("app/admin/reportes/balance/page.tsx");
    const libroJsx = page.match(/<LibroExcel\b[\s\S]*?\/>/)?.[0] ?? "";
    expect(libroJsx).toContain("claveAnchos={claveAnchosVistaBalance(destino)}");
    expect(page).toContain("claveAnchosVistaBalance,");
  });

  it("CSS: la manija es absoluta DENTRO del <th> sticky (8 px en su borde derecho, col-resize, sin pan táctil); ninguna regla le cambia el position a un <th>; el arrastre pone col-resize en todo el libro", () => {
    const css = leer("styles/libro-excel.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const regla = css.match(/\.xl-manija\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(regla).toMatch(/position:\s*absolute;/);
    expect(regla).toMatch(/right:\s*-1px;/);
    expect(regla).toMatch(/width:\s*8px;/);
    expect(regla).toMatch(/cursor:\s*col-resize;/);
    expect(regla).toMatch(/touch-action:\s*none;/);
    // Las letras siguen sticky (y por eso son el bloque contenedor de la
    // manija): ninguna regla de <th> les pone otro position.
    const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
    const deTh = reglas.filter(([sel, cuerpo]) => /\bth\b/.test(sel) && /position\s*:/.test(cuerpo));
    expect(deTh.length).toBeGreaterThan(0);
    for (const [sel, cuerpo] of deTh) expect(cuerpo, sel).toMatch(/position:\s*sticky/);
    // Durante el arrastre: col-resize y sin seleccionar texto, y AL FINAL de la
    // hoja (les gana por orden a los cursores de celdas y pestañas).
    expect(css).toMatch(
      /\.xl-libro--redimensionando,\s*\.xl-libro--redimensionando \*\s*\{[^}]*cursor:\s*col-resize;[^}]*user-select:\s*none;[^}]*\}\s*$/,
    );
  });
});

describe("revisión 14-oct-2026 de la manija: filas fijas que no crecen, cuerpo memo y tope contra el marco", () => {
  const src = leer("components/admin/reportes/libro-excel.tsx");
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // «cobranza» en chico: inmovilizar A4 (filas 1–3 fijas); la 2 mide 30 pt = 40 px
  // y su encabezado con ajuste (estilo 1: bordes lrtb) tiene la fila 3 fija debajo.
  const LIBRO_FIJAS: LibroExcelJson = {
    ...LIBRO,
    hojas: [
      {
        nombre: "cobranza",
        pestana: null,
        cuadricula: true,
        inmovilizar: { filas: 3, columnas: 0 },
        max_fila: 5,
        max_col: 3,
        columnas: [],
        filas: [{ r: 2, alto: 30 }],
        combinadas: [],
        celdas: [
          { r: 2, c: 1, v: "TOTAL A COBRAR\nMXN", t: "TOTAL A COBRAR\nMXN", s: 1 },
          { r: 3, c: 1, v: "CLAVE", t: "CLAVE", s: 1 },
          { r: 5, c: 1, v: "se desplaza", t: "se desplaza", s: 1 },
        ],
      },
    ],
  };

  it("marcado: el encabezado con ajuste de una fila fija con otra fija debajo va en .xl-recorte (renglones completos, su alto menos sus bordes); la última fija y las que se desplazan, como siempre", () => {
    const html = renderToStaticMarkup(<LibroExcel libro={LIBRO_FIJAS} />);
    const td = (ref: string) => html.match(new RegExp(`<td[^>]*data-ref="${ref}"[^>]*>[\\s\\S]*?</td>`))?.[0] ?? "";
    const alto = 40 - 2 * GROSOR_BORDE_CELDA_PX;
    expect(td("A2")).toBe(
      td("A2").replace(/>[\s\S]*$/, "") +
        `><div class="xl-recorte" style="max-height:max(round(down, ${alto}px, 1lh), min(${alto}px, 1lh))">TOTAL A COBRAR\nMXN</div></td>`,
    );
    // La celda en sí no cambió: sus clases, su estilo y su `top` sticky.
    expect(td("A2")).toMatch(/^<td class="xl-celda xl-fija-fila" style="text-align:center;white-space:pre-wrap;overflow:hidden;[^"]*;top:42px" data-ref="A2">/);
    // La 3 (la ÚLTIMA fija, 22 + 20 + 40) pinta su texto tal cual.
    expect(td("A3")).toMatch(/top:82px" data-ref="A3">CLAVE<\/td>$/);
    expect(td("A5")).toMatch(/data-ref="A5">se desplaza<\/td>$/);
    expect((html.match(/class="xl-recorte"/g) ?? []).length).toBe(1);
    // El libro de las demás pruebas: su única fila con ajuste es la ÚLTIMA fija ⇒ ni un recorte.
    expect(pintar()).not.toContain("xl-recorte");
  });

  it("cableado: las filas son memo en DOS tramos (fijas y las que se desplazan), sin manejadores; comparan la fila por identidad y el `left` de las fijas por valor", () => {
    const tramoFila = sinComentarios(src.slice(src.indexOf("const TramoFila = memo("), src.indexOf("const FilaHoja = memo(")));
    const filaHoja = sinComentarios(src.slice(src.indexOf("const FilaHoja = memo("), src.indexOf("export function LibroExcel")));
    expect(tramoFila).toContain("const TramoFila = memo(");
    expect(filaHoja).toContain("const FilaHoja = memo(");
    expect(src).toMatch(
      /const mismasPropsFila = \(antes: PropsFilaHoja, ahora: PropsFilaHoja\) =>\s*antes\.fila === ahora\.fila &&\s*antes\.cSeleccionada === ahora\.cSeleccionada &&\s*mismasColumnasFijas\(antes\.fijas, ahora\.fijas\);/,
    );
    expect(filaHoja).toContain("}, mismasPropsFila);");
    expect(tramoFila).toContain(
      "(antes, ahora) => antes.desde === ahora.desde && antes.hasta === ahora.hasta && mismasPropsFila(antes, ahora),",
    );
    // El tramo que se desplaza no lee ningún `left`: arrastrar una fija no lo repinta.
    expect(filaHoja).toContain(
      '<TramoFila key="fijas" fila={fila} desde={0} hasta={nFijas} fijas={fijas} cSeleccionada={cFija} />',
    );
    expect(filaHoja).toMatch(
      /<TramoFila\s+key="libres"\s+fila=\{fila\}\s+desde=\{nFijas\}\s+hasta=\{fila\.celdas\.length\}\s+fijas=\{SIN_FIJAS\}/,
    );
    // Sin manejadores ni funciones: ninguna se queda con la `vista` de antes.
    for (const bloque of [tramoFila, filaHoja]) {
      expect(bloque).not.toMatch(/\bon[A-Z]\w*=/);
      expect(bloque).not.toMatch(/seleccionar|setSeleccion|scroll/);
    }
    // El cuerpo: cada fila recibe SU columna seleccionada (las demás, null) y las fijas de la vista de hoy.
    expect(src).toContain("const fijas = useMemo(() => vista?.columnas.filter((x) => x.fija) ?? [], [vista]);");
    expect(src).toMatch(
      /<FilaHoja\s+key=\{fila\.r\}\s+fila=\{fila\}\s+fijas=\{fijas\}\s+cSeleccionada=\{seleccion\?\.r === fila\.r \? seleccion\.c : null\}\s*\/>/,
    );
    // Ningún <td> se pinta fuera del tramo (un solo lugar arma las celdas).
    expect((sinComentarios(src).match(/<td\b/g) ?? []).length).toBe(1);
    expect(src).not.toContain("useCallback");
  });

  it("CSS: .xl-recorte recorta, y las cuentas del recorte valen: `.xl-celda` sin relleno vertical ni borde de arriba y con el de abajo de 1 px", () => {
    const css = leer("styles/libro-excel.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.xl-recorte\s*\{[^}]*display:\s*block;[^}]*overflow:\s*hidden;/);
    const celda = css.match(/^\.xl-celda\s*\{([^}]*)\}/m)?.[1] ?? "";
    expect(celda).toMatch(/padding:\s*0 3px;/);
    expect(celda).toMatch(new RegExp(`border-bottom:\\s*${GROSOR_BORDE_CELDA_PX}px solid`));
    // Ninguna regla de celdas les pone relleno vertical, borde de arriba o un borde de otro grosor.
    const reglas = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);
    for (const [sel, cuerpo] of reglas.filter(([s]) => /\.xl-celda/.test(s) && !/::?(after|before)\b/.test(s))) {
      expect(cuerpo, sel).not.toMatch(/padding-(top|bottom)|border-top|border(-bottom)?:\s*(?!1px)\d/);
    }
  });
});
