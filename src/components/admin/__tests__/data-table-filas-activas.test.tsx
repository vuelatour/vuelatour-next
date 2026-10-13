import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "../data-table";

/**
 * Fila activa + teclado en `DataTable` (13-oct-2026): el marcado de REPOSO que
 * toda tabla de lista lleva desde hoy (SSR determinista, sin activa), sin
 * mocks (DataTable no usa next/navigation; next/link pinta <a> en SSR). Lo
 * que se custodia: el gancho del <tbody>, `data-fila` + tabindex roving +
 * `data-fila-href` por fila, que el <a> de cada celda sea byte a byte el
 * href que Enter empareja, que la fila «Sin resultados» no sea navegable y
 * que las clases de siempre no cambien.
 */
interface Fila {
  id: string;
  nombre: string;
  monto: string;
}

const columns: DataTableColumn<Fila>[] = [
  { key: "nombre", header: "Nombre", cell: (r) => r.nombre },
  { key: "monto", header: "Monto", cell: (r) => r.monto },
  {
    key: "acciones",
    header: "",
    cell: (r) => (
      <button type="button" className="cursor-pointer">
        ⋯ {r.id}
      </button>
    ),
    noLink: true,
  },
];

const FILAS: Fila[] = [
  { id: "f1", nombre: "Uno", monto: "$1" },
  { id: "f2", nombre: "Dos", monto: "$2" },
  { id: "f3", nombre: "Tres", monto: "$3" },
];

const href = (r: Fila) => `/admin/x/${r.id}`;
const cuenta = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const filasDatos = (html: string) => (html.match(/<tr[^>]*>/g) ?? []).filter((t) => t.includes("data-fila="));
const fila = (html: string, clave: string) =>
  html.match(new RegExp(`<tr[^>]*data-fila="${clave}"[^>]*>`))?.[0] ?? "";

describe("DataTable con rowHref: filas navegables", () => {
  const html = renderToStaticMarkup(
    <DataTable
      columns={columns}
      rows={FILAS}
      rowKey={(r) => r.id}
      rowHref={href}
      rowClassName={(r) =>
        r.id === "f2" ? "ring-2 ring-inset ring-amber-400 bg-amber-500/5" : undefined
      }
    />,
  );

  it("el <tbody> lleva data-filas-activas y cada <tr> de datos su data-fila y su data-fila-href", () => {
    expect(html).toMatch(/<tbody[^>]*data-filas-activas=""/);
    expect(filasDatos(html)).toHaveLength(3);
    for (const r of FILAS) {
      const tr = fila(html, r.id);
      expect(tr).toContain(`data-fila-href="${href(r)}"`);
    }
  });

  it("exactamente UN tabindex=\"0\" (la primera) y los demás −1; el <tr> del thead sin tabindex", () => {
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    expect(fila(html, "f1")).toContain('tabindex="0"');
    expect(fila(html, "f2")).toContain('tabindex="-1"');
    expect(fila(html, "f3")).toContain('tabindex="-1"');
    const thead = html.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(thead).not.toContain("tabindex");
    expect(thead).not.toContain("data-fila");
  });

  it("CERO aria-selected / data-fila-activa (SSR determinista)", () => {
    expect(html).not.toContain("aria-selected");
    expect(html).not.toContain("data-fila-activa");
  });

  it("cada celda sin noLink sigue con <a href class=\"block\"> y el href es byte a byte el data-fila-href (lo que Enter empareja); la de noLink sin <a>", () => {
    const enlaces = (html.match(/<a [^>]*>/g) ?? []).map((t) => ({
      href: t.match(/href="([^"]*)"/)?.[1],
      clase: t.match(/class="([^"]*)"/)?.[1],
    }));
    expect(enlaces).toHaveLength(6);
    for (const r of FILAS) {
      const h = fila(html, r.id).match(/data-fila-href="([^"]+)"/)?.[1];
      expect(h).toBe(href(r));
      expect(enlaces.filter((a) => a.href === h && a.clase === "block")).toHaveLength(2);
    }
    // La celda de acciones: el botón NO va dentro de un <a>.
    expect(html).not.toMatch(/<a[^>]*>\s*<button/);
    expect(cuenta(html, /<button type="button" class="cursor-pointer">/g)).toBe(3);
  });

  it("la clase de la fila sigue siendo cursor-pointer hover:bg-muted/40 (+ rowClassName intacto)", () => {
    for (const r of FILAS) expect(fila(html, r.id)).toMatch(/class="[^"]*cursor-pointer hover:bg-muted\/40/);
    expect(fila(html, "f2")).toContain("ring-2 ring-inset ring-amber-400 bg-amber-500/5");
    expect(fila(html, "f1")).not.toContain("ring-amber-400");
  });

  it("sin role=\"grid\", role=\"row\", aria-activedescendant ni data-state en todo el HTML", () => {
    expect(html).not.toContain('role="grid"');
    expect(html).not.toContain('role="row"');
    expect(html).not.toContain('role="gridcell"');
    expect(html).not.toContain("aria-activedescendant");
    expect(html).not.toContain("data-state");
  });
});

describe("DataTable sin rowHref", () => {
  it("mismas filas navegables, sin <a> y SIN data-fila-href", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} rows={FILAS} rowKey={(r) => r.id} />);
    expect(filasDatos(html)).toHaveLength(3);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("data-fila-href");
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    expect(fila(html, "f1")).toContain('tabindex="0"');
  });
});

describe("DataTable con subRows", () => {
  it("las hijas también llevan data-fila y tabindex −1; la entrada sigue siendo el primer padre", () => {
    const HIJAS: Fila[] = [
      { id: "h1", nombre: "Pago 1", monto: "$0.5" },
      { id: "h2", nombre: "Pago 2", monto: "$0.5" },
    ];
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={FILAS}
        rowKey={(r) => r.id}
        subRows={(r) => (r.id === "f1" ? HIJAS : undefined)}
      />,
    );
    expect(filasDatos(html)).toHaveLength(5);
    expect(fila(html, "h1")).toContain('tabindex="-1"');
    expect(fila(html, "h2")).toContain('tabindex="-1"');
    expect(fila(html, "f1")).toContain('tabindex="0"');
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    // Orden DOM: padre, sus hijas, el siguiente padre.
    const orden = filasDatos(html).map((t) => t.match(/data-fila="([^"]+)"/)?.[1]);
    expect(orden).toEqual(["f1", "h1", "h2", "f2", "f3"]);
  });
});

describe("DataTable vacía", () => {
  it("la fila «Sin resultados» NO lleva data-fila ni tabindex y el <tbody> sí lleva data-filas-activas", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(html).toMatch(/<tbody[^>]*data-filas-activas=""/);
    expect(html).toContain("Sin resultados para");
    expect(html).not.toContain("data-fila=");
    expect(html).not.toContain("tabindex");
  });
});

describe("dos tablas en la misma pantalla", () => {
  it("dos <tbody data-filas-activas> y un tabindex=\"0\" por tabla", () => {
    const html = renderToStaticMarkup(
      <>
        <DataTable columns={columns} rows={FILAS} rowKey={(r) => r.id} syncId="a" />
        <DataTable columns={columns} rows={FILAS.slice(0, 2)} rowKey={(r) => r.id} syncId="b" />
      </>,
    );
    expect(cuenta(html, /<tbody[^>]*data-filas-activas=""/g)).toBe(2);
    expect(cuenta(html, /tabindex="0"/g)).toBe(2);
    expect(filasDatos(html)).toHaveLength(5);
  });
});
