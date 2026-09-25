/**
 * Tarjeta «Utilidad de la tienda» (25-sep-2026): pesos y dólares POR
 * SEPARADO, unidades y margen, chips de periodo que conservan lo demás de la
 * URL viva y respaldo con las sumas de la lista si `tienda/resumen` no
 * contestó. Cifras reales tras el re-precio del 01-sep (contrato §5.5).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TiendaResumen } from "@/types/inventory";

let urlActual = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => urlActual }));
// El botón de Excel descarga con la sesión del navegador: fuera del test,
// pero se registra con qué parámetros se pintó.
const excelQueries: Array<Record<string, string | undefined>> = [];
vi.mock("@/components/admin/excel-export-button", () => ({
  ExcelExportButton: ({ query }: { query?: Record<string, string | undefined> }) => {
    excelQueries.push(query ?? {});
    return null;
  },
}));

const { UtilidadTiendaCard } = await import("../utilidad-tienda-card");

const TIENDA: TiendaResumen = {
  periodo: null,
  margen_venta_pct: 25,
  utilidad_mxn: null,
  utilidad_usd: 535.35,
  ventas_mxn: null,
  ventas_usd: 2676.68,
  costo_ventas_mxn: null,
  costo_ventas_usd: 2141.33,
  unidades_cargadas: 78,
  unidades_vendidas: 48,
  productos_con_ventas: 8,
  ventas_sin_utilidad: 0,
  con_entradas_sin_costo: false,
};

const RESPALDO = {
  utilidad_mxn: 1200,
  utilidad_usd: 12.5,
  unidades_vendidas: 3,
  ventas_sin_utilidad: 0,
  con_entradas_sin_costo: false,
};

describe("UtilidadTiendaCard", () => {
  it("cifra en dólares (535.35) con 48 unidades vendidas y el margen", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={TIENDA}
        respaldo={RESPALDO}
        periodo="todo"
        rango={null}
        ubicacionesIds={null}
      />,
    );
    expect(html).toContain("Utilidad de la tienda");
    expect(html).toContain("+$535.35 USD");
    expect(html).not.toContain("MXN");
    expect(html).toContain("48 unidades vendidas a aviones · margen 25 % sobre el costo");
    expect(html).toContain("se cambia en Configuración");
  });

  it("API 0.0.36: cifra grande en PESOS (9,105.07) y, tenue, «≈ +$535.35 USD al T.C. de cada venta»", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={{
          ...TIENDA,
          utilidad_mxn: 9105.07,
          utilidad_usd: null,
          ventas_mxn: 45524.17,
          ventas_usd: null,
          costo_ventas_mxn: 36419.1,
          costo_ventas_usd: null,
          ventas_usd_original: 2676.68,
          costo_ventas_usd_original: 2141.33,
          utilidad_usd_original: 535.35,
          regla_costo: "ULTIMO_PRECIO",
        }}
        respaldo={RESPALDO}
        periodo="todo"
        rango={null}
        ubicacionesIds={null}
      />,
    );
    expect(html).toMatch(/text-2xl[^"]*">\+\$9,105\.07 MXN</);
    expect(html).toContain("≈ +$535.35 USD al T.C. de cada venta");
    // El dólar original es texto tenue, jamás otra cifra grande ni una suma.
    expect(html).not.toMatch(/text-2xl[^"]*">\+\$535\.35 USD</);
    expect(html).not.toContain("9,640.42");
    expect(html).toContain("Las ventas en dólares se convierten a pesos con el T.C. oficial de su día.");
    expect(html).not.toMatch(/FIFO/);
  });

  it("respaldo de la lista con el API 0.0.36: pesos + la línea del dólar original", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={null}
        respaldo={{
          ...RESPALDO,
          utilidad_mxn: 9105.07,
          utilidad_usd: null,
          utilidad_usd_original: 535.35,
          enPesos: true,
        }}
        periodo="todo"
        rango={null}
        ubicacionesIds={null}
      />,
    );
    expect(html).toContain("+$9,105.07 MXN");
    expect(html).toContain("≈ +$535.35 USD al T.C. de cada venta");
  });

  it("MXN y USD por separado (jamás sumados) y respaldo de la lista si no hubo resumen", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={null}
        respaldo={RESPALDO}
        periodo="mes"
        rango={{ desde: "2026-09-01", hasta: "2026-09-25" }}
        margenVentaPct={25}
        ubicacionesIds={null}
      />,
    );
    expect(html).toContain("+$1,200.00 MXN");
    expect(html).toContain("+$12.50 USD");
    expect(html).toContain("3 unidades vendidas a aviones");
  });

  it("chips de periodo: conservan orden/filtro/búsqueda de la URL viva, sueltan la página, marcan el activo", () => {
    urlActual = new URLSearchParams({ orden: "utilidad-desc", ubic: "sin", tq: "aceite", tp: "3" });
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard resumen={TIENDA} respaldo={RESPALDO} periodo="mes" rango={null} ubicacionesIds={[]} />,
    );
    expect(html).toContain('href="/admin/inventory?orden=utilidad-desc&amp;ubic=sin&amp;tq=aceite"');
    expect(html).toContain(
      'href="/admin/inventory?orden=utilidad-desc&amp;ubic=sin&amp;tq=aceite&amp;periodo=mes-anterior"',
    );
    expect(html).toMatch(/aria-current="true"[^>]*>Este mes</);
    const chips = html.match(/<a[^>]*>(Todo|Este mes|Mes pasado)<\/a>/g) ?? [];
    expect(chips).toHaveLength(3);
    for (const c of chips) expect(c).toContain("cursor-pointer");
  });

  it("el Excel lleva el periodo y SOLO con catálogo el filtro de ubicación vigente", () => {
    urlActual = new URLSearchParams({ ubic: "c2" });
    excelQueries.length = 0;
    renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={TIENDA}
        respaldo={RESPALDO}
        periodo="mes"
        rango={{ desde: "2026-09-01", hasta: "2026-09-25" }}
        ubicacionesIds={["c1", "c2"]}
      />,
    );
    renderToStaticMarkup(
      <UtilidadTiendaCard resumen={TIENDA} respaldo={RESPALDO} periodo="todo" rango={null} ubicacionesIds={null} />,
    );
    expect(excelQueries[0]).toEqual({ desde: "2026-09-01", hasta: "2026-09-25", ubicacion: "c2" });
    // Sin catálogo (API previo): jamás se manda `ubicacion` (sería un 400).
    expect(excelQueries[1]).toEqual({ desde: undefined, hasta: undefined, ubicacion: undefined });
  });

  it("avisos: ventas no calculables y entradas sin costo", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <UtilidadTiendaCard
        resumen={{ ...TIENDA, ventas_sin_utilidad: 2, con_entradas_sin_costo: true }}
        respaldo={RESPALDO}
        periodo="todo"
        rango={null}
        ubicacionesIds={null}
      />,
    );
    expect(html).toContain("2 ventas en pesos sobre costo en dólares sin tipo de cambio");
    expect(html).toContain("Hay entradas sin costo");
  });
});
