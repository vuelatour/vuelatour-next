import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_CAPTURA,
  CATEGORIAS_CAPTURA_GASTO_NUEVO,
  CATEGORIAS_FILTRO_GASTO,
  CATEGORIA_SOLO_TIENDA,
  ETIQUETA_IR_A_COMPRAS_TIENDA,
  HREF_COMPRAS_TIENDA,
  TEXTO_REFACCION_EN_TIENDA,
} from "@/lib/admin/categorias-gasto";
import {
  BOTON_CONVERTIR_EN_COMPRA,
  DESCRIPCION_REFACCIONES_POR_CONVERTIR,
  TEXTO_CONVERTIR_FALLO,
  TITULO_REFACCIONES_POR_CONVERTIR,
  TOPE_REFACCIONES_POR_CONVERTIR,
  VACIO_REFACCIONES_POR_CONVERTIR,
  conceptoRefaccion,
  esRefaccionPorConvertir,
  textoCompraCreadaDesdeGasto,
} from "@/lib/admin/compras-estado";
import {
  CAMPOS_OPCIONALES_GASTOS,
  CAMPO_SIN_REFACCIONES,
  DESCRIPCION_COMPRAS_FUERA_DE_GASTOS,
  TITULO_COMPRAS_FUERA_DE_GASTOS,
  leerFiltrosGastos,
  queryBaseGastos,
  queryExcelGastos,
  queryListaGastos,
} from "@/lib/admin/gastos-vista";

/**
 * LAS REFACCIONES VIVEN EN COMPRAS DE LA TIENDA (6-nov-2026, API 0.0.127,
 * invariante 123 del API). Pedido de Pablo: «sacar de Gastos todo lo que tenga
 * que ver con refacciones; todo se mete por la tienda y desde ahí se le carga
 * al avión… las balatas del 27 de octubre deberían aparecer en Compras de la
 * tienda». Gastos ya no las lista ni las ofrece al capturar; Compras de la
 * tienda las muestra «por convertir». Los números no se mueven.
 */
const HOY = "2026-11-06";
const filtros = (qs: string) => {
  const p = new URLSearchParams(qs);
  return leerFiltrosGastos((k) => p.get(k));
};
const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

describe("el alta de oficina ya no ofrece Refacción", () => {
  it("CATEGORIAS_CAPTURA_GASTO_NUEVO = las de captura menos REFACCION, en el mismo orden", () => {
    expect(CATEGORIA_SOLO_TIENDA).toBe("REFACCION");
    expect(CATEGORIAS_CAPTURA).toContain("REFACCION");
    expect(CATEGORIAS_CAPTURA_GASTO_NUEVO).not.toContain("REFACCION");
    expect([...CATEGORIAS_CAPTURA_GASTO_NUEVO]).toEqual(CATEGORIAS_CAPTURA.filter((c) => c !== "REFACCION"));
    // El filtro de Gastos y la edición de históricos la conservan.
    expect(CATEGORIAS_FILTRO_GASTO).toContain("REFACCION");
  });

  it("el diálogo usa la lista nueva y enlaza a Compras de la tienda", () => {
    const dialogo = leer("../../../components/admin/expenses/expense-create-dialog.tsx");
    expect(dialogo).toContain("const CATEGORIAS = CATEGORIAS_CAPTURA_GASTO_NUEVO.map(opcionCategoriaGasto);");
    expect(dialogo).not.toMatch(/const CATEGORIAS = CATEGORIAS_CAPTURA\.map/);
    expect(dialogo).toContain('data-nota="refacciones-en-tienda"');
    expect(dialogo).toContain("href={HREF_COMPRAS_TIENDA}");
    // La EDICIÓN de un gasto histórico sigue con la lista completa.
    const edicion = leer("../../../components/admin/expenses/expense-verify-dialog.tsx");
    expect(edicion).toMatch(/CATEGORIAS_CAPTURA\.flatMap/);
    expect(TEXTO_REFACCION_EN_TIENDA).toBe("¿Es una refacción? Se registra en Compras de la tienda (Compra directa), no aquí.");
    expect(ETIQUETA_IR_A_COMPRAS_TIENDA).toBe("Ir a Compras de la tienda ›");
    expect(HREF_COMPRAS_TIENDA).toBe("/admin/inventory/compras");
  });
});

