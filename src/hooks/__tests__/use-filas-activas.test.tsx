import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useFilasActivas } from "../use-filas-activas";
import { FilaNavegable } from "@/components/admin/fila-navegable";

/**
 * `useFilasActivas` + `FilaNavegable` (13-oct-2026) sobre un arnés mínimo con
 * `renderToStaticMarkup` (sin DOM ni mocks): los atributos que pintan en
 * reposo (SSR determinista: sin activa) y con una activa `inicial` (opción
 * que SOLO existe para este arnés; la fila la lee del estado con
 * `useSyncExternalStore`, también en el servidor). El teclado vive en el DOM
 * y se vigila por regex en `lib/admin/__tests__/filas-activas-cableado.test.ts`.
 */
const CLAVES = ["a", "b", "c"];

function Arnes({ inicial }: { inicial?: string | null }) {
  const f = useFilasActivas(CLAVES, { inicial });
  return (
    <table>
      <tbody {...f.propsCuerpo}>
        {CLAVES.map((k) => (
          <FilaNavegable key={k} filas={f} clave={k} href={`/x/${k}`} className="fila-de-prueba">
            <td>{k}</td>
          </FilaNavegable>
        ))}
      </tbody>
    </table>
  );
}

const cuenta = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const fila = (html: string, clave: string) => html.match(new RegExp(`<tr[^>]*data-fila="${clave}"[^>]*>`))?.[0] ?? "";

describe("useFilasActivas: marcado de reposo (sin activa)", () => {
  const html = renderToStaticMarkup(<Arnes />);

  it("el tbody lleva data-filas-activas y cada fila su data-fila y su href", () => {
    expect(html).toMatch(/<tbody[^>]*data-filas-activas=""/);
    for (const k of CLAVES) {
      expect(fila(html, k)).toContain(`data-fila-href="/x/${k}"`);
    }
    expect(cuenta(html, /<tr[^>]*data-fila="/g)).toBe(3);
  });

  it("exactamente UN tabindex=\"0\" (la primera) y dos tabindex=\"-1\"", () => {
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    expect(fila(html, "a")).toContain('tabindex="0"');
    expect(cuenta(html, /tabindex="-1"/g)).toBe(2);
  });

  it("CERO aria-current / aria-selected y CERO data-fila-activa (SSR determinista)", () => {
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("aria-selected");
    expect(html).not.toContain("data-fila-activa");
  });

  it("sin role= ni data-state en todo el HTML; la fila es el TableRow de siempre con su className", () => {
    expect(html).not.toContain("role=");
    expect(html).not.toContain("data-state");
    expect(fila(html, "a")).toContain('data-slot="table-row"');
    expect(fila(html, "a")).toMatch(/class="[^"]*fila-de-prueba/);
  });
});

describe("useFilasActivas: con una activa pintada", () => {
  const html = renderToStaticMarkup(<Arnes inicial="b" />);

  it("aria-current=\"true\" y data-fila-activa=\"\" SOLO en b (nunca aria-selected)", () => {
    expect(cuenta(html, /aria-current="true"/g)).toBe(1);
    expect(cuenta(html, /data-fila-activa=""/g)).toBe(1);
    expect(fila(html, "b")).toContain('aria-current="true"');
    expect(fila(html, "b")).toContain('data-fila-activa=""');
    expect(fila(html, "a")).not.toContain("aria-current");
    expect(fila(html, "c")).not.toContain("data-fila-activa");
    expect(html).not.toContain("aria-selected");
  });

  it("tabindex 0 en b y −1 en a y c; ningún aria-current=\"false\"", () => {
    expect(fila(html, "b")).toContain('tabindex="0"');
    expect(fila(html, "a")).toContain('tabindex="-1"');
    expect(fila(html, "c")).toContain('tabindex="-1"');
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    expect(html).not.toContain('aria-current="false"');
  });
});

describe("useFilasActivas: activa que no está pintada", () => {
  it("sin activa en el HTML y la entrada vuelve a la primera", () => {
    const html = renderToStaticMarkup(<Arnes inicial="zzz" />);
    expect(html).not.toContain("aria-current");
    expect(html).not.toContain("data-fila-activa");
    expect(cuenta(html, /tabindex="0"/g)).toBe(1);
    expect(fila(html, "a")).toContain('tabindex="0"');
  });
});
