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
