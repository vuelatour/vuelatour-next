import type { MetodoPago } from "@/types/quote";

/**
 * FUENTE ÚNICA de los MÉTODOS DE PAGO del cliente (cobro de una cotización o
 * de un grupo): valor del API, etiqueta es-MX y pista de IVA, en el orden
 * del selector. Vive en `lib/admin` (sin "use client") para que la consuman
 * tanto formularios cliente (wizard de grupo) como páginas server (detalle
 * del grupo), igual que `medios-pago.ts` para los medios de gasto.
 */
export const METODOS_PAGO: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "CHEQUE", label: "Cheque", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Sin factura" },
  { value: "EFECTIVO", label: "Efectivo", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares directo", hint: "Sin IVA" },
  { value: "OTRO", label: "Otro (escríbelo)", hint: "Manual · sin IVA por defecto" },
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
