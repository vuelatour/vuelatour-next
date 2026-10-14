/**
 * «Comisariato» en la UI de gastos (13-oct-2026, API 0.0.75). Pedido del
 * cliente (Jimmy, 12-oct): snacks/bebidas de los PASAJEROS como gasto
 * DIRECTO del vuelo — columna OTROS de costos directos del balance del
 * avión, junto al FBO. La comida de la tripulación sigue siendo «Comida».
 *
 *  1. El hint bajo el selector dice a dónde va (default + con lo elegido).
 *  2. Cableado de los dos diálogos (alta y Verificar / editar): el cuadro de
 *     ayuda sale con la categoría elegida; sin candado nuevo de vuelo.
 *  3. «Gastos del vuelo» la pinta con su etiqueta, SIN el destino en verde
 *     (ese renglón es solo de las dos comisiones del vendedor).
 *
 * El runner no tiene DOM: render estático + lectura del fuente por regex.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Gasto } from "@/types/expenses";
import { AYUDA_COMISARIATO } from "@/lib/admin/categorias-gasto";

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

const DESTINO = "Gastos directos del vuelo (en el balance del avión)";

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: "g-1",
    vuelo_id: "v-164",
    aeronave_id: "av-1",
    usuario_captura_id: "u-1",
    categoria: "COMISARIATO",
    monto: "176.5",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-08-18",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
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
    created_at: "2026-08-18T17:00:00+00:00",
    updated_at: "2026-08-18T17:00:00+00:00",
    ...over,
  } as Gasto;
}

describe("CategoriaDestinoHint", () => {
  it("con vuelo: destino de siempre + columna OTROS de costos directos", () => {
    const html = renderToStaticMarkup(
      <CategoriaDestinoHint categoria="COMISARIATO" tieneVuelo tieneAvion />,
    );
    expect(html).toContain(`Por default: ${DESTINO}`);
    expect(html).toContain(
      "Con lo elegido cae en: Balance del avión · hoja del vuelo (columna OTROS de costos directos, junto al FBO)",
    );
  });

  it("sin vuelo y con avión: Gastos Indirectos del avión", () => {
    const html = renderToStaticMarkup(
      <CategoriaDestinoHint categoria="COMISARIATO" tieneVuelo={false} tieneAvion />,
    );
    expect(html).toContain("Con lo elegido cae en: Balance del avión · Gastos Indirectos");
    expect(html).not.toContain("columna OTROS");
  });
});

describe("cableado de los diálogos", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const alta = leer("../expense-create-dialog.tsx");
  const verif = leer("../expense-verify-dialog.tsx");

  it.each([
    ["alta", alta],
    ["Verificar / editar", verif],
  ])("%s: importa la ayuda y la pinta solo con «Comisariato» elegida", (_n, fuente) => {
    expect(fuente).toMatch(/import \{[^}]*\bAYUDA_COMISARIATO\b[^}]*\bCATEGORIA_COMISARIATO\b[^}]*\} from "@\/lib\/admin\/categorias-gasto";/);
    expect(fuente).toMatch(
      /\{watch\("categoria"\) === CATEGORIA_COMISARIATO && \(\s*<p[^>]*>\s*<span className="font-medium">Comisariato\.<\/span> \{AYUDA_COMISARIATO\}\s*<\/p>/,
    );
  });

  it("sin candado nuevo: el vuelo obligatorio sigue siendo solo de las comisiones", () => {
    // `esComision` (y con él «Sin vuelo», la ventana de 90 días y el PATCH
    // con vuelo) sale de categoriaExigeVueloSiempre, que no la incluye.
    expect(alta).toContain('const esComision = categoriaExigeVueloSiempre(watch("categoria"));');
    expect(alta).not.toMatch(/CATEGORIA_COMISARIATO[^\n]*Sin vuelo/);
  });

  it("la ayuda es la de la fuente única (no se redacta a mano en el diálogo)", () => {
    for (const fuente of [alta, verif]) {
      expect(fuente).not.toContain("Snacks, bebidas y comisariato");
    }
    expect(AYUDA_COMISARIATO.startsWith("Snacks, bebidas y comisariato para los PASAJEROS.")).toBe(true);
  });
});

describe("Gastos del vuelo", () => {
  it("pinta «Comisariato» sin destino en verde (eso es solo de las comisiones del vendedor)", () => {
    const html = renderToStaticMarkup(
      <FlightGastosTable
        gastos={[gasto({ id: "g-cm" }), gasto({ id: "g-comida", categoria: "COMIDA", monto: "250" })]}
        fotoUrls={{}}
        aircraft={[]}
        providers={[]}
      />,
    );
    expect(html).toContain("Comisariato");
    expect(html).toContain("Comida");
    expect(html).not.toContain(DESTINO);
    expect(html).not.toContain("COMISARIATO<");
  });
});
