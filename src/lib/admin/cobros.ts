/**
 * Regla ÚNICA de "¿está pagado?" en el panel — igual que el API
 * (refreshCobradoFlag): un vuelo cobrado en pesos convierte a USD con el TC y
 * el redondeo deja centavos fantasma (3,596 USD × 17.21 = 61,887.16 MXN que
 * se muestra como 61,887.00; al cobrarlos regresan 3,595.99 USD → "faltaba"
 * $0.01). Hasta 1 USD de diferencia es redondeo, no deuda (caso #131).
 */
export const TOLERANCIA_COBRO_USD = 1;

// ===== Cuentas bancarias que reciben cobros (catálogo FIJO, 28-ago-2026) =====
// Antes `cuenta_destino` era texto libre y cada quien escribía el alias a su
// manera ("HSBC MXN", "hsbc pesos"…), lo que impedía agrupar por cuenta en
// tesorería/conciliación. Valores EXACTOS (con acento): el API los valida
// con @IsIn — cambiar uno aquí exige cambiarlo también en el API.
export const CUENTAS_COBRO = [
  { value: "Paywise", moneda: "MXN" },
  { value: "HSBC Dólares", moneda: "USD" },
  { value: "HSBC Pesos", moneda: "MXN" },
  { value: "Scotiabank Dólares", moneda: "USD" },
  { value: "Scotiabank Pesos", moneda: "MXN" },
] as const;

export type CuentaCobro = (typeof CUENTAS_COBRO)[number]["value"];

/** Tupla no vacía para `z.enum(...)`. */
export const CUENTAS_COBRO_VALUES = CUENTAS_COBRO.map((c) => c.value) as [
  CuentaCobro,
  ...CuentaCobro[],
];

/** Moneda de una cuenta del catálogo (null si es un alias legado / libre). */
export function monedaDeCuenta(cuenta: string | null | undefined): "USD" | "MXN" | null {
  return CUENTAS_COBRO.find((c) => c.value === cuenta)?.moneda ?? null;
}

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

// ===== Semáforo de estatus de cobro (listas de vuelos/cotizaciones) =====
// Misma taxonomía que el filtro de la lista de vuelos (acordada con el
// cliente): Cobrado / Parcial (con abonos) / Sin cobro; y "no aplica" para
// filas sin precio, cotización abierta o aún en cotización.

export type EstadoCobroKey = "COBRADO" | "PARCIAL" | "SIN_COBROS" | "NO_APLICA";

export interface EstadoCobroSemaforo {
  key: EstadoCobroKey;
  label: string;
  title?: string;
}

