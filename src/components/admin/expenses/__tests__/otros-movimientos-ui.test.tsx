/**
 * «Otros movimientos (VuelaTour)» en la UI de gastos (23-oct-2026, API
 * 0.0.106, invariante 107). Pedido del cliente (con la captura del selector
 * de categorías): «Falta la opción de agregar un gasto a la hoja de "otros
 * movimientos" en el balance general». Egreso de VuelaTour apareado en esa
 * hoja con los ingresos de VuelaTour del vuelo; vuelo OPCIONAL, avión solo
 * referencia, nunca costo del avión ni «otros gastos».
 *
 *  1. El hint bajo el selector dice a dónde va (default + con lo elegido).
 *  2. Cableado de los dos diálogos (alta y Verificar / editar): el cuadro de
 *     ayuda sale con la categoría elegida; SIN candado nuevo de vuelo ni de
 *     avión (la categoría aparece en el fuente SOLO en el import y en el
 *     cuadro).
 *  3. El selector del alta la ofrece al final, justo después de «Otros
 *     gastos VuelaTour» (golden del alta, también desde el vuelo).
 *  4. «Gastos del vuelo» pinta su destino en verde bajo la etiqueta (como las
 *     dos comisiones): se ve que es egreso de VuelaTour, no del avión.
 *
 * El runner no tiene DOM: render estático + lectura del fuente por regex.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Gasto } from "@/types/expenses";
import {
  AYUDA_OTROS_MOVIMIENTOS,
  CATEGORIA_OTROS_MOVIMIENTOS,
  DESTINO_OTROS_MOVIMIENTOS,
  HOJA_OTROS_MOVIMIENTOS_CON_AVION,
  HOJA_OTROS_MOVIMIENTOS_CON_VUELO,
  categoriaGastoLabel,
} from "@/lib/admin/categorias-gasto";

// La renovación de URLs firmadas de las fotos (server action: sesión y red)
// no es parte de este test.
vi.mock("@/app/actions/storage", () => ({
  refrescarUrlsFirmadasAction: async () => ({ ok: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/flights/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({ FacturacionBadge: () => null }));

const { CategoriaDestinoHint } = await import("../categoria-destino-hint");
const { FlightGastosTable } = await import("@/components/admin/flights/flight-gastos-table");

const OM = CATEGORIA_OTROS_MOVIMIENTOS;
const ETIQUETA = "Otros movimientos (VuelaTour)";

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: "g-1",
    vuelo_id: "v-437",
    aeronave_id: "av-1",
    usuario_captura_id: "u-1",
    categoria: OM,
    monto: "1250",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-23",
    proveedor_id: null,
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    notas: null,
    created_at: "2026-10-23T17:00:00+00:00",
    updated_at: "2026-10-23T17:00:00+00:00",
    ...over,
  } as Gasto;
}

describe("CategoriaDestinoHint", () => {
  it("con vuelo: destino propio + el bloque de ese vuelo en «otros movimientos»", () => {
    const html = renderToStaticMarkup(<CategoriaDestinoHint categoria={OM} tieneVuelo tieneAvion />);
    expect(html).toContain(`Por default: ${DESTINO_OTROS_MOVIMIENTOS}`);
    expect(html).toContain(`Con lo elegido cae en: ${HOJA_OTROS_MOVIMIENTOS_CON_VUELO}`);
    expect(html).not.toContain("Otros gastos");
  });

  it("sin vuelo y con avión: fila suelta, el avión solo referencia", () => {
    const html = renderToStaticMarkup(<CategoriaDestinoHint categoria={OM} tieneVuelo={false} tieneAvion />);
    expect(html).toContain(`Con lo elegido cae en: ${HOJA_OTROS_MOVIMIENTOS_CON_AVION}`);
    expect(html).not.toContain("Gastos Indirectos");
  });

  it("sin vuelo ni avión: solo el destino por default (la hoja es la misma)", () => {
    const html = renderToStaticMarkup(
      <CategoriaDestinoHint categoria={OM} tieneVuelo={false} tieneAvion={false} />,
    );
    expect(html).toContain(`Por default: ${DESTINO_OTROS_MOVIMIENTOS}`);
    expect(html).not.toContain("Con lo elegido cae en:");
  });
});

describe("cableado de los diálogos", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const alta = leer("../expense-create-dialog.tsx");
  const verif = leer("../expense-verify-dialog.tsx");

  it.each([
    ["alta", alta],
    ["Verificar / editar", verif],
  ])("%s: importa la ayuda y la pinta solo con «Otros movimientos (VuelaTour)» elegida", (_n, fuente) => {
    expect(fuente).toMatch(
      /import \{[^}]*\bAYUDA_OTROS_MOVIMIENTOS\b[^}]*\bCATEGORIA_OTROS_MOVIMIENTOS\b[^}]*\} from "@\/lib\/admin\/categorias-gasto";/,
    );
    expect(fuente).toMatch(
      /\{watch\("categoria"\) === CATEGORIA_OTROS_MOVIMIENTOS && \(\s*<p[^>]*>\s*<span className="font-medium">Otros movimientos \(VuelaTour\)\.<\/span> \{AYUDA_OTROS_MOVIMIENTOS\}\s*<\/p>/,
    );
    // El rótulo del cuadro es la etiqueta canónica.
    expect(categoriaGastoLabel(OM)).toBe(ETIQUETA);
  });

  it.each([
    ["alta", alta],
    ["Verificar / editar", verif],
  ])("%s: SIN candado nuevo — la categoría solo aparece en el import y en el cuadro", (_n, fuente) => {
    // Ni limpia el vuelo, ni quita «Sin vuelo», ni oculta el avión, ni
    // bloquea el guardado: el vuelo es OPCIONAL y el avión, referencia.
    expect(fuente.split("CATEGORIA_OTROS_MOVIMIENTOS")).toHaveLength(3);
    expect(fuente).not.toMatch(/OTROS_MOVIMIENTOS[^\n]*(Sin vuelo|vuelo_id|aeronave_id)/);
    expect(fuente).toContain('const esComision = categoriaExigeVueloSiempre(watch("categoria"));');
  });

  it("la ayuda es la de la fuente única (no se redacta a mano en el diálogo)", () => {
    for (const fuente of [alta, verif]) {
      expect(fuente).not.toContain("Egreso de VuelaTour que entra");
    }
    expect(AYUDA_OTROS_MOVIMIENTOS.startsWith("Egreso de VuelaTour que entra a la hoja «otros movimientos»")).toBe(
      true,
    );
  });
});

describe("selector del alta (golden)", () => {
  const golden = JSON.parse(
    readFileSync(path.resolve(__dirname, "./alta-gasto.golden.json"), "utf8"),
  ) as Record<string, string>;

  it("la opción va al final, justo después de «Otros gastos VuelaTour», también desde el vuelo", () => {
    for (const variante of ["operaciones", "otro", "refaccion", "vuelo"]) {
      const m = /data-select="Categoría"[^>]*data-opciones="([^"]*)"/.exec(golden[variante]);
      expect(m, variante).not.toBeNull();
      const opciones = (m as RegExpExecArray)[1].split("|");
      expect(opciones.slice(-2), variante).toEqual(["Otros gastos VuelaTour", ETIQUETA]);
      expect(opciones.filter((o) => o === ETIQUETA), variante).toHaveLength(1);
    }
  });
});

describe("Gastos del vuelo", () => {
  it("pinta «Otros movimientos (VuelaTour)» con su destino en verde; «Otros gastos VuelaTour» y las directas, sin destino", () => {
    const html = renderToStaticMarkup(
      <FlightGastosTable
        gastos={[
          gasto({ id: "g-om" }),
          gasto({ id: "g-otro", categoria: "OTRO", monto: "250" }),
          gasto({ id: "g-comida", categoria: "COMIDA", monto: "564" }),
        ]}
        fotoUrls={{}}
        aircraft={[]}
        providers={[]}
      />,
    );
    expect(html).toContain(ETIQUETA);
    expect(html).toContain("Otros gastos VuelaTour");
    expect(html).toContain("Comida");
    expect(html.split(DESTINO_OTROS_MOVIMIENTOS)).toHaveLength(2); // una sola vez
    expect(html).not.toContain("Otros gastos (Balance general VuelaTour)");
    expect(html).not.toContain("Gastos directos del vuelo");
    expect(html).not.toContain("OTROS_MOVIMIENTOS<");
  });
});
