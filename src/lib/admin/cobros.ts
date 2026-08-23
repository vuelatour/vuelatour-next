/**
 * Regla ÚNICA de "¿está pagado?" en el panel — igual que el API
 * (refreshCobradoFlag): un vuelo cobrado en pesos convierte a USD con el TC y
 * el redondeo deja centavos fantasma (3,596 USD × 17.21 = 61,887.16 MXN que
 * se muestra como 61,887.00; al cobrarlos regresan 3,595.99 USD → "faltaba"
 * $0.01). Hasta 1 USD de diferencia es redondeo, no deuda (caso #131).
 */
export const TOLERANCIA_COBRO_USD = 1;

/** Pendiente REAL: 0 si lo que falta cabe en la tolerancia de redondeo. */
export function pendienteCobro(totalUsd: number, cobradoUsd: number): number {
  const p = Math.round((totalUsd - cobradoUsd) * 100) / 100;
  return p > TOLERANCIA_COBRO_USD ? p : 0;
}

/** Centavos de redondeo (0 < diferencia ≤ tolerancia) para mostrarlos como
 *  aclaración, nunca como deuda. */
export function diferenciaRedondeo(totalUsd: number, cobradoUsd: number): number {
  const p = Math.round((totalUsd - cobradoUsd) * 100) / 100;
  return p > 0 && p <= TOLERANCIA_COBRO_USD ? p : 0;
}
