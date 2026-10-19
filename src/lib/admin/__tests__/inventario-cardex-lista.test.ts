import { describe, expect, it } from "vitest";
import {
  SIN_MOVIMIENTOS_CARDEX,
  SIN_MOVIMIENTOS_MES,
  TITULO_CARDEX_LISTA,
  TITULO_VENDIDAS_MES,
  etiquetaMesCardex,
  filasCardexPorFecha,
  gruposCardexPorMes,
  piezasMesCardex,
  textoDineroMes,
} from "@/lib/admin/inventario-cardex-lista";
import type { MesCardexResumen, ResumenCompra, ResumenVenta } from "@/types/inventory";

const compra = (c: Partial<ResumenCompra>): ResumenCompra => ({
  movimiento_id: null,
  fecha: "2026-08-29",
  tipo: "ENTRADA",
  cantidad: 1,
  precio_unitario_mxn: null,
  total_mxn: null,
  moneda_captura: "USD",
  costo_unitario_capturado: 0,
  tc_usd_mxn: null,
  sin_costo: false,
  sin_tc: false,
  proveedor_nombre: null,
  aeronave_matricula: null,
  referencia: null,
  descripcion: "",
  stock_despues: 0,
  compra_id: null,
  ...c,
});

const venta = (v: Partial<ResumenVenta>): ResumenVenta => ({
  movimiento_id: null,
  fecha: "2026-09-01",
  cantidad: 1,
  precio_unitario_mxn: null,
  total_mxn: null,
  venta_moneda: null,
  venta_unitaria_capturada: null,
  a_costo: false,
  sin_tc: false,
  costo_fifo_mxn: null,
  ganancia_mxn: null,
  vendido_a: "XA-VGV",
  aeronave_id: null,
  para_flota: false,
  referencia: null,
  descripcion: "",
  remanente: 0,
  gasto_id: null,
  ...v,
});

const mes = (m: Partial<MesCardexResumen> & { mes: string }): MesCardexResumen => ({
  stock_inicio: 0,
  entradas: 0,
  compras: 0,
  unidades_vendidas: 0,
  stock_final: 0,
  movimientos: 0,
  vendido_mxn: null,
  utilidad_mxn: null,
  en_curso: false,
  ...m,
});

describe("filasCardexPorFecha", () => {
  it("con `orden` del API mezcla por esa posición (aunque el día empate)", () => {
    const filas = filasCardexPorFecha(
      [
        compra({ movimiento_id: "c1", fecha: "2026-07-13", orden: 0, stock_despues: 30 }),
        compra({ movimiento_id: "c2", fecha: "2026-08-29", orden: 3, stock_despues: 120 }),
      ],
      [
        venta({ movimiento_id: "v1", fecha: "2026-07-17", orden: 1, remanente: 26 }),
        venta({ movimiento_id: "v2", fecha: "2026-08-29", orden: 2, remanente: 0 }),
      ],
    );
    expect(filas.map((f) => (f.clase === "compra" ? f.compra.movimiento_id : f.venta.movimiento_id))).toEqual([
      "c1",
      "v1",
      "v2",
      "c2",
    ]);
    expect(filas.map((f) => f.existencia)).toEqual([30, 26, 0, 120]);
  });

  it("API previo (sin `orden`): por fecha y, el mismo día, primero lo que entró", () => {
    const filas = filasCardexPorFecha(
      [compra({ movimiento_id: "c", fecha: "2026-09-01" })],
      [
        venta({ movimiento_id: "v0", fecha: "2026-08-06" }),
        venta({ movimiento_id: "v1", fecha: "2026-09-01" }),
      ],
    );
    expect(filas.map((f) => (f.clase === "compra" ? f.compra.movimiento_id : f.venta.movimiento_id))).toEqual([
      "v0",
      "c",
      "v1",
    ]);
  });

  it("sin filas ⇒ lista vacía", () => {
    expect(filasCardexPorFecha([], [])).toEqual([]);
  });
});

