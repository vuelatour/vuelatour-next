/**
 * Notas del GASTO: qué renglones ⚠ son una DISCREPANCIA por corregir
 * (revisión 6-oct-2026). PURO (sin React ni red).
 *
 * «Verificar / editar» pinta en ámbar «La IA detectó discrepancias entre lo
 * capturado y el comprobante…» cuando las notas traen un ⚠ (la IA, el
 * combustible corregido, avión ≠ tramo, folio repetido: el API los escribe
 * como «⚠ … — revisar»). Desde el API 0.0.63 un gasto en EFECTIVO ligado a un
 * cargo del banco con justificación lleva además «⚠ Conciliado con el cargo
 * bancario del …» (`esLineaNotaGastoVinculo`): es la CONSTANCIA de una liga
 * hecha a propósito, no una discrepancia. Con un `includes("⚠")` a secas,
 * todo gasto así (el estacionamiento del 28-sep del caso real) invitaba a
 * «corregir» monto y moneda, que la liga bloquea.
 */

import { esLineaNotaGastoVinculo } from "@/lib/admin/conciliacion-no-bancario";

/**
 * ¿Las notas traen un renglón ⚠ de discrepancia? Por renglón: el del
 * vínculo no bancario NO cuenta (aunque la razón tecleada lleve un ⚠).
 */
export function tieneDiscrepanciaIa(notas: string | null | undefined): boolean {
  if (typeof notas !== "string" || !notas.includes("⚠")) return false;
  return notas.split(/\r?\n/).some((l) => l.includes("⚠") && !esLineaNotaGastoVinculo(l));
}