describe("Gastos deja fuera toda la categoría REFACCION", () => {
  it("lista, contadores y Excel llevan `sin_refacciones` junto a `sin_compras`; la vista enfocada no", () => {
    expect(CAMPO_SIN_REFACCIONES).toBe("sin_refacciones");
    expect(CAMPOS_OPCIONALES_GASTOS).toContain("sin_refacciones");
    const f = filtros("f=pendientes");
    expect(queryBaseGastos(f, HOY)).toMatchObject({ sin_compras: true, sin_refacciones: true, excluir_categoria: "NOMINA" });
    expect(queryListaGastos(f, HOY)).toMatchObject({ sin_refacciones: true, pendientes: true });
    expect(queryExcelGastos(f, HOY)).toMatchObject({ sin_refacciones: "true", sin_compras: "true" });
    expect(queryBaseGastos(f, HOY, { conCompras: true })).not.toHaveProperty("sin_refacciones");
    expect(queryBaseGastos(f, HOY, { conCompras: true })).not.toHaveProperty("sin_compras");
  });

  it("la nota bajo los filtros lo dice con las palabras de Pablo", () => {
    expect(TITULO_COMPRAS_FUERA_DE_GASTOS).toBe("Las refacciones se llevan en Compras de la tienda");
    expect(DESCRIPCION_COMPRAS_FUERA_DE_GASTOS).toMatch(/refacciones que se capturaron como gasto/);
    expect(DESCRIPCION_COMPRAS_FUERA_DE_GASTOS).toMatch(/desde ahí se le cargan al avión/);
    expect(DESCRIPCION_COMPRAS_FUERA_DE_GASTOS).toMatch(/Sí cuentan en conciliación, balance y reportes\./);
  });
});

describe("Compras de la tienda: «Refacciones registradas como gasto (por convertir)»", () => {
  const base = { categoria: "REFACCION", compra_id: null, medio_pago: "TARJETA_CORP" };

  it("convertible = REFACCION sin compra y que no sea salida de bodega", () => {
    expect(esRefaccionPorConvertir(base)).toBe(true);
    expect(esRefaccionPorConvertir({ ...base, medio_pago: "EFECTIVO" })).toBe(true);
    expect(esRefaccionPorConvertir({ ...base, medio_pago: "BODEGA" })).toBe(false);
    expect(esRefaccionPorConvertir({ ...base, compra_id: "c-1" })).toBe(false);
    expect(esRefaccionPorConvertir({ ...base, categoria: "OTRO" })).toBe(false);
  });

  it("concepto: primera línea de las notas, o el lugar, o «Refacción»", () => {
    expect(conceptoRefaccion({ notas: "Aircraft Spruce 20 Balatas RAPCO RA66-62\nFactura 1234", lugar: null })).toBe(
      "Aircraft Spruce 20 Balatas RAPCO RA66-62",
    );
    expect(conceptoRefaccion({ notas: "  \n  Bujías  ", lugar: "CUN" })).toBe("Bujías");
    expect(conceptoRefaccion({ notas: null, lugar: "Aircraft Spruce" })).toBe("Aircraft Spruce");
    expect(conceptoRefaccion({ notas: "", lugar: "  " })).toBe("Refacción");
  });

  it("textos", () => {
    expect(TITULO_REFACCIONES_POR_CONVERTIR).toBe("Refacciones registradas como gasto (por convertir)");
    expect(DESCRIPCION_REFACCIONES_POR_CONVERTIR).toMatch(/Ya no salen en Gastos/);
    expect(DESCRIPCION_REFACCIONES_POR_CONVERTIR).toMatch(/Sus números no cambian hasta que las conviertas\./);
    expect(VACIO_REFACCIONES_POR_CONVERTIR).toMatch(/todas las compras de refacciones ya están como compras/);
    expect(BOTON_CONVERTIR_EN_COMPRA).toBe("Convertir en compra");
    expect(TEXTO_CONVERTIR_FALLO).toMatch(/El gasto sigue aquí/);
    expect(TOPE_REFACCIONES_POR_CONVERTIR).toBe(100);
    expect(textoCompraCreadaDesdeGasto(14)).toBe(
      "Compra #14 creada con este gasto como factura de mercancía. Revisa sus refacciones y recíbela en bodega.",
    );
    expect(textoCompraCreadaDesdeGasto(null)).toMatch(/^Compra #\? creada/);
  });

  it("la página pide `categoria=REFACCION&sin_compras=true` y pinta la tarjeta antes de «Gastos de compras»", () => {
    const page = leer("../../../app/admin/inventory/compras/page.tsx");
    expect(page).toMatch(/categoria: "REFACCION",\s*sin_compras: true,\s*limit: TOPE_REFACCIONES_POR_CONVERTIR/);
    expect(page).toContain("refaccionesRes.data.filter(esRefaccionPorConvertir)");
    expect(page.indexOf('id="refacciones-por-convertir"')).toBeLessThan(page.indexOf('id="gastos-de-compras"'));
    const tabla = leer("../../../components/admin/inventory/compras/refacciones-por-convertir.tsx");
    expect(tabla).toContain("createCompraAction({ gasto_mercancia_id: g.id })");
    expect(tabla).toContain("router.push(hrefCompraDeGasto(r.data.id))");
    expect(tabla).toContain("data-convertir-en-compra={g.id}");
  });
});
