/**
 * Conciliación con PAGOS PARCIALES (14-sep-2026).
 *
 * Caso del cliente: «1 factura se hizo en 2 pagos y al conciliar solo me deja
 * asociar 1». Desde hoy un gasto puede tener N movimientos bancarios ligados
 * (todos en la MISMA moneda del gasto) y queda `conciliado` SOLO cuando la
 * suma de los cargos CUBRE su monto; mientras no lo cubra sigue apareciendo
 * en «Gastos sin banco», con lo que falta.
 *
 * Este módulo es PURO (sin React ni red): la REGLA la impone el API —y un
 * trigger de la BD— en `conciliacion-parcial.util.ts`; aquí solo se LEE lo que
 * respondió y se arman los textos es-MX del panel. Nunca calcular aquí un
 * estado de conciliación que el API no haya mandado: los campos son ADITIVOS
 * y un API sin desplegar simplemente no los manda (comportamiento de hoy).
 */

import { fmtDateOnly } from "@/lib/datetime";

/**
 * Tolerancia en la moneda del gasto (misma que el API: 1.00). Un centavo de
 * diferencia entre la factura y el cargo del banco no deja el gasto "sin
 * cubrir" para siempre.
 */
export const TOLERANCIA_CONCILIACION = 1;

/** numeric de PostgREST puede llegar como string: leerlo SIEMPRE por aquí. */
export function numeroDe(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Redondeo a centavos (evita 0.30000000000000004 en los textos). */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lo que falta por ligar de un gasto (nunca negativo, a 2 decimales). */
export function faltanteDe(montoGasto: unknown, sumaLigada: unknown): number {
  const falta = centavos(numeroDe(montoGasto) - numeroDe(sumaLigada));
  return falta > 0 ? falta : 0;
}

/** ¿Los cargos ligados CUBREN el gasto? (suma ≥ monto − tolerancia). */
export function cubreGasto(monto: unknown, suma: unknown): boolean {
  return numeroDe(suma) >= numeroDe(monto) - TOLERANCIA_CONCILIACION;
}

/** "$277.79" · "$277.79 USD" (la moneda solo cuando no es MXN). */
export function fmtMontoConciliacion(v: unknown, moneda?: string | null): string {
  const texto = `$${numeroDe(v).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return moneda && moneda !== "MXN" ? `${texto} ${moneda}` : texto;
}

/** Gasto tal como lo pintan las listas del panel, con los ADITIVOS del API. */
export interface GastoConParcial {
  monto: string | number;
  moneda?: string | null;
  conciliado?: boolean;
  /** Suma de |monto| de los movimientos bancarios ligados (aditivo). */
  monto_vinculado?: string | number | null;
  /** monto − monto_vinculado, nunca negativo (aditivo). */
  faltante?: string | number | null;
}

export interface EstadoParcialGasto {
  monto: number;
  montoVinculado: number;
  faltante: number;
  moneda: string | null;
  /** Hay al menos un cargo ligado. */
  hayLigados: boolean;
  /** Los cargos ligados cubren el monto del gasto. */
  cubierto: boolean;
  /** Ligado pero NO cubierto: el caso «1 factura, 2 pagos». */
  parcial: boolean;
}

/**
 * Estado de conciliación parcial de un gasto, o `null` cuando el API no mandó
 * los aditivos (skew de deploy): sin datos NO se inventa nada y la UI se
 * comporta como hoy.
 */
export function estadoParcialDeGasto(
  g: GastoConParcial | null | undefined,
): EstadoParcialGasto | null {
  if (!g) return null;
  if (g.monto_vinculado == null && g.faltante == null) return null;
  const monto = numeroDe(g.monto);
  const montoVinculado = numeroDe(g.monto_vinculado);
  // `faltante` manda si vino (lo calcula el API con su tolerancia); si no,
  // se deriva del monto.
  const faltante =
    g.faltante != null ? Math.max(0, centavos(numeroDe(g.faltante))) : faltanteDe(monto, montoVinculado);
  const hayLigados = montoVinculado > 0;
  const cubierto = hayLigados && (g.conciliado === true || cubreGasto(monto, montoVinculado));
  return {
    monto,
    montoVinculado,
    faltante,
    moneda: g.moneda ?? null,
    hayLigados,
    cubierto,
    parcial: hayLigados && !cubierto,
  };
}

/** "faltan $125.82 de $403.61" — la línea del pago parcial. Null si no aplica. */
export function textoFaltanteGasto(g: GastoConParcial | null | undefined): string | null {
  const e = estadoParcialDeGasto(g);
  if (!e || !e.parcial) return null;
  return `faltan ${fmtMontoConciliacion(e.faltante, e.moneda)} de ${fmtMontoConciliacion(
    e.monto,
    e.moneda,
  )}`;
}

/**
 * Nota corta para la celda «Parcial» de la tabla de gastos sin banco:
 * "faltan $125.82" (solo el faltante; el monto ya está en su columna).
 */
export function notaParcialGasto(g: GastoConParcial | null | undefined): string | null {
  const e = estadoParcialDeGasto(g);
  if (!e || !e.parcial) return null;
  return `faltan ${fmtMontoConciliacion(e.faltante, e.moneda)}`;
}

/** Respuesta ADITIVA de PATCH /v1/conciliacion/movimientos/:id. */
export interface RespuestaVinculoGasto {
  gasto_conciliado?: boolean | null;
  monto_vinculado?: string | number | null;
  faltante?: string | number | null;
  /** Moneda del gasto, si el API la mandó (el texto la usa cuando no es MXN). */
  moneda?: string | null;
}

/** Toast tras vincular un cargo con un gasto: cubierto o pago parcial. */
export function toastVinculoGasto(r: RespuestaVinculoGasto | null | undefined): {
  titulo: string;
  descripcion?: string;
} {
  // API sin desplegar (no manda los aditivos): el mensaje de siempre.
  if (!r || (r.monto_vinculado == null && r.faltante == null && r.gasto_conciliado == null)) {
    return { titulo: "Gasto vinculado" };
  }
  const faltante = Math.max(0, centavos(numeroDe(r.faltante)));
  const vinculado = numeroDe(r.monto_vinculado);
  const cubierto = r.gasto_conciliado === true || faltante === 0;
  if (cubierto) {
    return {
      titulo: "Gasto cubierto",
      descripcion: vinculado
        ? `Los cargos ligados suman ${fmtMontoConciliacion(vinculado, r.moneda)}: el gasto queda conciliado.`
        : "El gasto queda conciliado.",
    };
  }
  return {
    titulo: `Pago parcial: faltan ${fmtMontoConciliacion(faltante, r.moneda)}`,
    descripcion: `Ligado ${fmtMontoConciliacion(
      vinculado,
      r.moneda,
    )}. El gasto sigue en «Gastos sin banco» hasta que los cargos lo cubran.`,
  };
}

/** `details` del 409 GASTO_YA_CUBIERTO del API. */
export interface DetalleGastoYaCubierto {
  monto_gasto?: string | number | null;
  suma_ligada?: string | number | null;
  faltante?: string | number | null;
  moneda?: string | null;
  movimientos?: Array<{
    id?: string;
    fecha?: string | null;
    monto?: string | number | null;
  }> | null;
}

/**
 * Texto del 409 GASTO_YA_CUBIERTO: el título es el mensaje del API (ya
 * explica que si es otro pago de la misma factura el gasto debe valer la suma)
 * y la descripción enumera los cargos que YA están ligados, para que la
 * oficina los encuentre en la lista.
 */
export function textoGastoYaCubierto(
  mensaje?: string | null,
  details?: unknown,
): { titulo: string; descripcion: string } {
  const d = (details ?? {}) as DetalleGastoYaCubierto;
  const moneda = d.moneda ?? null;
  const movs = (d.movimientos ?? []).filter(Boolean);
  // `movimientos: []` EXPLÍCITO = el API dice que el gasto no tiene ningún
  // cargo ligado (el rechazo es «este cargo solo ya rebasa el ticket»). Sin
  // `details` (API viejo o error de otra forma) NO se puede afirmar eso: ahí
  // va el texto genérico de siempre.
  const sinCargosConfirmado = Array.isArray(d.movimientos) && movs.length === 0;
  const titulo =
    mensaje?.trim() ||
    `Ese gasto ya está cubierto${
      d.monto_gasto != null
        ? `: ${fmtMontoConciliacion(d.suma_ligada, moneda)} de ${fmtMontoConciliacion(
            d.monto_gasto,
            moneda,
          )}`
        : ""
    }.`;
  const lista = movs
    .map((m) =>
      [m.fecha ? fmtDateOnly(m.fecha) : null, fmtMontoConciliacion(m.monto, moneda)]
        .filter(Boolean)
        .join(" · "),
    )
    .join(" | ");
  // Sin cargos ligados el rechazo es otro caso: el PRIMER cargo ya rebasa el
  // ticket (el cargo paga varias facturas, o el gasto quedó mal capturado).
  // Mandar a «desvincular» ahí sería enviar a la oficina a buscar algo que
  // no existe.
  const descripcion = lista
    ? `Cargos ya ligados: ${lista}. Desvincúlalos en Conciliación si fue un error, o corrige el monto del gasto.`
    : sinCargosConfirmado
      ? "Este gasto todavía no tiene ningún cargo ligado: el cargo es mayor que el gasto. Corrige el monto del gasto, o captúralo por el total si esa factura se pagó completa con este cargo."
      : "Desvincula el cargo ligado en Conciliación si fue un error, o corrige el monto del gasto.";
  return { titulo, descripcion };
}
