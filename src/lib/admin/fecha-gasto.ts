import { todayCancun } from "@/lib/datetime";

/**
 * Candado de fechas de gasto (auditoría 29-ago): gastos con el año
 * equivocado (la IA leyó "2025" en un ticket) quedaban FUERA de todos los
 * cortes mensuales sin que nadie lo notara. Fuente única de los umbrales y
 * helpers que comparten el alta y la verificación de gastos.
 */
export const DIAS_PASADO_SOSPECHOSO = 60;
export const DIAS_FUTURO_SOSPECHOSO = 2;
/** Más de un año atrás: el API además exige `permitir_fecha_antigua`. */
export const DIAS_FECHA_ANTIGUA = 365;

/**
 * Días de HOY (día Cancún) a la fecha dada (+ = pasado, − = futuro).
 * Ambas fechas YYYY-MM-DD ancladas a UTC: la resta nunca cruza husos.
 */
export function diasDesdeHoyCancun(fecha: string): number {
  const hoy = Date.parse(`${todayCancun()}T00:00:00Z`);
  const f = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(f)) return 0;
  return Math.round((hoy - f) / 86_400_000);
}

/** true = la fecha amerita confirmación explícita antes de guardar
 *  (> 60 días atrás o > 2 días a futuro). */
export function fechaGastoSospechosa(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false; // el zod la rechaza
  const dias = diasDesdeHoyCancun(fecha);
  return dias > DIAS_PASADO_SOSPECHOSO || dias < -DIAS_FUTURO_SOSPECHOSO;
}

/** true = más de un año atrás: mandar `permitir_fecha_antigua: true` al API
 *  (solo tras la confirmación explícita del usuario). */
export function fechaGastoAntigua(fecha: string): boolean {
  return diasDesdeHoyCancun(fecha) > DIAS_FECHA_ANTIGUA;
}

/** dd/mm/aaaa legible (es-MX) para el diálogo de confirmación. */
export function fechaGastoLegible(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

/** Qué tan lejos queda la fecha, en palabras ("hace 93 días" / "en 5 días"). */
export function fechaGastoDistancia(fecha: string): string {
  const dias = diasDesdeHoyCancun(fecha);
  if (dias > 0) return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  if (dias < 0) return dias === -1 ? "mañana" : `en ${-dias} días`;
  return "hoy";
}
