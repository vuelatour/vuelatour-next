import { describe, expect, it } from "vitest";
import { montoSugeridoMxn, pendienteCobro } from "@/lib/admin/cobros";

/**
 * MONTO SUGERIDO AL COBRAR EN PESOS (17-sep-2026, vuelo #314).
 *
 * El cliente deposita los pesos que vio impresos en su cotización, no el
 * producto `usd × tc`: con las TUAS/extras capturados en pesos (que entran al
 * total tal cual) y un T.C. de muchos decimales, el producto se desvía
 * centavos — la queja del cliente («cuando son muchos decimales como que
 * siempre cambia a como está en la cotización»).
 */
describe("montoSugeridoMxn", () => {
  // Caso real #314: 5,885.25 USD @ 16.991632 ⇒ $100,000.00 MXN impresos.
  const TC_314 = 16.991632;
  const TOTAL_USD_314 = 5885.25;
  const TOTAL_MXN_314 = 100000;

  it("vuelo SIN cobros: los pesos EXACTOS de la cotización", () => {
    expect(
      montoSugeridoMxn({
        montoTotalMxn: TOTAL_MXN_314,
        pendienteUsd: TOTAL_USD_314,
        tc: TC_314,
        tieneCobros: false,
        cancelado: false,
      }),
    ).toBe(100000);
  });

  it("no es el producto usd × tc (ahí estaba el centavo perdido)", () => {
    // Lo que se veía antes en el diálogo, con el TC ya recortado por la BD.
    expect(Math.round(TOTAL_USD_314 * 16.9916 * 100) / 100).toBe(99999.81);
    // Y ni con el TC completo el producto es EXACTAMENTE el total impreso.
    expect(Math.round(TOTAL_USD_314 * TC_314 * 100) / 100).toBe(100000);
    // La sugerencia no depende del TC: lee el total persistido.
    expect(
      montoSugeridoMxn({
        montoTotalMxn: TOTAL_MXN_314,
        pendienteUsd: TOTAL_USD_314,
        tc: 16.9916,
        tieneCobros: false,
        cancelado: false,
      }),
    ).toBe(100000);
  });

  it("vuelo CON cobros: el pendiente convertido con el TC, a centavos", () => {
    const pendiente = pendienteCobro(TOTAL_USD_314, 3000);
    expect(pendiente).toBe(2885.25);
    expect(
      montoSugeridoMxn({
        montoTotalMxn: TOTAL_MXN_314,
        pendienteUsd: pendiente,
        tc: TC_314,
        tieneCobros: true,
        cancelado: false,
      }),
    ).toBe(Math.round(2885.25 * TC_314 * 100) / 100);
  });

  it("sin total en pesos persistido: cae al pendiente × TC", () => {
    expect(
      montoSugeridoMxn({
        montoTotalMxn: null,
        pendienteUsd: 2314,
        tc: 17.2861,
        tieneCobros: false,
        cancelado: false,
      }),
    ).toBe(40000.04); // el vuelo #140: por eso el total persistido manda
  });

  it("cancelado: NUNCA sugiere (el importe retenido lo decide la oficina)", () => {
    expect(
      montoSugeridoMxn({
        montoTotalMxn: TOTAL_MXN_314,
        pendienteUsd: 0,
        tc: TC_314,
        tieneCobros: false,
        cancelado: true,
      }),
    ).toBeNull();
  });

  it("sin TC y sin total en pesos, o ya liquidado: sin sugerencia", () => {
    expect(
      montoSugeridoMxn({ montoTotalMxn: null, pendienteUsd: 100, tc: 0, tieneCobros: false, cancelado: false }),
    ).toBeNull();
    expect(
      montoSugeridoMxn({ montoTotalMxn: null, pendienteUsd: 0, tc: 17.5, tieneCobros: true, cancelado: false }),
    ).toBeNull();
    // Cliente interno (cotización en $0): tampoco se sugiere un cobro de $0.
    expect(
      montoSugeridoMxn({ montoTotalMxn: 0, pendienteUsd: 0, tc: 17.5, tieneCobros: false, cancelado: false }),
    ).toBeNull();
  });
});
