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
    for (const medio of ["TARJETA_CORP", "TRANSFERENCIA", "PAYWISE"]) {
      expect(estadoBancoGasto(gasto({ medio_pago: medio })).value).toBe("SIN_CONCILIAR");
    }
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
