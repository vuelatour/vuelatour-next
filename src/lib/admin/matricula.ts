/**
 * Matrículas: normalización ÚNICA para cruzar la matrícula que la IA leyó en
 * un comprobante contra el catálogo de aviones (misma regla que el API):
 * mayúsculas y solo A-Z/0-9 — "N-621TX", "n621tx" y "N621 TX" son la misma.
 * Antes el prefill del alta solo quitaba guiones y el caso Paywise
 * ("N621TX" en minúsculas/espaciado distinto) se le escapaba.
 */
export function normMatricula(m: string): string {
  return m.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Avión del catálogo cuya matrícula coincide con la leída (normalizadas). */
export function avionPorMatricula<T extends { matricula: string }>(
  aircraft: T[],
  matricula: string,
): T | undefined {
  const needle = normMatricula(matricula);
  if (!needle) return undefined;
  return aircraft.find((a) => normMatricula(a.matricula) === needle);
}
