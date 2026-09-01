/**
 * FUENTE ÚNICA de etiquetas es-MX para los medios de pago de gasto (mismo
 * patrón que categorias-gasto.ts). Antes vivían duplicadas en
 * expenses-table.tsx y flight-gastos-table.tsx (módulos "use client", que un
 * server component no puede importar): toda pantalla nueva consume de aquí.
 */
export const MEDIO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CORP: "Tarjeta corporativa",
  TRANSFERENCIA: "Transferencia",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  // Cargo contable de inventario (salida de cardex): nunca toca el banco.
  BODEGA: "Bodega (inventario)",
};

/** Etiqueta legible de un medio de pago, con fallback al código crudo. */
export function medioPagoLabel(medio: string): string {
  return MEDIO_PAGO_LABELS[medio] ?? medio;
}
