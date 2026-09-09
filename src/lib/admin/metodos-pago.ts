import type { MetodoPago } from "@/types/quote";

/**
 * FUENTE ÚNICA de los MÉTODOS DE PAGO del cliente (cobro de una cotización o
 * de un grupo): valor del API, etiqueta es-MX y pista de IVA, en el orden
 * del selector. Vive en `lib/admin` (sin "use client") para que la consuman
 * tanto formularios cliente (wizard de grupo) como páginas server (detalle
 * del grupo), igual que `medios-pago.ts` para los medios de gasto.
 *
 * `facturable`: entra a Facturas ANTES de cobrarse (mismo conjunto que
 * `METODOS_FACTURABLES` del API). PAYWISE (9-sep-2026): link/pasarela; sin
 * IVA por defecto (como BillPocket), factura pre-cobro (FormaPago SAT 04) y
 * su comisión (≈8.857 %) es comisión bancaria del COBRO — NO se traslada al
 * cliente como extra.
 */
export const METODOS_PAGO: {
  value: MetodoPago;
  label: string;
  hint: string;
  facturable: boolean;
}[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%", facturable: true },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%", facturable: true },
  { value: "CHEQUE", label: "Cheque", hint: "Con factura · IVA 16%", facturable: true },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura", facturable: true },
  {
    value: "PAYWISE",
    label: "Paywise",
    hint: "Link de pago · sin IVA por defecto · comisión ≈8.857 %",
    facturable: true,
  },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA", facturable: false },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA", facturable: false },
  { value: "OTRO", label: "Otro (escríbelo)", hint: "Manual · sin IVA por defecto", facturable: false },
];

/** Etiqueta legible del método; OTRO muestra el nombre manual si lo hay.
 *  Fallback al código crudo (valor desconocido / API más nuevo). */
export function metodoPagoLabel(
  metodo: string | null | undefined,
  detalle?: string | null,
): string {
  if (!metodo) return "—";
  if (metodo === "OTRO") return detalle?.trim() ? `Otro (${detalle.trim()})` : "Otro";
  return METODOS_PAGO.find((m) => m.value === metodo)?.label ?? metodo;
}

/**
 * Métodos que llegan a una CUENTA (banco o pasarela): solo en ellos se
 * pregunta a qué cuenta llegó / de cuál salió el dinero. Antes cada
 * formulario tenía su copia (cobro, reembolso, sobre de grupo).
 */
export const METODOS_CON_CUENTA: readonly MetodoPago[] = [
  "TRANSFERENCIA",
  "HSBC_LINK",
  "CHEQUE",
  "PAYWISE",
];

export function metodoConCuenta(metodo: string | null | undefined): boolean {
  return METODOS_CON_CUENTA.includes(metodo as MetodoPago);
}

/** Métodos que entran a Facturas antes de cobrarse (espejo del API). */
export const METODOS_FACTURABLES: readonly MetodoPago[] = METODOS_PAGO.filter(
  (m) => m.facturable,
).map((m) => m.value);

/**
 * Cuenta destino SUGERIDA por método (catálogo fijo `CUENTAS_COBRO`): un
 * cobro Paywise siempre llega a la cuenta Paywise. null = el operador elige.
 */
export function cuentaSugeridaPorMetodo(metodo: string | null | undefined): "Paywise" | null {
  return metodo === "PAYWISE" ? "Paywise" : null;
}

/**
 * Comisión (%) que Paywise retiene por cobro. Espejo del default del API
 * (`configuracion_sistema.paywise_comision_pct`, `PAYWISE_COMISION_PCT_DEFAULT`):
 * el formulario la SUGIERE (editable) y el API la aplica igual si no viaja
 * ninguna comisión; el estado de cuenta de Paywise la sustituye por la real
 * al conciliar. Las páginas server pueden pasar el valor vivo de la config.
 */
export const PAYWISE_COMISION_PCT_DEFAULT = 8.857;
