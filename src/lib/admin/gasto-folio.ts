/**
 * Ayuda del campo «Folio / remisión del ticket» del gasto (13-oct-2026,
 * concepto del SPEI). PURO (prueba `__tests__/gasto-folio.test.ts`).
 *
 * En un pago por transferencia (los 29 «Pago VIP SAESA») el folio que importa
 * es el NÚMERO DE LA FACTURA que se paga: Conciliación lo compara con el
 * concepto del SPEI («fact vip 7360») para marcar con ★ el gasto correcto y
 * para avisar si el cargo quedó ligado al gasto equivocado. El folio es ÚNICO
 * desde 4 caracteres (`uq_gasto_folio_ticket_norm`): cuando UNA factura ampara
 * VARIOS gastos, el número va en la primera línea de sus notas («fact 7352»).
 * Solo cambia el texto de ayuda: ni el schema ni lo que se guarda.
 */

export const HINT_FOLIO_TRANSFERENCIA =
  " En pagos por transferencia (p. ej. «Pago VIP SAESA») escribe aquí el número de la factura que pagas: Conciliación lo compara con el concepto del SPEI. Si una factura ampara varios gastos, ponlo en la primera línea de sus notas («fact 7352»): el folio no se puede repetir.";

/** La ayuda de siempre y, si el medio es TRANSFERENCIA, la regla del folio en transferencias. */
export function hintFolioGasto(medio: string | null | undefined, hintDeSiempre: string): string {
  return hintDeSiempre + (medio === "TRANSFERENCIA" ? HINT_FOLIO_TRANSFERENCIA : "");
}
