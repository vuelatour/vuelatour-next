/**
 * Compras fuera de Gastos (6-nov-2026, API 0.0.122, invariante 118 del API):
 * la lista, los contadores y el Excel de Gastos excluyen SIEMPRE los gastos
 * ligados a una compra (`sin_compras=true`), salvo la vista ENFOCADA
 * (`?gasto=` o `ids` del pre-cierre) que los incluye; la nota y el enlace a
 * Compras; y el href de un gasto de compra desde Conciliación.
 */
import { describe, expect, it } from "vitest";
import {
  CAMPOS_OPCIONALES_GASTOS,
  CAMPO_SIN_COMPRAS,
  DESCRIPCION_COMPRAS_EN_VISTA_ENFOCADA,
  DESCRIPCION_COMPRAS_FUERA_DE_GASTOS,
  ETIQUETA_IR_A_COMPRAS,
  HREF_GASTOS_DE_COMPRAS,
  TITULO_COMPRAS_FUERA_DE_GASTOS,
  leerFiltrosGastos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
  textoNotaComprasFueraDeGastos,
} from "@/lib/admin/gastos-vista";
import { hrefCompraDeGasto, hrefGastoEnfocado } from "@/lib/admin/gasto-enfocado";
import { hrefGastoConciliado } from "@/lib/admin/conciliacion-lote";
import { ETIQUETA_ROL_COMPRA, avisoTopeGastosDeCompras, etiquetaRolCompra } from "@/lib/admin/compras-estado";

const HOY = "2026-11-06";
const COMPRA = "ec571eb5-68fc-40a8-8605-0fd797057cca";
const GASTO = "69c252f2-6e31-498c-be0c-b81f2fb53f3f";
const filtros = (qs: string) => {
  const p = new URLSearchParams(qs);
  return leerFiltrosGastos((k) => p.get(k));
};

describe("los gastos de compras se excluyen SIEMPRE de Gastos (salvo la vista enfocada)", () => {
  it("lista, contadores y Excel llevan `sin_compras` (junto a `excluir_categoria`)", () => {
    expect(CAMPO_SIN_COMPRAS).toBe("sin_compras");
    expect(CAMPOS_OPCIONALES_GASTOS).toContain("sin_compras");
    const f = filtros("f=pendientes&categoria=REFACCION");
    expect(queryBaseGastos(f, HOY)).toMatchObject({ excluir_categoria: "NOMINA", sin_compras: true });
    expect(queryListaGastos(f, HOY)).toMatchObject({ sin_compras: true, pendientes: true });
    expect(queryExcelGastos(f, HOY)).toMatchObject({ sin_compras: "true", categoria: "REFACCION", pendientes: "true" });
  });

  it("vista enfocada (`conCompras`): la lista y los contadores NO mandan `sin_compras`; el Excel sigue sin compras", () => {
    const f = filtros("desde=2026-11-02&hasta=2026-11-02");
    expect(queryBaseGastos(f, HOY, { conCompras: true })).not.toHaveProperty("sin_compras");
    expect(queryListaGastos(f, HOY, { conCompras: true })).not.toHaveProperty("sin_compras");
    expect(queryBaseGastos(f, HOY, { conCompras: true }).excluir_categoria).toBe("NOMINA");
    expect(queryBaseGastos(f, HOY, { conCompras: false })).toMatchObject({ sin_compras: true });
    expect(queryExcelGastos(f, HOY)).toMatchObject({ sin_compras: "true" });
  });

  it("la nota: título, texto según la vista y el enlace a Compras", () => {
    expect(TITULO_COMPRAS_FUERA_DE_GASTOS).toBe("Los gastos de las compras de refacciones se llevan en Inventario/Tienda");
    expect(textoNotaComprasFueraDeGastos(false)).toBe(DESCRIPCION_COMPRAS_FUERA_DE_GASTOS);
    expect(textoNotaComprasFueraDeGastos(true)).toBe(DESCRIPCION_COMPRAS_EN_VISTA_ENFOCADA);
    expect(DESCRIPCION_COMPRAS_FUERA_DE_GASTOS).toContain("conciliación");
    expect(ETIQUETA_IR_A_COMPRAS).toBe("Ir a Compras");
    expect(HREF_GASTOS_DE_COMPRAS).toBe("/admin/inventory/compras#gastos-de-compras");
  });
});

describe("a dónde se abre un gasto de compra", () => {
  it("desde Conciliación: a su compra; sin compra, al vuelo o a Gastos enfocado (como antes)", () => {
    expect(hrefCompraDeGasto(COMPRA)).toBe(`/admin/inventory/compras/${COMPRA}`);
    expect(hrefGastoConciliado({ id: GASTO, vuelo_id: null, fecha_gasto: "2026-11-02", compra_id: COMPRA })).toBe(
      `/admin/inventory/compras/${COMPRA}`,
    );
    // La compra manda aunque (por error) trajera vuelo.
    expect(hrefGastoConciliado({ id: GASTO, vuelo_id: "v-1", fecha_gasto: null, compra_id: COMPRA })).toBe(
      `/admin/inventory/compras/${COMPRA}`,
    );
    expect(hrefGastoConciliado({ id: GASTO, vuelo_id: "v-1", fecha_gasto: null })).toBe("/admin/flights/v-1");
    expect(hrefGastoConciliado({ id: GASTO, vuelo_id: null, fecha_gasto: "2026-11-02", compra_id: null })).toBe(
      hrefGastoEnfocado({ id: GASTO, fecha_gasto: "2026-11-02" }),
    );
  });

  it("«Gastos de compras»: etiqueta del rol (también la mercancía) y el aviso del tope", () => {
    expect(ETIQUETA_ROL_COMPRA.MERCANCIA).toBe("Factura de mercancía");
    expect(etiquetaRolCompra("ENVIO")).toBe("Envío");
    expect(etiquetaRolCompra("IMPUESTOS")).toBe("Impuestos / aduana");
    expect(etiquetaRolCompra(null)).toBe("—");
    expect(etiquetaRolCompra("RARO")).toBe("RARO");
    expect(avisoTopeGastosDeCompras(100, 123)).toBe("Se muestran los 100 más recientes de 123.");
    expect(avisoTopeGastosDeCompras(8, 8)).toBeNull();
  });
});
