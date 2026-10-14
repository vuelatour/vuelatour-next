import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CABLEADO del ID de vuelo por cliente (13-oct-2026, API 0.0.75). Lo que se
 * custodia: las páginas pasan `clave_cliente` del API TAL CUAL (nunca lo
 * recalculan), las cabeceras ponen el chip JUNTO al h1 (no dentro: el título
 * sigue siendo el folio), la barra de Cotizaciones anuncia la búsqueda por
 * ID, las tres tablas lo buscan y NADIE en el panel arma un ID
 * (alias + consecutivo): esa cuenta vive solo en el API.
 */

const SRC = fileURLToPath(new URL("../../../", import.meta.url));
const leer = (...partes: string[]) => readFileSync(join(SRC, ...partes), "utf8");

/** Generado por `npm run gen:api-types` (espejo del Swagger, no código del panel). */
const GENERADOS = new Set([join("types", "api.ts")]);

/** Todos los .ts/.tsx de src/ fuera de las pruebas y de lo generado. */
function fuentes(dir = SRC): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "__tests__") continue;
      out.push(...fuentes(ruta));
    } else if (/\.(ts|tsx)$/.test(nombre) && !GENERADOS.has(relative(SRC, ruta))) {
      out.push(ruta);
    }
  }
  return out;
}

/** El fragmento entre `</h1>` y el siguiente elemento (solo espacio o comentario JSX). */
function trasElH1(src: string, chip: string): void {
  const h1 = src.indexOf("</h1>");
  const pos = src.indexOf(chip);
  expect(h1).toBeGreaterThan(-1);
  expect(pos).toBeGreaterThan(h1);
  const entre = src.slice(h1 + "</h1>".length, pos);
  expect(entre.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim()).toBe("");
  // Y NO dentro del h1.
  const abre = src.lastIndexOf("<h1", h1);
  expect(src.slice(abre, h1)).not.toContain("ClaveCliente");
}

describe("ID de vuelo por cliente: cableado", () => {
  it("las páginas mapean la clave del API tal cual", () => {
    expect(leer("app", "admin", "flights", "page.tsx")).toContain(
      "clave_cliente: v.clave_cliente ?? null",
    );
    expect(leer("app", "admin", "quotes", "page.tsx")).toContain(
      "claveCliente: q.clave_cliente ?? null",
    );
  });

  it("el chip copiable va JUSTO DESPUÉS del h1 del vuelo y de la cotización", () => {
    const vuelo = leer("app", "admin", "flights", "[id]", "page.tsx");
    expect(vuelo).toContain('from "@/components/admin/clave-cliente"');
    trasElH1(vuelo, "<ClaveClienteCabecera clave={snapshot.clave_cliente} />");
    const cotizacion = leer("components", "admin", "quotes", "quote-workspace.tsx");
    expect(cotizacion).toContain('from "@/components/admin/clave-cliente"');
    trasElH1(cotizacion, "<ClaveClienteCabecera clave={quote.clave_cliente} />");
  });

  it("la barra de Cotizaciones anuncia la búsqueda por ID", () => {
    const barra = leer("components", "admin", "quotes", "quotes-filter-bar.tsx");
    expect(barra).toContain("placeholder={PLACEHOLDER_BARRA_COTIZACIONES}");
    expect(barra).not.toContain('placeholder="Cliente, folio, ruta IATA…"');
  });

  it("las tres tablas pintan la línea del ID y la incluyen en su searchText", () => {
    const vuelos = leer("components", "admin", "flights", "flights-table.tsx");
    expect(vuelos).toContain("<ClaveClienteLinea clave={v.clave_cliente} />");
    expect(vuelos).toMatch(/searchText=\{\(v\) =>[\s\S]*?\$\{v\.clave_cliente \?\? ""\}`/);
    expect(vuelos).toContain("searchPlaceholder={PLACEHOLDER_BUSCAR_VUELOS}");

    const cotizaciones = leer("components", "admin", "quotes", "quotes-table.tsx");
    expect(cotizaciones).toContain("<ClaveClienteLinea clave={q.claveCliente} />");
    expect(cotizaciones).toMatch(/searchText=\{\(q\) =>[\s\S]*?\$\{q\.claveCliente \?\? ""\}`/);
    expect(cotizaciones).toContain("searchPlaceholder={PLACEHOLDER_BUSCAR_COTIZACIONES}");

    const avion = leer("components", "admin", "aircraft", "aircraft-flights-table.tsx");
    expect(avion).toContain("<ClaveClienteLinea clave={f.clave_cliente} />");
    expect(avion).toMatch(/searchText=\{\(f\) =>[^\n]*\$\{f\.clave_cliente \?\? ""\}`/);
    expect(avion).toContain("searchPlaceholder={PLACEHOLDER_BUSCAR_VUELOS_AVION}");
  });

  it("NADIE en el panel arma el ID: sin consecutivo, sin padStart con alias, sin clave por plantilla", () => {
    const archivos = fuentes();
    expect(archivos.length).toBeGreaterThan(100);
    const culpables: string[] = [];
    for (const ruta of archivos) {
      const src = readFileSync(ruta, "utf8");
      const rel = relative(SRC, ruta);
      // El número de vuelo del cliente NUNCA llega al panel.
      if (/consecutivo_cliente|consecutivoCliente/.test(src)) culpables.push(`${rel}: consecutivo`);
      // alias + número con relleno = armar el ID a mano.
      for (const linea of src.split("\n")) {
        if (/padStart\(/.test(linea) && /alias/i.test(linea)) culpables.push(`${rel}: padStart con alias`);
      }
      // La clave se ASIGNA desde el API, nunca desde una plantilla.
      if (/clave_?[cC]liente\s*[:=]\s*`/.test(src)) culpables.push(`${rel}: clave por plantilla`);
    }
    expect(culpables).toEqual([]);
    // La fuente de textos no rellena números (su DDMMAA sale de 'YYYY-MM-DD').
    expect(leer("lib", "admin", "clave-cliente.ts")).not.toContain("padStart");
  });
});