export function estadoCobroSemaforo(v: {
  montoTotalUsd: number;
  cobrado: boolean;
  /** null = el batch de cobros no está disponible (rol sin acceso): se
   *  degrada a "Por cobrar" sin distinguir parcial. */
  totalCobradoUsd: number | null;
  sinTcCount?: number;
  cotizacionAbierta?: boolean;
  /** SOLICITUD/COTIZADO: aún no hay nada que cobrar. */
  enCotizacion?: boolean;
  cancelado?: boolean;
  /** Cliente interno: cotiza $0 a propósito (no es "sin precio"). */
  esInterno?: boolean;
}): EstadoCobroSemaforo {
  const avisoSinTc =
    (v.sinTcCount ?? 0) > 0
      ? ` · ⚠ ${v.sinTcCount} cobro(s) en MXN sin TC no suman: captura el TC`
      : "";
  if (v.cotizacionAbierta) {
    return {
      key: "NO_APLICA",
      label: "Abierta",
      title: "Cotización abierta: el precio se cierra al final del viaje",
    };
  }
  // $0 NUNCA es cobrado ni deuda (gate del API, caso #38): internos,
  // reservas sin cotizar, solicitudes.
  if (!(v.montoTotalUsd > 0)) {
    if (v.esInterno) {
      return {
        key: "NO_APLICA",
        label: "Interno",
        title: "Cliente interno: cotiza $0 a propósito (solo pesa en el balance del avión)",
      };
    }
    return { key: "NO_APLICA", label: "Sin precio" };
  }
  if (v.cobrado) return { key: "COBRADO", label: "Cobrado" };
  const cobradoUsd = v.totalCobradoUsd;
  // Cancelado ANTES de "Parcial": un ámbar invitaría a cobrar el saldo de
  // un vuelo que ya no existe — el dinero vivo lo vigila el pre-cierre.
  if (v.cancelado) {
    if (cobradoUsd != null && cobradoUsd > 0) {
      return {
        key: "NO_APLICA",
        label: "Con cobros",
        title: `Vuelo cancelado con $${cobradoUsd.toLocaleString("en-US")} USD cobrados (cargo por cancelación; el pre-cierre lo vigila)`,
      };
    }
    return { key: "NO_APLICA", label: "—", title: "Vuelo cancelado sin cobros" };
  }
  if (cobradoUsd != null && cobradoUsd > 0) {
    // Flag `cobrado` desfasado: si lo que falta cabe en la tolerancia de
    // redondeo, es cobrado, no parcial (fuente única, caso #131).
    if (pendienteCobro(v.montoTotalUsd, cobradoUsd) === 0) {
      return { key: "COBRADO", label: "Cobrado" };
    }
    return {
      key: "PARCIAL",
      label: "Parcial",
      title: `Cobrado $${cobradoUsd.toLocaleString("en-US")} de $${v.montoTotalUsd.toLocaleString("en-US")} USD${avisoSinTc}`,
    };
  }
  // Hay cobros pero TODOS en MXN sin TC (no convierten): es dinero
  // capturado, no "sin cobro" — mismo criterio que el filtro PARCIAL.
  if (cobradoUsd != null && (v.sinTcCount ?? 0) > 0) {
    return {
      key: "PARCIAL",
      label: "Parcial",
      title: `Cobros en MXN sin TC: no se pueden convertir a USD${avisoSinTc}`,
    };
  }
  if (v.enCotizacion) {
    return { key: "NO_APLICA", label: "—", title: "Aún en cotización" };
  }
  if (cobradoUsd == null) {
    // Sin el batch no se distingue parcial de cero: paraguas del filtro.
    return { key: "SIN_COBROS", label: "Por cobrar", title: avisoSinTc || undefined };
  }
  return {
    key: "SIN_COBROS",
    label: "Sin cobro",
    title: `Total $${v.montoTotalUsd.toLocaleString("en-US")} USD sin ningún cobro${avisoSinTc}`,
  };
}

/**
 * Monto SUGERIDO al cambiar el cobro a PESOS (17-sep-2026, pedido del cliente
 * sobre el vuelo #314).
 *
 * El operador cobra lo que el cliente vio impreso. Ese número es
 * `vuelo.monto_total_mxn` — lo compuso el motor y lo persistió el API — y NO
 * es `monto_total_usd × tc`: los renglones capturados en pesos (TUAS, extras)
 * entran al total tal cual sin pasar por el tipo de cambio, y el producto se
 * desvía centavos («la hoja dice $100,000.00 y aquí sale $99,999.81»).
 *
 * - Vuelo SIN cobros: los pesos EXACTOS de la cotización.
 * - Vuelo CON cobros: ya no aplica el total (parte está pagada) → el
 *   pendiente en USD convertido con el TC, a centavos.
 * - Cancelado: sin sugerencia — el importe retenido lo decide la oficina.
 * - Sin datos suficientes: `null` (el campo se queda como está).
 */
export function montoSugeridoMxn(v: {
  /** `vuelo.monto_total_mxn` (null = el vuelo no pactó pesos). */
  montoTotalMxn: number | null;
  /** Pendiente en USD (ya con la tolerancia de `pendienteCobro`). */
  pendienteUsd: number;
  /** TC que se va a usar en este cobro. */
  tc: number;
  tieneCobros: boolean;
  cancelado: boolean;
}): number | null {
  if (v.cancelado) return null;
  if (!v.tieneCobros && v.montoTotalMxn != null && v.montoTotalMxn > 0) {
    return v.montoTotalMxn;
  }
  if (!(v.tc > 0) || !(v.pendienteUsd > 0)) return null;
  return Math.round(v.pendienteUsd * v.tc * 100) / 100;
}
