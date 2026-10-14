/**
 * OTROS INGRESOS DEL AVIÓN en el reparto y los tableros (13-oct-2026, API
 * 0.0.75) — textos PUROS de la card del avión, el KPI de la flota y el
 * tablero ejecutivo.
 *
 * Un ingreso de RESULTADO registrado en Ingresos CON avión (reembolso de su
 * servicio o de su aseguradora, venta de una pieza suya, intereses…) cuenta
 * UNA vez, para ESE avión: hoja «Otros ingresos» de su balance, «(+) OTROS
 * INGRESOS USD» de su cascada y su reparto a socios. Deja de ser ingreso de
 * VuelaTour. Los NÚMEROS los manda el API (`ingresos.otros_ingresos_avion_usd`
 * ya está dentro de `saldo_disponible_usd`; cada ingreso trae su `usd`): aquí
 * no se convierte, no se suma entre monedas y no se recalcula nada.
 * Prueba: `__tests__/otros-ingresos-avion.test.ts`.
 */

import { fmtDecimal, fmtUsd } from "@/lib/format";
import type { DetalleOtroIngresoAvion } from "@/types/profit-sharing";

/** Fila de la cascada del avión (entre la venta y las deducciones). */
export const ETIQUETA_FILA_OTROS_INGRESOS_AVION = "Otros ingresos del avión";
export const SUBLABEL_OTROS_INGRESOS_AVION =
  "reembolsos y ventas registrados en Ingresos con este avión, netos de comisión";

/**
 * Tooltip de la fila: un renglón por ingreso «ING-4 · concepto · $2,586.16»
 * (o «sin T.C.» si ese ingreso no entró al saldo). Sin detalle ⇒ undefined.
 */
export function tituloOtrosIngresosAvion(
  lineas?: DetalleOtroIngresoAvion[] | null,
): string | undefined {
  if (!lineas || lineas.length === 0) return undefined;
  return lineas
    .map((l) =>
      [l.clave, l.concepto?.trim() || null, l.usd == null ? "sin T.C." : fmtUsd(l.usd)]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
}

/** Badge ámbar: ingresos del avión en pesos que no entraron al saldo. */
export function textoBadgeOtrosIngresosSinTc(mxn: number): string {
  return `Otros ingresos sin TC · ${fmtDecimal(mxn)} MXN`;
}
export const TITULO_BADGE_OTROS_INGRESOS_SIN_TC =
  "Ingresos del avión en MXN sin tipo de cambio propio ni T.C. oficial disponible para su fecha: no entraron al saldo.";

/** Badge informativo: ingresos convertidos con el T.C. oficial (ya suman). */
export function textoBadgeOtrosIngresosTcOficial(n: number): string {
  return `${n} ingreso(s) con TC oficial`;
}
export const TITULO_BADGE_OTROS_INGRESOS_TC_OFICIAL =
  "Otros ingresos del avión en MXN sin tipo de cambio capturado: se convirtieron con el T.C. oficial de referencia del día del ingreso (open.er-api / BCE). Ya suman en el saldo.";

/** Cola del hint del KPI «Venta de aviones cobrada»; '' sin otros ingresos. */
export function hintKpiOtrosIngresosAviones(usd: number): string {
  return usd > 0 ? ` · + ${fmtUsd(usd)} otros ingresos de aviones` : "";
}

/** Hint del KPI «Ingresos cobrados» del tablero; undefined sin otros ingresos. */
export function hintDashboardOtrosIngresosAviones(usd: number): string | undefined {
  return usd > 0 ? `+ ${fmtUsd(usd)} otros ingresos de los aviones (suman al saldo)` : undefined;
}

/** Segunda línea de la celda «Ingresos» por avión del tablero. */
export function textoCeldaOtrosIngresosAvion(usd: number): string {
  return `+ ${fmtUsd(usd)} otros`;
}
