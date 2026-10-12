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

function pintar(descarga?: { path: string; filename: string; query?: Record<string, string>; label: string } | null) {
  botonesExcel.length = 0;
  return renderToStaticMarkup(<LibroExcel libro={LIBRO} descarga={descarga} />);
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
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>A<\/th>/);
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>N<\/th>/); // relleno mínimo de 14 columnas
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>40<\/th>/); // y de 40 filas
    expect(html).toContain('style="height:51px"');
    expect(html).toContain('style="height:20px"');
    expect(html).toContain('class="xl-marco xl-cuadricula"');
  });

  it("paneles inmovilizados: 2 filas y 1 columna fijas con su desplazamiento", () => {
    const html = pintar();
    expect(html).toMatch(/<th[^>]*xl-fija-col[^>]*style="left:46px"[^>]*>A<\/th>/);
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
    expect(src).toContain("<PeriodSelector initial={{ desde, hasta }} />");
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
