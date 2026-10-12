/**
 * Abonos de Conciliación con el menú de Ingresos (12-oct-2026): la
 * traducción MovimientoBancario ⇒ AbonoPendiente y qué cuenta como pendiente.
 */
import { describe, expect, it } from "vitest";
import type { MovimientoBancario } from "@/types/conciliacion";
import {
  abonoPendienteDeMovimiento,
  cuentasDeAbonos,
  esAbonoPendiente,
  monedaIngresoDe,
} from "../conciliacion-abonos";

const MOV: MovimientoBancario = {
  id: "m1",
  cuenta_bancaria_id: "cta",
  fecha: "2026-10-06",
  tipo: "ABONO",
  monto: "19380.00",
  descripcion: "SPEI CRISTY CHAVEZ",
  referencia: "0012345",
  conciliado: false,
  gasto_id: null,
  cobro_id: null,
  origen: "IMPORTADO",
  notas: null,
  created_at: "2026-10-07T12:00:00Z",
  monto_bruto: "20400",
  comision_monto: 1020,
};

describe("abonoPendienteDeMovimiento", () => {
  it("traduce lo que la bandeja sabe y deja en null lo que solo calcula el API", () => {
    expect(abonoPendienteDeMovimiento(MOV, { alias: "Paywise", moneda: "MXN", tipo: "PASARELA" })).toEqual({
      id: "m1",
      cuenta_bancaria_id: "cta",
      cuenta_alias: "Paywise",
      cuenta_moneda: "MXN",
      cuenta_tipo: "PASARELA",
      fecha: "2026-10-06",
      monto: 19380,
      monto_bruto: 20400,
      comision_monto: 1020,
      descripcion: "SPEI CRISTY CHAVEZ",
      referencia: "0012345",
      notas: null,
      patron: null,
      motivo_pendiente: null,
      candidatos_n: null,
      exactos_manual: null,
      posible_duplicado_de: null,
      cliente_sugerido: null,
      categoria_sugerida: null,
    });
  });

  it("sin cuenta conocida o con una fecha con hora, no inventa nada", () => {
    const a = abonoPendienteDeMovimiento({ ...MOV, fecha: "2026-10-06T00:00:00", monto_bruto: null, comision_monto: "" });
    expect(a.cuenta_alias).toBeNull();
    expect(a.cuenta_moneda).toBeNull();
    expect(a.cuenta_tipo).toBeNull();
    expect(a.fecha).toBe("2026-10-06");
    expect(a.monto_bruto).toBeNull();
    expect(a.comision_monto).toBeNull();
  });

  it("moneda y cuentas", () => {
    expect(monedaIngresoDe("USD")).toBe("USD");
    expect(monedaIngresoDe("EUR")).toBeNull();
    expect(monedaIngresoDe(null)).toBeNull();
    expect(cuentasDeAbonos([{ id: "a", alias: "Scotia", moneda: "MXN", tipo: "BANCO" }, { id: "b", alias: "PW", moneda: "MXN" }])).toEqual({
      a: { alias: "Scotia", moneda: "MXN", tipo: "BANCO" },
      b: { alias: "PW", moneda: "MXN", tipo: null },
    });
  });
});

describe("esAbonoPendiente", () => {
  it("solo un ABONO sin conciliar y sin ninguna liga", () => {
    expect(esAbonoPendiente(MOV)).toBe(true);
    expect(esAbonoPendiente({ ...MOV, tipo: "CARGO" })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, conciliado: true })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, cobro_id: "c" })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, cobro_grupo_id: "s" })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, ingreso_id: "i" })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, clasificacion_id: "k" })).toBe(false);
    expect(esAbonoPendiente({ ...MOV, gasto_id: "g" })).toBe(false);
  });
});
