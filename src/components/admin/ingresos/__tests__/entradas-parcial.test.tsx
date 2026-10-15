/**
 * Ingresos: un cobro PARCIAL (14-oct-2026, API 0.0.78, invariante 77) sigue
 * con el badge «Sin conciliar» de siempre y lleva al lado el chip ámbar
 * «Parcial · faltan $1,700 MXN» (informativo, no es botón). Sin
 * `conciliacion.parcial` (API previo, cobro sin abonos o ingreso), el
 * marcado de hoy byte a byte. Lo usan «Todos/Cobros de vuelos» y
 * «Depósitos de vuelos por volar».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EntradaDinero } from "@/types/ingresos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/ingresos",
  useSearchParams: () => new URLSearchParams(),
}));

const { BadgeEstadoConciliacion, CeldaConciliacionEntrada } = await import("../entradas-table");

type Celda = Pick<EntradaDinero, "moneda" | "conciliacion">;

const SIN_CONCILIAR: Celda = { moneda: "MXN", conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null } };
const PARCIAL: Celda = {
  moneda: "MXN",
  conciliacion: {
    estado: "SIN_CONCILIAR",
    movimiento_id: null,
    parcial: { monto_vinculado: 1700, faltante: 1700, abonos_n: 1 },
  },
};

describe("Ingresos: chip «Parcial · faltan $X» junto al badge", () => {
  it("parcial: el badge «Sin conciliar» de siempre + el chip ámbar con su tooltip", () => {
    const html = renderToStaticMarkup(<CeldaConciliacionEntrada entrada={PARCIAL} />);
    expect(html).toContain(">Sin conciliar<");
    expect(html).toMatch(
      /<span class="[^"]*border-amber-500\/50 bg-amber-500\/10[^"]*text-amber-700 dark:text-amber-300" title="Conciliado parcial: el banco respalda \$1,700 MXN de este cobro \(1 abono\) y faltan \$1,700 MXN\. Vincula el abono que falta en Conciliación cuando llegue\." data-chip-parcial="true">Parcial · faltan \$1,700 MXN<\/span>/,
    );
    // Informativo: no es botón ni enlace.
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  it("sin `parcial` (API previo, sin abonos o un ingreso): el marcado de hoy, idéntico", () => {
    const hoy = renderToStaticMarkup(<BadgeEstadoConciliacion estado="SIN_CONCILIAR" />);
    expect(renderToStaticMarkup(<CeldaConciliacionEntrada entrada={SIN_CONCILIAR} />)).toBe(hoy);
    expect(
      renderToStaticMarkup(
        <CeldaConciliacionEntrada entrada={{ ...SIN_CONCILIAR, conciliacion: { ...SIN_CONCILIAR.conciliacion, parcial: null } }} />,
      ),
    ).toBe(hoy);
  });

  it("las dos tablas de entradas usan la celda (con el chip)", () => {
    const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
    expect(leer("../entradas-table.tsx")).toContain("<CeldaConciliacionEntrada entrada={e} />");
    expect(leer("../depositos-por-volar-table.tsx")).toContain("<CeldaConciliacionEntrada entrada={e} />");
  });
});
