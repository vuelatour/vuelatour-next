/**
 * Orden de la tabla de Inventario (24-sep-2026). La lógica pura vive en
 * `lib/admin/__tests__/inventario-orden.test.ts`; aquí se cuida el MARCADO:
 * encabezados clicables con flecha y `aria-sort`, atajos visibles con el
 * activo resaltado, y —lo que pidió el cliente— que lo que se acaba salga en
 * la PRIMERA página aunque alfabéticamente esté en la última (el orden se
 * aplica a la bodega completa, no a la página visible).
 *
 * 25-sep-2026: columnas Producto · Categoría · Stock · Utilidad · Ubicación
 * · ⋯, `?orden=ganancia` (enlace viejo) ordena por Utilidad, y el filtro /
 * «Mover a…» de ubicación.
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
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
// Las server actions (red, sesión) no son parte de este test.
vi.mock("@/app/admin/inventory/actions", () => ({
  moverUbicacionAction: vi.fn(),
  crearUbicacionAction: vi.fn(),
  actualizarUbicacionAction: vi.fn(),
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
    // Producto, Categoría, Stock, Utilidad, Ubicación (acciones no ordena).
    expect(ths).toHaveLength(5);
    expect(html.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(html.match(/aria-sort="none"/g)).toHaveLength(4);
    const headBtns = html.match(/<th[^>]*aria-sort[^>]*><button[^>]*>/g) ?? [];
    expect(headBtns).toHaveLength(5);
    for (const b of headBtns) expect(b).toContain("cursor-pointer");
  });

  it("columnas en el orden del cliente: Producto · Categoría · Stock · Utilidad · Ubicación", () => {
    const html = render();
    const heads = ["Producto", "Categoría", "Stock", "Utilidad", "Ubicación"].map((h) =>
      html.indexOf(`>${h}<`),
    );
    for (const i of heads) expect(i).toBeGreaterThan(-1);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
    expect(html).not.toContain("Ganancia / pérdida");
    expect(html).not.toContain("Producto (item)");
  });

  it("`?orden=ganancia` (enlace viejo) ordena por Utilidad ↓", () => {
    urlActual = new URLSearchParams({ orden: "ganancia-desc" });
    const conUtilidad = [
      ...BODEGA,
      item("u1", "Aceite 15W-50", 84, { utilidad_mxn: null, utilidad_usd: 191.25 }),
    ];
    const html = renderToStaticMarkup(
      <ItemsTable items={conUtilidad} aircraft={[]} providers={[]} categorias={["Aceites"]} />,
    );
    // La columna Utilidad es la que ordena (descendente) y el aceite, el único
    // con utilidad, sale arriba de la primera página.
    expect(html).toMatch(/aria-sort="descending"[^>]*><button[^>]*>Utilidad/);
    expect(html.indexOf("Aceite 15W-50")).toBeLessThan(html.indexOf("Producto 01"));
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

describe("ItemsTable · utilidad y ubicación", () => {
  const CATALOGO = [
    { id: "c1", nombre: "Oficina vieja", orden: 1, activo: true, productos: 0, created_at: "", updated_at: "" },
    { id: "c2", nombre: "Oficina nueva", orden: 2, activo: true, productos: 1, created_at: "", updated_at: "" },
  ];
  const ITEMS: InventarioItemWithStock[] = [
    item("a", "Aceite 15W-50", 84, {
      utilidad_mxn: null,
      utilidad_usd: 191.25,
      salidas_cant: 66,
      ventas_cant: 36,
      ubicacion: "Bodega Cancún",
      ubicacion_id: null,
      ubicacion_legado: "Bodega Cancún",
    }),
    item("b", "Balata 66-105", 8, {
      utilidad_mxn: 120,
      utilidad_usd: 23.13,
      ubicacion: "Oficina nueva",
      ubicacion_id: "c2",
      ubicacion_nombre: "Oficina nueva",
    }),
    item("c", "Cinta", 3, { ubicacion: null, ubicacion_id: null }),
  ];
  const pintarCon = (props: Partial<Parameters<typeof ItemsTable>[0]> = {}) =>
    renderToStaticMarkup(
      <ItemsTable items={ITEMS} aircraft={[]} providers={[]} categorias={[]} {...props} />,
    );

  it("Utilidad: una línea por moneda, jamás sumadas; «—» sin ventas; tooltip con unidades y margen", () => {
    urlActual = new URLSearchParams();
    const html = pintarCon({ margenVentaPct: 25 });
    expect(html).toContain("+$191.25 USD");
    expect(html).toContain("+$120.00 MXN");
    expect(html).toContain("+$23.13 USD");
    expect(html).toContain(
      "66 unidades cargadas a aviones (30 a costo, sin utilidad) · margen vigente 25 % sobre el costo",
    );
  });

  it("API 0.0.36: la celda en PESOS y el dólar original SOLO en el tooltip (jamás sumado)", () => {
    urlActual = new URLSearchParams();
    const html = renderToStaticMarkup(
      <ItemsTable
        items={[
          item("a", "Aceite 15W-50", 84, {
            utilidad_mxn: 3252.72,
            utilidad_usd: null,
            utilidad_usd_original: 191.25,
            salidas_cant: 66,
            ventas_cant: 36,
          }),
        ]}
        aircraft={[]}
        providers={[]}
        categorias={[]}
        margenVentaPct={25}
      />,
    );
    expect(html).toContain(">+$3,252.72 MXN<");
    expect(html).not.toContain(">+$191.25 USD<");
    expect(html).toContain(
      'title="66 unidades cargadas a aviones (30 a costo, sin utilidad) · margen vigente 25 % sobre el costo. En dólares: +$191.25 USD (al T.C. de cada venta)"',
    );
    expect(html).not.toMatch(/FIFO/);
  });

  it("Ubicación: catálogo · «(anterior)» en ámbar con «Elige la ubicación nueva» · «Sin ubicación»", () => {
    urlActual = new URLSearchParams();
    const html = pintarCon({ ubicaciones: CATALOGO });
    expect(html).toMatch(/title="Elige la ubicación nueva"[^>]*>Bodega Cancún <span[^>]*>\(anterior\)/);
    expect(html).toContain(">Oficina nueva<");
    expect(html).toContain("Sin ubicación");
  });

  it("sin catálogo (API previo): la ubicación se pinta tal cual y NO hay filtro ni «Mover a…»", () => {
    urlActual = new URLSearchParams();
    const viejo = [item("v", "Viejo", 1, { ubicacion: "Bodega Cancún" })];
    const html = renderToStaticMarkup(
      <ItemsTable items={viejo} aircraft={[]} providers={[]} categorias={[]} puedeAdministrarUbicaciones />,
    );
    expect(html).toContain("Bodega Cancún");
    expect(html).not.toContain("(anterior)");
    expect(html).not.toContain("Filtrar por ubicación");
    expect(html).not.toContain("Mover a…");
  });

  it("filtro «Sin ubicación nueva» con conteos; `?ubic=sin` deja solo legados y vacíos", () => {
    urlActual = new URLSearchParams({ ubic: "sin" });
    const html = pintarCon({ ubicaciones: CATALOGO });
    expect(html).toContain("Sin ubicación nueva (2)");
    expect(html).toContain("Oficina nueva (1)");
    expect(html).toMatch(/<option value="sin" selected="">/);
    expect(html).toContain("Aceite 15W-50");
    expect(html).toContain("Cinta");
    expect(html).not.toContain("Balata 66-105");
  });

  it("una ubicación sin productos lo DICE (nunca «Sin resultados para “”»)", () => {
    urlActual = new URLSearchParams({ ubic: "c1" });
    const html = pintarCon({ ubicaciones: CATALOGO });
    expect(html).toContain("No hay productos en «Oficina vieja»");
    expect(html).toContain("Ver todas las ubicaciones");
  });

  it("«Mover a…» y «Ubicaciones» solo con permiso (ADMIN/MECANICO), con cursor-pointer", () => {
    urlActual = new URLSearchParams();
    expect(pintarCon({ ubicaciones: CATALOGO })).not.toContain("Mover a…");
    const html = pintarCon({ ubicaciones: CATALOGO, puedeAdministrarUbicaciones: true });
    expect(html).toContain("Mover a…");
    expect(html).toContain("Ubicaciones");
    const select = html.match(/<select[^>]*aria-label="Filtrar por ubicación"[^>]*>/)?.[0] ?? "";
    expect(select).toContain("cursor-pointer");
  });
});
