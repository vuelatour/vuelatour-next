/**
 * «Comisión del vendedor» en la UI de gastos (28-sep-2026). Pedido del
 * cliente: «¿cómo registro el pago de la comisión a Saab para que aparezca en
 * otros movimientos? Si lo capturo como "Otros gastos VuelaTour" queda
 * duplicado». Desde el 13-oct-2026 (API 0.0.74) son DOS categorías:
 * «Comisión del vendedor (VuelaTour)» (la paga VuelaTour) y «Comisión del
 * vendedor (avión)» (la carga el avión del vuelo).
 *
 *  1. El hint bajo el selector dice a dónde va (default + con lo elegido).
 *  2. «Gastos del vuelo» pinta el destino bajo la etiqueta, SOLO en las dos
 *     comisiones (el total de la card no cambia: un gasto es un gasto) — así
 *     se ve quién paga cada pago.
 *  3. Cableado de los dos diálogos (alta y verificación): exige vuelo con el
 *     mismo texto que el API, sin «Sin vuelo», ventana de 90 días, el cuadro
 *     de ayuda de SU categoría (y en Verificar cómo reclasificar entre las
 *     dos), la IA no la pisa, sin «simular como piloto», y en la verificación
 *     el vuelo viaja en el MISMO PATCH (sin la 2.ª llamada de ligar vuelo).
 *  4. Tablero de Gastos y reparto: el renglón y el sublabel de la «(avión)».
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Gasto } from "@/types/expenses";
import {
  AYUDA_COMISION_VENDEDOR,
  AYUDA_COMISION_VENDEDOR_AVION,
  categoriaExigeVueloSiempre,
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

const DESTINO = "Pago al vendedor (otros movimientos VuelaTour; no es costo del avión)";
const DESTINO_AVION =
  "Pago al vendedor (columna COMISIONES del balance del avión; sí es costo del avión)";

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
      "Balance general VuelaTour · Otros movimientos (el pago al vendedor, apareado con la comisión cobrada; sin él esa fila no lleva egreso)",
    );
  });

  it("comisión «(avión)» con vuelo: su destino + columna COMISIONES y reparto con lo elegido", () => {
    const html = renderToStaticMarkup(
      <CategoriaDestinoHint categoria="COMISION_VENDEDOR_AVION" tieneVuelo tieneAvion />,
    );
    expect(html).toContain(`Por default: ${DESTINO_AVION}`);
    expect(html).toContain(
      "Con lo elegido cae en: Balance del avión · columna COMISIONES y reparto a socios, en el mes del vuelo",
    );
    expect(html).not.toContain(DESTINO);
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
  it("cada comisión lleva su destino bajo la etiqueta (se ve quién paga); los demás gastos no", () => {
    const html = renderToStaticMarkup(
      <FlightGastosTable
        gastos={[
          gasto({ id: "g-com", categoria: "COMISION_VENDEDOR" }),
          gasto({ id: "g-com-av", categoria: "COMISION_VENDEDOR_AVION", monto: "1000" }),
          gasto({ id: "g-otro", categoria: "OTRO", monto: "250000" }),
        ]}
        fotoUrls={{}}
        aircraft={[]}
        providers={[]}
      />,
    );
    expect(html).toContain("Comisión del vendedor (VuelaTour)");
    expect(html).toContain("Comisión del vendedor (avión)");
    expect(html).toContain("Otros gastos VuelaTour");
    expect(html.split(DESTINO)).toHaveLength(2); // una sola vez
    expect(html.split(DESTINO_AVION)).toHaveLength(2); // una sola vez
    // El destino de «Otros gastos VuelaTour» NO se pinta en la tabla.
    expect(html).not.toContain("Otros gastos (Balance general VuelaTour)");
  });

  it("un código parecido NO se toma por comisión (comparación exacta)", () => {
    const html = renderToStaticMarkup(
      <FlightGastosTable
        gastos={[gasto({ id: "g-x", categoria: "COMISION_VENDEDOR_AVIONX" })]}
        fotoUrls={{}}
        aircraft={[]}
        providers={[]}
      />,
    );
    expect(html).not.toContain(DESTINO);
    expect(html).not.toContain(DESTINO_AVION);
  });
});

describe("cableado de los diálogos", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
  const alta = leer("../expense-create-dialog.tsx");
  const verif = leer("../expense-verify-dialog.tsx");

  it("alta: bloquea sin vuelo ANTES de subir la factura, con el texto del API", () => {
    const candado = alta.indexOf("errorVueloObligatorio(values.categoria, values.vuelo_id)");
    expect(candado).toBeGreaterThan(-1);
    expect(candado).toBeLessThan(alta.indexOf("uploadGastoComprobante(archivo)"));
    expect(alta).toContain("toast.error(sinVuelo)");
  });

  it("alta: sin «Sin vuelo», hint obligatorio, ventana de 90 días y la ayuda de SU categoría (con o sin vuelo prefijado)", () => {
    expect(alta).toContain('...(esComision ? [] : [{ value: "", label: "Sin vuelo" }])');
    expect(alta).toContain("HINT_VUELO_COMISION");
    expect(alta).toContain("esComision ? VENTANA_VUELOS_COMISION : undefined");
    expect(alta).toContain('const ayudaComision = ayudaComisionVendedor(watch("categoria"));');
    expect(alta).toMatch(
      /\{ayudaComision && \(\s*<p[^>]*>\s*<span className="font-medium">\{ayudaComision\.titulo\}\.<\/span>\{" "\}\s*\{ayudaComision\.texto\}\s*<\/p>/,
    );
    // Ya no se rotula a mano: el título sale de la etiqueta de SU categoría.
    expect(alta).not.toContain('<span className="font-medium">Comisión del vendedor.</span>');
    // El alta NO trae el aviso de reclasificar (es de Verificar / editar).
    expect(alta).not.toContain("AYUDA_RECLASIFICAR_COMISION");
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

  it("verificación: bloquea sin vuelo, sin «Sin vuelo», ventana ancha, ayuda + reclasificar y la IA no la pisa", () => {
    expect(verif).toContain("errorVueloObligatorio(values.categoria, vueloSel)");
    expect(verif).toContain('...(esComision ? [] : [{ value: "", label: "Sin vuelo" }])');
    expect(verif).toContain("esComision ? VENTANA_VUELOS_COMISION : undefined");
    expect(verif).toContain('const ayudaComision = ayudaComisionVendedor(watch("categoria"));');
    expect(verif).toMatch(
      /\{ayudaComision && \(\s*<p[^>]*>\s*<span className="font-medium">\{ayudaComision\.titulo\}\.<\/span>\{" "\}\s*\{ayudaComision\.texto\}\s*<span[^>]*>\{AYUDA_RECLASIFICAR_COMISION\}<\/span>\s*<\/p>/,
    );
    expect(verif).toContain('iaPuedeCambiarCategoria(watch("categoria"), ai.categoria_sugerida)');
  });

  it("la «(avión)» usa el MISMO cableado: 90 días, sin «Sin vuelo» y vuelo en el MISMO PATCH", () => {
    // `esComision` y `vueloEnPatch` salen de categoriaExigeVueloSiempre, que
    // cubre las DOS; y el cuadro de ayuda le da su propio texto.
    expect(categoriaExigeVueloSiempre("COMISION_VENDEDOR_AVION")).toBe(true);
    expect(categoriaExigeVueloSiempre("COMISION_VENDEDOR")).toBe(true);
    for (const fuente of [alta, verif]) {
      expect(fuente).toContain('const esComision = categoriaExigeVueloSiempre(watch("categoria"));');
    }
    expect(AYUDA_COMISION_VENDEDOR).not.toBe(AYUDA_COMISION_VENDEDOR_AVION);
  });

  it("verificación: cambiar la categoría NO reinicia el vuelo elegido", () => {
    // El effect que fija vueloSel no depende de la categoría.
    expect(verif).toMatch(
      /setVueloSel\(gasto\.vuelo_id \?\? ""\);\s*\}, \[open, gasto\.id, gasto\.vuelo_id\]\);/,
    );
  });
});

describe("tablero de Gastos y reparto (cableado de la «(avión)»)", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el tablero pinta el renglón con la llave ADITIVA del API, después del de empresa", () => {
    const pagina = leer("src/app/admin/dashboards/page.tsx");
    expect(pagina).toContain(
      "textoTableroComisionVendedorAvion(\n    resumen.gastos_comision_vendedor_avion_usd,\n  )",
    );
    expect(pagina).toMatch(
      /\{comisionVendedorAvion && \(\s*<p className="text-xs text-muted-foreground">\{comisionVendedorAvion\}<\/p>/,
    );
    expect(pagina.indexOf("{comisionVendedorAvion && (")).toBeGreaterThan(
      pagina.indexOf("{gastosEmpresa && ("),
    );
  });

  it("el renglón de gastos de la EMPRESA sale de la fuente única (13-oct-2026: ya no dice solo «remanentes de repartos»)", () => {
    const pagina = leer("src/app/admin/dashboards/page.tsx");
    expect(pagina).toContain("const gastosEmpresa = textoTableroGastosEmpresa(resumen.gastos_empresa_usd);");
    expect(pagina).toMatch(/\{gastosEmpresa && \(\s*<p className="text-xs text-muted-foreground">\{gastosEmpresa\}<\/p>/);
    expect(pagina).not.toContain("(remanentes de repartos: no se imputan a aeronaves)");
  });

  it("la cascada del reparto usa el sublabel de la fuente única (sin «provisión»)", () => {
    const card = leer("src/components/admin/profit-sharing/avion-reparto-card.tsx");
    expect(card).toContain("sublabel={SUBLABEL_COMISIONES_REPARTO}");
    expect(card).not.toMatch(/provisión del vendedor/);
    expect(leer("src/components/admin/profit-sharing/kpi-strip.tsx")).not.toMatch(/provisi/);
  });

  it("los tooltips de «Otros ingresos VuelaTour» dicen quién paga con la nota única (sin «egreso de VuelaTour» a secas)", () => {
    const card = leer("src/components/admin/profit-sharing/avion-reparto-card.tsx");
    const kpi = leer("src/components/admin/profit-sharing/kpi-strip.tsx");
    for (const fuente of [card, kpi]) {
      expect(fuente).toContain("${NOTA_PAGO_VENDEDOR_REPARTO}");
      expect(fuente).not.toContain("la comisión se paga al vendedor desde VuelaTour");
      expect(fuente).not.toContain("su pago al vendedor, egreso de VuelaTour");
    }
  });
});
