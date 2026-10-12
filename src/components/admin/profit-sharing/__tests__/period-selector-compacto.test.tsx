/**
 * `PeriodSelector` compacto (12-oct-2026, tarde): la variante de UNA línea de
 * la vista del balance en pantalla — sin Card, dos inputs de fecha con nombre
 * accesible (etiquetas solo para lectores de pantalla), separados por un
 * guion y sin atajos de mes — y que la variante de siempre sigue con su Card,
 * sus etiquetas visibles y sus atajos.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/reportes/balance",
}));
// El selector de mes arrastra las descargas del reparto (sesión del navegador,
// variables de entorno): aquí solo se registra si se montó.
vi.mock("@/components/admin/profit-sharing/mes-reporte-select", () => ({
  MesReporteSelect: () => <div data-mock="mes-reporte-select" />,
}));

const { PeriodSelector } = await import("../period-selector");

const P = { desde: "2026-09-01", hasta: "2026-09-30" };

const etiqueta = (id: string, texto: string) =>
  new RegExp(`<label(?=[^>]*for="${id}")[^>]*>${texto}</label>`);
const etiquetaSoloLectores = (id: string, texto: string) =>
  new RegExp(`<label(?=[^>]*class="[^"]*sr-only[^"]*")(?=[^>]*for="${id}")[^>]*>${texto}</label>`);
const input = (id: string, valor: string) =>
  new RegExp(`<input(?=[^>]*id="${id}")(?=[^>]*type="date")(?=[^>]*value="${valor}")[^>]*/?>`);

describe("PeriodSelector compacto", () => {
  it("sin Card, en UNA línea: dos inputs de fecha con nombre accesible y la etiqueta solo para lectores de pantalla", () => {
    const html = renderToStaticMarkup(<PeriodSelector initial={P} compacto />);
    expect(html).not.toContain('data-slot="card"');
    // El nombre del grupo es neutro («Periodo»: el componente es compartido);
    // cada pantalla pasa el suyo con `etiquetaGrupo`.
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Periodo"/);
    const conEtiqueta = renderToStaticMarkup(
      <PeriodSelector initial={P} compacto etiquetaGrupo="Periodo del libro" />,
    );
    expect(conEtiqueta).toMatch(/<div[^>]*role="group"[^>]*aria-label="Periodo del libro"/);
    expect(html).toMatch(etiquetaSoloLectores("periodo-desde", "Periodo desde"));
    expect(html).toMatch(etiquetaSoloLectores("periodo-hasta", "Periodo hasta"));
    expect(html).toMatch(input("periodo-desde", "2026-09-01"));
    expect(html).toMatch(input("periodo-hasta", "2026-09-30"));
    expect((html.match(/<input/g) ?? []).length).toBe(2);
    // Chicos y de ancho fijo, con el guion entre los dos. 16 px en el celular
    // (iOS Safari hace zoom al enfocar un campo con letra menor) y 12 px desde md.
    expect(html).toMatch(/<input[^>]*class="[^"]*w-\[9\.5rem\][^"]*"/);
    expect(html).toMatch(/<input[^>]*class="[^"]*\btext-base\b[^"]*\bmd:text-xs\b[^"]*"/);
    expect(html).not.toMatch(/<input[^>]*class="[^"]*\bmd:text-sm\b/);
    expect(html).toContain("–");
  });

  it("ignora los atajos de mes: ni «Mes pasado» ni el selector de mes", () => {
    const html = renderToStaticMarkup(
      <PeriodSelector initial={P} compacto atajoMesPasado hoy="2026-10-12" />,
    );
    expect(html).not.toContain("Mes pasado");
    expect(html).not.toContain('data-mock="mes-reporte-select"');
  });

  it("sin la prop, el selector de siempre: Card, etiquetas visibles y los atajos cuando se piden", () => {
    const html = renderToStaticMarkup(<PeriodSelector initial={P} />);
    expect(html).toContain('data-slot="card"');
    expect(html).toMatch(etiqueta("periodo-desde", "Periodo desde"));
    expect(html).toMatch(etiqueta("periodo-hasta", "Periodo hasta"));
    expect(html).toMatch(input("periodo-desde", "2026-09-01"));
    expect(html).not.toContain("sr-only");
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain("w-[9.5rem]");
    const conAtajos = renderToStaticMarkup(
      <PeriodSelector initial={P} atajoMesPasado hoy="2026-10-12" />,
    );
    expect(conAtajos).toContain("Mes pasado");
    expect(conAtajos).toContain('data-mock="mes-reporte-select"');
  });
});
