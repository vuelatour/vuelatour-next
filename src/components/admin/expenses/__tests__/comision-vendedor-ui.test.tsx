/**
 * «Comisión del vendedor» en la UI de gastos (28-sep-2026). Pedido del
 * cliente: «¿cómo registro el pago de la comisión a Saab para que aparezca en
 * otros movimientos? Si lo capturo como "Otros gastos VuelaTour" queda
 * duplicado».
 *
 *  1. El hint bajo el selector dice a dónde va (default + con lo elegido).
 *  2. «Gastos del vuelo» pinta el destino bajo la etiqueta, SOLO en la
 *     comisión (el total de la card no cambia: un gasto es un gasto).
 *  3. Cableado de los dos diálogos (alta y verificación): exige vuelo con el
 *     mismo texto que el API, sin «Sin vuelo», ventana de 90 días, ayuda,
 *     la IA no la pisa, sin «simular como piloto», y en la verificación el
 *     vuelo viaja en el MISMO PATCH (sin la 2.ª llamada de ligar vuelo).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Gasto } from "@/types/expenses";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/flights/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/expenses/expense-actions", () => ({ ExpenseActions: () => null }));
vi.mock("@/components/admin/expenses/facturacion-badge", () => ({ FacturacionBadge: () => null }));

const { CategoriaDestinoHint } = await import("../categoria-destino-hint");
const { FlightGastosTable } = await import("@/components/admin/flights/flight-gastos-table");

const DESTINO = "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)";

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: "g-1",
    vuelo_id: "v-317",
    aeronave_id: "av-1",
    usuario_captura_id: "u-1",
    categoria: "OTRO",
    monto: "2030",
    propina: null,
    moneda: "MXN",
    tc_gasto: "17.5",
    fecha_gasto: "2026-09-28",
    proveedor_id: null,
    medio_pago: "TRANSFERENCIA",
    tarjeta_terminacion: null,
    folio_ticket: null,
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "SIN_COMPROBANTE",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    notas: null,
    created_at: "2026-09-28T17:00:00+00:00",
    updated_at: "2026-09-28T17:00:00+00:00",
    ...over,
  } as Gasto;
}

describe("CategoriaDestinoHint", () => {
  it("comisión con vuelo: destino por default + «otros movimientos» con lo elegido", () => {
    const html = renderToStaticMarkup(
      <CategoriaDestinoHint categoria="COMISION_VENDEDOR" tieneVuelo tieneAvion />,
    );
    expect(html).toContain(`Por default: ${DESTINO}`);
    expect(html).toContain(
      "Balance general VuelaTour · Otros movimientos (reemplaza la provisión del pago al vendedor)",
    );
  });

  it("«Otros gastos VuelaTour» con vuelo ya no promete la hoja del vuelo", () => {
    const html = renderToStaticMarkup(<CategoriaDestinoHint categoria="OTRO" tieneVuelo tieneAvion />);
    expect(html).toContain(
      "Balance general VuelaTour · Otros gastos (el vuelo queda solo como referencia)",
    );
    expect(html).not.toContain("hoja del vuelo");
  });
});

describe("Gastos del vuelo", () => {
  it("la comisión lleva su destino bajo la etiqueta; los demás gastos no", () => {
    const html = renderToStaticMarkup(
      <FlightGastosTable
        gastos={[
          gasto({ id: "g-com", categoria: "COMISION_VENDEDOR" }),
          gasto({ id: "g-otro", categoria: "OTRO", monto: "250000" }),
        ]}
        fotoUrls={{}}
        aircraft={[]}
        providers={[]}
      />,
    );
    expect(html).toContain("Comisión del vendedor");
    expect(html).toContain("Otros gastos VuelaTour");
    expect(html.split(DESTINO)).toHaveLength(2); // una sola vez
    // El destino de «Otros gastos VuelaTour» NO se pinta en la tabla.
    expect(html).not.toContain("Otros gastos (Balance general VuelaTour)");
  });
});

describe("cableado de los diálogos", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const alta = leer("../expense-create-dialog.tsx");
  const verif = leer("../expense-verify-dialog.tsx");

  it("alta: bloquea sin vuelo ANTES de subir la factura, con el texto del API", () => {
    const candado = alta.indexOf("errorVueloObligatorio(values.categoria, values.vuelo_id)");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(alta.indexOf("uploadGastoComprobante(factura)"));
    expect(alta).toContain("toast.error(sinVuelo)");
  });

  it("alta: sin «Sin vuelo», hint obligatorio, ventana de 90 días y ayuda (con o sin vuelo prefijado)", () => {
    expect(alta).toContain('...(esComision ? [] : [{ value: "", label: "Sin vuelo" }])');
    expect(alta).toContain("HINT_VUELO_COMISION");
    expect(alta).toContain("esComision ? VENTANA_VUELOS_COMISION : undefined");
    expect(alta).toMatch(/\{esComision && \(\s*<p[^>]*>\s*<span className="font-medium">Comisión del vendedor\.<\/span>\{" "\}\s*\{AYUDA_COMISION_VENDEDOR\}/);
  });

  it("alta: la IA no la pisa y «simular como piloto» no aplica", () => {
    expect(alta).toContain('iaPuedeCambiarCategoria(watch("categoria"), ai.categoria_sugerida)');
    expect(alta).toContain("if (!hayVuelo || esComision) return null;");
    expect(alta).toMatch(/aplicarComoPiloto =[\s\S]*?!categoriaExigeVueloSiempre\(values\.categoria\)/);
  });

  it("verificación: vuelo en el MISMO PATCH y sin la 2.ª llamada de ligar vuelo", () => {
    const enPatch = verif.indexOf("payload.vuelo_id = vueloSel;");
    expect(enPatch).toBeGreaterThan(-1);
    expect(enPatch).toBeLessThan(verif.indexOf("await verifyGastoAction(gasto.id, payload)"));
    expect(verif).toMatch(/!vueloEnPatch &&\s*vueloSel !== \(gasto\.vuelo_id \?\? ""\)/);
    expect(verif).toContain("const vueloEnPatch = categoriaExigeVueloSiempre(values.categoria);");
  });

  it("verificación: bloquea sin vuelo, sin «Sin vuelo», ventana ancha, ayuda y la IA no la pisa", () => {
    expect(verif).toContain("errorVueloObligatorio(values.categoria, vueloSel)");
    expect(verif).toContain('...(esComision ? [] : [{ value: "", label: "Sin vuelo" }])');
    expect(verif).toContain("esComision ? VENTANA_VUELOS_COMISION : undefined");
    expect(verif).toContain("{AYUDA_COMISION_VENDEDOR}");
    expect(verif).toContain('iaPuedeCambiarCategoria(watch("categoria"), ai.categoria_sugerida)');
  });

  it("verificación: cambiar la categoría NO reinicia el vuelo elegido", () => {
    // El effect que fija vueloSel no depende de la categoría.
    expect(verif).toMatch(
      /setVueloSel\(gasto\.vuelo_id \?\? ""\);\s*\}, \[open, gasto\.id, gasto\.vuelo_id\]\);/,
    );
  });
});
