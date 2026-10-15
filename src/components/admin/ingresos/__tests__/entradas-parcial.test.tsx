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
// La tabla monta la hoja «Conciliación con el banco» (15-oct-2026): sus
// actions no se llaman al pintar.
vi.mock("@/app/admin/conciliacion/actions", () => ({
  conciliacionDeEntradaAction: vi.fn(),
  estadoCuentaUrlAction: vi.fn(),
}));

const { BadgeEstadoConciliacion, CeldaConciliacionEntrada } = await import("../entradas-table");

const BASE: EntradaDinero = {
  origen: "COBRO_VUELO",
  id: "0f3c2b1a-1111-4a7b-8c9d-0e1f2a3b4c5d",
  dia: "2026-09-15",
  etiqueta: "Vuelo #315",
  categoria: "COBRO_VUELO",
  categoria_etiqueta: "Cobro de vuelo",
  cliente_nombre: "Beh Kay",
  concepto: null,
  monto: 3400,
  comision: null,
  neto: 3400,
  moneda: "MXN",
  metodo: "TRANSFERENCIA",
  metodo_etiqueta: "Transferencia",
  vuelo_id: "v-315",
  vuelo_folio: 315,
  grupo_folio: null,
  vuelo_estado: "CONFIRMADO",
  por_volar: false,
  anticipo_etiqueta: null,
  cuenta_en_total: true,
  es_reembolso: false,
  conciliacion: { estado: "SIN_CONCILIAR", movimiento_id: null },
  registrado_por_nombre: "Itzi",
};

const SIN_CONCILIAR: EntradaDinero = BASE;
const PARCIAL: EntradaDinero = {
  ...BASE,
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

  it("las dos tablas de entradas usan la celda (con el chip y, desde el 15-oct-2026, el clic a la hoja)", () => {
    const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
    for (const src of [leer("../entradas-table.tsx"), leer("../depositos-por-volar-table.tsx")]) {
      expect(src).toMatch(
        /<CeldaConciliacionEntrada\s+entrada=\{e\}\s+alAbrir=\{abrirBanco \? \(\) => abrirBanco\(filaBancoDeEntrada\(e\)\) : undefined\}\s+\/>/,
      );
    }
  });
});
