/**
 * Comprobante del gasto: **DOS opciones** (pedido del cliente, 14-sep-2026).
 *
 * «En lugar de Factura solo colocar dos opciones: Comprobante (aplica para
 * tickets, vouchers, etc.) y Sin comprobante». La distinción Factura/Vale ya
 * no le dice nada a la oficina en esta columna: lo que importa aquí es si el
 * gasto trae PAPEL o no. Que ese papel sea una FACTURA se sigue en la columna
 * vecina «Facturación (oficina)» (🔴 Pendiente → 🟡 Solicitada → 🟢 Facturada
 * → ⚪ No requiere factura) — son dos preguntas distintas y confundirlas fue
 * justo el reporte anterior («Factura» vs «Facturada»).
 *
 * SIN MIGRACIÓN: la columna `gasto.estatus_comprobante` sigue siendo el enum
 * de Postgres ('FACTURA' | 'VALE' | 'SIN_COMPROBANTE').
 *   - `FACTURA` = el valor que GUARDA el panel para «Con comprobante» (es el
 *     que ya manda la app cuando el gasto trae foto),
 *   - `VALE`    = valor LEGADO: se LEE como «Con comprobante» y NO se
 *     reescribe solo (ver `opcionesComprobante`),
 *   - `SIN_COMPROBANTE` = sin papel.
 *
 * Fuente ÚNICA del panel para etiquetas y opciones: ningún componente vuelve
 * a escribir el ternario ni la lista de opciones a mano.
 */

/** Valor que guarda el panel cuando el gasto SÍ trae comprobante. */
export const COMPROBANTE_CON = "FACTURA";
/** Sin papel de ningún tipo. */
export const COMPROBANTE_SIN = "SIN_COMPROBANTE";
/** LEGADO (gastos históricos y carga masiva de combustibles): es «con comprobante». */
export const COMPROBANTE_VALE = "VALE";

export const LABEL_CON = "Con comprobante (ticket, voucher, factura…)";
export const LABEL_SIN = "Sin comprobante";
/** Opción oculta: solo aparece si el gasto YA trae el valor legado. */
export const LABEL_VALE_LEGADO = "Con comprobante (vale)";

/** Ayuda del campo: por qué aquí no se pregunta por la factura. */
export const AYUDA_COMPROBANTE =
  "¿Llegó algún papel del gasto (ticket, voucher, recibo o factura)? Si además hace falta la FACTURA, eso se sigue aparte en «Facturación (oficina)».";

/**
 * ¿El gasto trae comprobante? Misma regla que el API
 * (`comprobante.util.ts#hayComprobante`): todo lo que no sea
 * `SIN_COMPROBANTE` cuenta como papel entregado. Sin dato (skew de deploy)
 * NO se afirma que haya comprobante.
 */
export function hayComprobante(estatus: string | null | undefined): boolean {
  return estatus != null && estatus !== "" && estatus !== COMPROBANTE_SIN;
}

/**
 * Etiqueta del badge de la columna «Comp.» (Gastos y detalle del vuelo).
 *
 * Solo se etiqueta lo que aporta información: «Sin comp.» (no entregó nada).
 * Con comprobante la MINIATURA ya lo dice, así que no se pinta badge — ni
 * para `FACTURA` ni para el legado `VALE` (desde el 14-sep-2026: la columna
 * responde «¿hay papel?», no «¿de qué tipo?»).
 */
export function etiquetaComprobante(estatus: string | null | undefined): string | null {
  return estatus === COMPROBANTE_SIN ? "Sin comp." : null;
}

/**
 * Texto largo del estatus (historial de cambios del gasto, tooltips):
 * «Con comprobante» / «Sin comprobante». `null` para un valor desconocido —
 * el llamador cae al valor crudo en lugar de inventar una etiqueta.
 */
export function textoComprobante(estatus: string | null | undefined): string | null {
  switch (estatus) {
    case COMPROBANTE_SIN:
      return "Sin comprobante";
    case COMPROBANTE_CON:
    case COMPROBANTE_VALE:
      return "Con comprobante";
    default:
      return null;
  }
}

export interface OpcionComprobante {
  value: string;
  label: string;
}

/**
 * Opciones del selector: DOS, siempre.
 *
 * Excepción del valor LEGADO: si el gasto que se está editando trae `VALE`,
 * se agrega una tercera opción («Con comprobante (vale)») con ese mismo
 * valor. Sin ella el select abriría en blanco (o en otra opción) y un
 * guardado que ni siquiera tocó el campo MUTARÍA el dato histórico. Ningún
 * flujo del panel escribe `VALE`: solo lo conserva.
 */
export function opcionesComprobante(actual?: string | null): OpcionComprobante[] {
  const con = { value: COMPROBANTE_CON, label: LABEL_CON };
  const sin = { value: COMPROBANTE_SIN, label: LABEL_SIN };
  if (actual !== COMPROBANTE_VALE) return [con, sin];
  return [con, { value: COMPROBANTE_VALE, label: LABEL_VALE_LEGADO }, sin];
}
