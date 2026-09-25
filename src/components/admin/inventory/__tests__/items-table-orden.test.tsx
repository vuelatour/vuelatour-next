/**
 * Orden de la tabla de Inventario (24-sep-2026). La lógica pura vive en
 * `lib/admin/__tests__/inventario-orden.test.ts`; aquí se cuida el MARCADO:
 * encabezados clicables con flecha y `aria-sort`, atajos visibles con el
 * activo resaltado, y —lo que pidió el cliente— que lo que se acaba salga en
 * la PRIMERA página aunque alfabéticamente esté en la última (el orden se
 * aplica a la bodega completa, no a la página visible).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { InventarioItemWithStock } from "@/types/inventory";

// Las acciones por fila (menú, diálogos, server actions) no son parte de
// este test: se sustituyen por un marcador.
vi.mock("@/components/admin/inventory/item-actions", () => ({
  ItemActions: () => null,
}));

// La URL VIVA (`useSearchParams`) manda sobre `ordenInicial`: al volver del
// detalle con router.back() Next reusa el payload viejo de la página. `null`
// = sin router (respaldo a `ordenInicial`).
let urlActual: URLSearchParams | null = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => urlActual,
}));

const { ItemsTable } = await import("../items-table");

const item = (
  id: string,
  nombre: string,
  stock: number,
  extra: Partial<InventarioItemWithStock> = {},
): InventarioItemWithStock => ({
  id,
  nombre,
  numero_parte: null,
  codigo: null,
  categoria: "Aceites",
  stock_minimo: null,
  unidad: "pieza",
  ubicacion: null,
  notas: null,
  activo: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  stock,
  valor_usd: 0,
  costo_fifo_actual: 0,
  valor_mxn: 0,
  costo_fifo_mxn_actual: 0,
  bajo_stock: false,
  ganancia_mxn: null,
  ...extra,
});

// 30 productos «Producto 01…30» con 50 piezas cada uno, más uno que se está
// acabando y que alfabéticamente cae al FINAL (página 2 con 20 filas).
const BODEGA: InventarioItemWithStock[] = [
  ...Array.from({ length: 30 }, (_, i) =>
    item(`p${i}`, `Producto ${String(i + 1).padStart(2, "0")}`, 50),
  ),
  item("zz", "Zeta aceite W80", 1, { bajo_stock: true, stock_minimo: 4 }),
];

type Orden = NonNullable<Parameters<typeof ItemsTable>[0]["ordenInicial"]>;

const pintar = (ordenInicial?: Orden) =>
  renderToStaticMarkup(
    <ItemsTable
      items={BODEGA}
      aircraft={[]}
      providers={[]}
      categorias={["Aceites"]}
      ordenInicial={ordenInicial}
    />,
  );

/** Pinta con `?orden=` en la URL (como llega en el panel). */
const render = (orden?: Orden) => {
  urlActual = new URLSearchParams(orden ? { orden } : {});
  return pintar(orden);
};

describe("ItemsTable · orden", () => {
  it("default A–Z: el que se acaba queda fuera de la primera página", () => {
    const html = render();
    expect(html).toContain("Producto 01");
    expect(html).not.toContain("Zeta aceite W80");
  });

  it("«Se están acabando primero»: el «Bajo» sale ARRIBA de la primera página", () => {
    const html = render("se-acaban");
    expect(html).toContain("Zeta aceite W80");
    expect(html.indexOf("Zeta aceite W80")).toBeLessThan(html.indexOf("Producto 01"));
  });

  it("atajos visibles con el activo marcado (aria-pressed) y cursor-pointer", () => {
    const html = render("se-acaban");
    expect(html).toContain("Ordenar:");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Se están acabando primero</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>A–Z</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Más stock</);
    const botones = html.match(/<button[^>]*aria-pressed[^>]*>/g) ?? [];
    expect(botones).toHaveLength(3);
    for (const b of botones) expect(b).toContain("cursor-pointer");
  });

  it("encabezados ordenables: aria-sort y botón con cursor-pointer", () => {
    const html = render("stock-desc");
    const ths = html.match(/<th[^>]*aria-sort="[a-z]+"[^>]*>/g) ?? [];
    // Producto, Categoría, Stock, Ganancia (acciones no ordena).
    expect(ths).toHaveLength(4);
    expect(html.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(html.match(/aria-sort="none"/g)).toHaveLength(3);
    const headBtns = html.match(/<th[^>]*aria-sort[^>]*><button[^>]*>/g) ?? [];
    expect(headBtns).toHaveLength(4);
    for (const b of headBtns) expect(b).toContain("cursor-pointer");
  });

  it("al VOLVER del detalle manda la URL, no el `ordenInicial` viejo del payload reusado", () => {
    // Primera carga sin `?orden=` (ordenInicial = A–Z); el operador eligió
    // «Se están acabando» (replaceState) y regresó con «Inventario».
    urlActual = new URLSearchParams({ orden: "se-acaban", tq: "", tp: "1" });
    const html = pintar("nombre");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Se están acabando primero</);
    expect(html.indexOf("Zeta aceite W80")).toBeGreaterThan(-1);
    expect(html.indexOf("Zeta aceite W80")).toBeLessThan(html.indexOf("Producto 01"));
  });

  it("URL con `?orden=` fuera de catálogo ⇒ A–Z (enlace viejo no rompe)", () => {
    urlActual = new URLSearchParams({ orden: "stock;drop" });
    const html = pintar("se-acaban");
    expect(html).toMatch(/aria-pressed="true"[^>]*>A–Z</);
    expect(html).not.toContain("Zeta aceite W80");
  });

  it("sin router (useSearchParams null) usa `ordenInicial` de respaldo", () => {
    urlActual = null;
    const html = pintar("se-acaban");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Se están acabando primero</);
  });

  it("orden por Producto A–Z marca su columna ascendente", () => {
    const html = render("nombre");
    expect(html.match(/aria-sort="ascending"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>A–Z</);
  });
});
