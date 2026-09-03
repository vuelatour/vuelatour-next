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
  // Plataforma de pago de servicios aeroportuarios (recibos Paywise).
  PAYWISE: "Paywise",
  PERSONAL_PABLO: "Personal Pablo",
  PERSONAL_ALE: "Personal Ale",
  // Cargo contable de inventario (salida de cardex): nunca toca el banco.
  BODEGA: "Bodega (inventario)",
};

/** Etiqueta legible de un medio de pago, con fallback al código crudo. */
export function medioPagoLabel(medio: string): string {
  return MEDIO_PAGO_LABELS[medio] ?? medio;
}

/**
 * Medios que la oficina puede ELEGIR al capturar un gasto nuevo, en el orden
 * del selector. BODEGA queda fuera: lo pone solo la salida de inventario.
 * Tupla `as const` para que el schema zod derive su enum de aquí (una sola
 * lista que gobierna UI y validación).
 *
 * REGLA DEL CLIENTE (3-sep-2026): el medio de pago NO tiene valor por
 * defecto — el selector abre en blanco hasta que alguien lo elige (el default
 * viajaba en silencio cuando nadie tocaba el campo). Ni la app ni el panel
 * preseleccionan; el API lo exige (NOT NULL sin default).
 */
export const MEDIOS_CAPTURA_VALUES = [
  "TRANSFERENCIA",
  "PAYWISE",
  "EFECTIVO",
  "TARJETA_CORP",
  "PERSONAL_PABLO",
  "PERSONAL_ALE",
] as const;

export type MedioCaptura = (typeof MEDIOS_CAPTURA_VALUES)[number];

/** Opción de selector (SearchableSelect) para un medio de pago. */
export function opcionMedioPago(value: string): { value: string; label: string } {
  return { value, label: medioPagoLabel(value) };
}

/** Opciones del selector de ALTA de gasto (panel). */
export const MEDIOS_CAPTURA = MEDIOS_CAPTURA_VALUES.map(opcionMedioPago);

/** Opciones del selector de VERIFICACIÓN: los de captura + BODEGA (un gasto
 *  nacido de una salida de inventario se verifica sin perder su medio). */
export const MEDIOS_VERIFICACION = [...MEDIOS_CAPTURA_VALUES, "BODEGA"].map(
  opcionMedioPago,
);
