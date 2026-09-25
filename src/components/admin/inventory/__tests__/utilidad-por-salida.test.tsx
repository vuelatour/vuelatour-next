/**
 * «Utilidad por salida» del detalle del producto y el CABLEADO de la salida
 * (25-sep-2026). La lógica pura vive en `lib/admin/__tests__/
 * inventario-utilidad.test.ts` e `inventario-salida.test.ts`; aquí se cuida
 * que la card pinte cada monto en SU moneda con las filas REALES del aceite
 * 15W-50 (contrato §5.4) y que el diálogo de movimiento ya no mande
 * `venta_unitaria: "0"` cuando el precio va vacío (con el margen, eso dejaba
 * toda salida del panel a costo, sin utilidad).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UtilidadPorSalida } from "../utilidad-por-salida";
import type { InventarioItemResumen, ResumenVenta } from "@/types/inventory";

const venta = (extra: Partial<ResumenVenta>): ResumenVenta => ({
  movimiento_id: "40da8327-e60f-41aa-a061-8071ed1f9fc3",
  fecha: "2026-09-01",
  cantidad: 12,
  precio_unitario_mxn: null,
  total_mxn: null,
  venta_moneda: "USD",
  venta_unitaria_capturada: 26.5625,
  a_costo: false,
  sin_tc: true,
  costo_fifo_mxn: null,
  ganancia_mxn: null,
  venta_total: 318.75,
  costo_fifo_usd: 255,
  ganancia_usd: 63.75,
  moneda_utilidad: "USD",
  utilidad_incompleta: false,
  vendido_a: "XA-VGV",
  aeronave_id: "3d0546c3-941f-45cc-b8a9-e3ee77545e68",
  para_flota: false,
  referencia: "0",
  descripcion: "Aceite multigrado semisintético 15W-50",
  remanente: 108,
  gasto_id: "127a997d-f7e4-4318-af41-e203f86fa12c",
  ...extra,
});

const resumen = (ventas: ResumenVenta[], totales: Partial<InventarioItemResumen["totales"]> = {}) =>
  ({
    item: {
      id: "d99df930-16e2-499a-877a-37e9518c1041",
      nombre: "Aceite multigrado semisintético 15W-50",
      numero_parte: null,
      unidad: "qt",
      categoria: "Aceites",
      precio_venta: null,
      precio_venta_moneda: null,
    },
    moneda: "MXN",
    margen_venta_pct: 25,
    periodo: null,
    compras: [],
    ventas,
    resumen_diario: [],
    totales: {
      compras_cant: null,
      compras_mxn: null,
      ventas_cant: 36,
      ventas_mxn: null,
      ventas_a_costo_mxn: 49749.9,
      costo_ventas_mxn: null,
      utilidad_mxn: null,
      ventas_usd: 956.25,
      costo_ventas_usd: 765,
      utilidad_usd: 191.25,
      ventas_sin_utilidad: 0,
      con_entradas_sin_costo: false,
      con_movimientos_sin_tc: true,
      existencia_actual: 84,
      valor_costo_mxn: 0,
      ...totales,
    },
  }) as InventarioItemResumen;

describe("UtilidadPorSalida", () => {
  it("fila del aceite a XA-VGV: costo, venta y utilidad en DÓLARES; total por moneda", () => {
    const html = renderToStaticMarkup(
      <UtilidadPorSalida
        resumen={resumen([
          venta({}),
          venta({
            movimiento_id: "19b737b8-790d-4fbb-b4bb-dd3aaa7e9fd7",
            cantidad: 24,
            venta_total: 637.5,
            costo_fifo_usd: 510,
            ganancia_usd: 127.5,
            vendido_a: "N4142R",
          }),
        ])}
        unidad="qt"
      />,
    );
    for (const h of ["Fecha", "Avión", "Cantidad", "Costo", "Venta", "Utilidad"]) {
      expect(html).toContain(`>${h}<`);
    }
    expect(html).toContain("XA-VGV");
    expect(html).toContain("12 qt");
    expect(html).toContain("$255 USD");
    expect(html).toContain("$318.75 USD");
    expect(html).toContain("+$63.75 USD");
    expect(html).toContain("+$127.50 USD");
    // Total en su moneda (nunca sumado con pesos).
    expect(html).toContain("+$191.25 USD");
    expect(html).not.toContain("MXN</span>");
    expect(html).toContain("costo + 25 %");
  });

  it("salida vieja A COSTO (jul/ago, MXN) ⇒ «A costo · sin utilidad»", () => {
    const html = renderToStaticMarkup(
      <UtilidadPorSalida
        resumen={resumen([
          venta({
            movimiento_id: "533fce35-6088-432b-b41f-a242aa471b42",
            fecha: "2026-08-06",
            cantidad: 24,
            a_costo: true,
            sin_tc: false,
            venta_moneda: null,
            venta_unitaria_capturada: null,
            total_mxn: 39799.92,
            costo_fifo_mxn: 39799.92,
            venta_total: null,
            ganancia_usd: null,
            moneda_utilidad: null,
            vendido_a: "N990GG",
          }),
        ])}
      />,
    );
    expect(html).toContain("N990GG");
    expect(html).toContain("$39,799.92 MXN");
    expect(html).toContain("A costo · sin utilidad");
  });

  it("venta en pesos sobre costo en dólares sin T.C. ⇒ ámbar «no calculable» y aviso en el total", () => {
    const html = renderToStaticMarkup(
      <UtilidadPorSalida
        resumen={resumen(
          [
            venta({
              venta_moneda: "MXN",
              total_mxn: 3000,
              venta_total: 3000,
              ganancia_usd: null,
              moneda_utilidad: null,
              utilidad_incompleta: true,
            }),
          ],
          { utilidad_usd: null, ventas_sin_utilidad: 1 },
        )}
      />,
    );
    expect(html).toContain("no calculable: venta en pesos sobre costo en dólares sin T.C.");
    expect(html).toContain("1 venta en pesos sobre costo en dólares sin tipo de cambio");
  });

  it("sin salidas lo dice; sin resumen no pinta nada (el bloque de arriba ya avisa)", () => {
    expect(renderToStaticMarkup(<UtilidadPorSalida resumen={resumen([])} />)).toContain(
      "Sin salidas a aviones todavía.",
    );
    expect(renderToStaticMarkup(<UtilidadPorSalida resumen={null} />)).toBe("");
  });
});

describe("cableado de la SALIDA (movimiento-dialog)", () => {
  const src = readFileSync(path.join(__dirname, "../movimiento-dialog.tsx"), "utf8");

  it("la venta sale de `ventaDelFormulario` y el vacío YA NO viaja como 0", () => {
    expect(src).toContain("ventaDelFormulario(");
    expect(src).not.toMatch(/venta_unitaria:\s*"0"/);
  });

  it("casilla «Cargar a costo, sin utilidad» y toast con `textoSalidaRegistrada`", () => {
    expect(src).toContain("ETIQUETA_A_COSTO");
    expect(src).toContain("textoSalidaRegistrada(");
  });
});