describe("gruposCardexPorMes", () => {
  it("un grupo por mes del API (también sin movimientos) y cada fila en su mes", () => {
    const filas = filasCardexPorFecha(
      [compra({ fecha: "2026-07-13", orden: 0 }), compra({ fecha: "2026-09-02", orden: 1 })],
      [],
    );
    const grupos = gruposCardexPorMes(filas, [
      mes({ mes: "2026-07", movimientos: 1 }),
      mes({ mes: "2026-08" }),
      mes({ mes: "2026-09", movimientos: 1 }),
      mes({ mes: "2026-10", en_curso: true }),
    ]);
    expect(grupos.map((g) => [g.mes, g.etiqueta, g.filas.length])).toEqual([
      ["2026-07", "Julio 2026", 1],
      ["2026-08", "Agosto 2026", 0],
      ["2026-09", "Septiembre 2026", 1],
      ["2026-10", "Octubre 2026 (en curso)", 0],
    ]);
  });

  it("API previo (sin `meses`): los meses salen de las filas y sin renglón", () => {
    const filas = filasCardexPorFecha([compra({ fecha: "2026-08-29" })], [venta({ fecha: "2026-09-01" })]);
    const grupos = gruposCardexPorMes(filas, undefined);
    expect(grupos.map((g) => [g.mes, g.resumen])).toEqual([
      ["2026-08", null],
      ["2026-09", null],
    ]);
  });

  it("un movimiento fuera de los meses del API abre su propio grupo, en orden", () => {
    const filas = filasCardexPorFecha([compra({ fecha: "2026-06-30", orden: 0 })], []);
    const grupos = gruposCardexPorMes(filas, [mes({ mes: "2026-07" })]);
    expect(grupos.map((g) => g.mes)).toEqual(["2026-06", "2026-07"]);
  });

  it("una fecha ilegible se queda con el mes anterior (nunca se pierde)", () => {
    const filas = filasCardexPorFecha(
      [compra({ fecha: "2026-08-29", orden: 0 }), compra({ fecha: "", orden: 1 })],
      [],
    );
    const grupos = gruposCardexPorMes(filas, null);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].filas).toHaveLength(2);
  });
});

describe("textos del mes", () => {
  it("etiqueta en es-MX; ilegible tal cual", () => {
    expect(etiquetaMesCardex("2026-08")).toBe("Agosto 2026");
    expect(etiquetaMesCardex("2026-10", true)).toBe("Octubre 2026 (en curso)");
    expect(etiquetaMesCardex("2026-13")).toBe("2026-13");
  });

  it("piezas: stock al inicio, entradas, vendidas y stock al final (hoy en el mes en curso)", () => {
    const m = mes({ mes: "2026-09", stock_inicio: 120, entradas: 0, unidades_vendidas: 36, stock_final: 84 });
    expect(piezasMesCardex(m, "qt")).toEqual([
      { titulo: "Stock al inicio", valor: "120 qt" },
      { titulo: "Entradas", valor: "0 qt" },
      { titulo: "Vendidas", valor: "36 qt" },
      { titulo: "Stock al final", valor: "84 qt" },
    ]);
    expect(piezasMesCardex({ ...m, en_curso: true }, "qt")[3].titulo).toBe("Stock hoy");
  });

  it("dinero del mes solo con ventas con precio", () => {
    expect(textoDineroMes(mes({ mes: "2026-09", vendido_mxn: 16263.61, utilidad_mxn: 3252.72 }))).toBe(
      "Vendido $16,263.61 MXN · utilidad +$3,252.72 MXN",
    );
    expect(textoDineroMes(mes({ mes: "2026-08" }))).toBeNull();
  });

  it("textos fijos", () => {
    expect(TITULO_CARDEX_LISTA).toBe("Cardex del producto · por fecha");
    expect(SIN_MOVIMIENTOS_MES).toBe("Sin movimientos en el mes.");
    expect(SIN_MOVIMIENTOS_CARDEX).toBe(
      "Sin movimientos todavía. Registra una entrada para dar de alta stock.",
    );
    expect(TITULO_VENDIDAS_MES).toMatch(/con precio o a costo/);
  });
});
