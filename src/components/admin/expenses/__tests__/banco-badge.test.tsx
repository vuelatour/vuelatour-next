/**
 * Columna «Banco» de Gastos (9-oct-2026; pedido de oficina: «un apartado
 * donde me diga si el gasto está conciliado con el banco»): estado puro +
 * badge, y el filtro `?banco=` → `conciliado` del API.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  conciliadoDeFiltroBanco,
  estadoBancoGasto,
} from "@/lib/admin/conciliacion-estado";
import { BancoBadge } from "@/components/admin/expenses/banco-badge";
import type { Gasto } from "@/types/expenses";
import type { CompraPago } from "@/types/compras";

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: "g-1",
    vuelo_id: null,
    aeronave_id: null,
    usuario_captura_id: "u-1",
    categoria: "COMIDA",
    monto: "500",
    propina: null,
    moneda: "MXN",
    tc_gasto: null,
    fecha_gasto: "2026-10-01",
    proveedor_id: null,
    medio_pago: "TARJETA_CORP",
    tarjeta_terminacion: "6256",
    litros: null,
    tipo_combustible: null,
    lugar: null,
    fecha_hora_carga: null,
    estatus_comprobante: "FACTURA",
    foto_url: null,
    valor_ia_extraido: null,
    conciliado: false,
    duplicado_sospechado: false,
    origen: "OFICINA",
    escala_id: null,
    factura_recibida_id: null,
    notas: null,
    created_at: "2026-10-01T12:00:00Z",
    ...over,
  } as Gasto;
}

describe("estadoBancoGasto", () => {
  it("conciliado manda sobre el medio (efectivo ligado con justificación también)", () => {
    expect(estadoBancoGasto(gasto({ conciliado: true })).value).toBe("CONCILIADO");
    expect(estadoBancoGasto(gasto({ conciliado: true, medio_pago: "EFECTIVO" })).value).toBe(
      "CONCILIADO",
    );
  });

  it("cargos ligados que no cubren = parcial, con lo que falta en el tooltip", () => {
    const e = estadoBancoGasto(gasto({ monto_vinculado: "200", faltante: "300" }));
    expect(e.value).toBe("PARCIAL");
    expect(e.title).toContain("300");
  });

  it("medio bancario sin cargo = sin conciliar; efectivo/personal = no aplica", () => {
    // DOMICILIADO («Pago domiciliado», 13-oct-2026) es bancario: sin cargo
    // ligado, «Sin conciliar» como una transferencia.
    for (const medio of ["TARJETA_CORP", "TRANSFERENCIA", "PAYWISE", "DOMICILIADO"]) {
      expect(estadoBancoGasto(gasto({ medio_pago: medio })).value, medio).toBe("SIN_CONCILIAR");
    }
    expect(estadoBancoGasto(gasto({ medio_pago: "DOMICILIADO", conciliado: true })).value).toBe("CONCILIADO");
    expect(
      estadoBancoGasto(gasto({ medio_pago: "DOMICILIADO", monto_vinculado: "200", faltante: "300" })).value,
    ).toBe("PARCIAL");
    for (const medio of ["EFECTIVO", "PERSONAL_PABLO", "PERSONAL_ALE", "BODEGA"]) {
      expect(estadoBancoGasto(gasto({ medio_pago: medio })).value).toBe("NO_APLICA");
    }
  });

  it("filtro ?banco= → conciliado del API", () => {
    expect(conciliadoDeFiltroBanco("conciliados")).toBe(true);
    expect(conciliadoDeFiltroBanco("sin_conciliar")).toBe(false);
    expect(conciliadoDeFiltroBanco(undefined)).toBeUndefined();
    expect(conciliadoDeFiltroBanco("otra-cosa")).toBeUndefined();
  });
});

describe("BancoBadge", () => {
  it("pinta Conciliado / Parcial / Sin conciliar y «—» cuando no aplica", () => {
    expect(renderToStaticMarkup(<BancoBadge gasto={gasto({ conciliado: true })} />)).toContain(
      "Conciliado",
    );
    expect(
      renderToStaticMarkup(<BancoBadge gasto={gasto({ monto_vinculado: "1", faltante: "499" })} />),
    ).toContain("Parcial");
    expect(renderToStaticMarkup(<BancoBadge gasto={gasto({})} />)).toContain("Sin conciliar");
    const na = renderToStaticMarkup(<BancoBadge gasto={gasto({ medio_pago: "EFECTIVO" })} />);
    expect(na).toContain("—");
    expect(na).not.toContain("Sin conciliar");
  });
});

describe("BancoBadge con clic: «conciliación al revés» (13-oct-2026)", () => {
  const noop = () => {};

  it("sin `alAbrir` el marcado es el de siempre (ningún <button>)", () => {
    for (const g of [gasto({ conciliado: true }), gasto({ monto_vinculado: "1", faltante: "499" }), gasto({})]) {
      expect(renderToStaticMarkup(<BancoBadge gasto={g} />)).not.toContain("<button");
    }
  });

  it("con `alAbrir`, Conciliado / Parcial / Sin conciliar son <button> accesibles con cursor de mano", () => {
    const casos = [
      { g: gasto({ conciliado: true }), label: "Conciliado", clic: "Clic para ver el cargo del banco y su estado de cuenta." },
      { g: gasto({ monto_vinculado: "200", faltante: "300" }), label: "Parcial", clic: "Clic para ver el cargo del banco y su estado de cuenta." },
      { g: gasto({}), label: "Sin conciliar", clic: "Clic para ver por qué y buscar el cargo." },
    ];
    for (const { g, label, clic } of casos) {
      const html = renderToStaticMarkup(<BancoBadge gasto={g} alAbrir={noop} />);
      expect(html, label).toContain('<button type="button"');
      expect(html, label).toContain('aria-haspopup="dialog"');
      expect(html, label).toContain("cursor-pointer");
      expect(html, label).toMatch(new RegExp(`aria-label="${label}: ver la conciliación con el banco del gasto de \\$500\\.00`));
      expect(html, label).toContain(clic);
      expect(html, label).toContain(`>${label}</button>`);
    }
  });

  it("NO_APLICA («—») nunca es botón, ni con `alAbrir`", () => {
    const html = renderToStaticMarkup(<BancoBadge gasto={gasto({ medio_pago: "EFECTIVO" })} alAbrir={noop} />);
    expect(html).not.toContain("<button");
    expect(html).toContain("—");
  });

  it("espejo EXACTO del API: algo ligado y sin conciliar ⇒ PARCIAL (aunque cubra el monto)", () => {
    expect(estadoBancoGasto({ conciliado: false, monto_vinculado: "500", faltante: "0", monto: "500" }).value).toBe("PARCIAL");
    expect(estadoBancoGasto({ conciliado: false, monto_vinculado: 0, faltante: "500", monto: "500", medio_pago: "TRANSFERENCIA" }).value).toBe(
      "SIN_CONCILIAR",
    );
    // Un efectivo ligado a medias deja de ser «—».
    expect(estadoBancoGasto({ conciliado: false, monto_vinculado: 212, faltante: 212, monto: 424, medio_pago: "EFECTIVO" }).value).toBe(
      "PARCIAL",
    );
  });

  it("un CompraPago (monto como número) entra por el mismo tipo", () => {
    const pago: CompraPago = {
      id: "p-1",
      fecha_gasto: "2026-09-01",
      categoria: "REFACCION",
      monto: 422.86,
      moneda: "USD",
      tc_gasto: null,
      medio_pago: "TARJETA_CORP",
      proveedor: null,
      foto_url: null,
      notas: null,
      compra_rol: "MERCANCIA",
      conciliado: false,
    };
    expect(renderToStaticMarkup(<BancoBadge gasto={pago} alAbrir={noop} />)).toContain("Sin conciliar");
    expect(renderToStaticMarkup(<BancoBadge gasto={{ ...pago, medio_pago: "EFECTIVO" }} />)).toContain("—");
  });
});
