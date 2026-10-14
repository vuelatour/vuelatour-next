/**
 * Semáforo de FACTURACIÓN de oficina («¿ya facturé este gasto?») — fuente
 * ÚNICA del panel: etiquetas, emoji, color del punto y del pill.
 *
 * Es independiente del COMPROBANTE que entregó el piloto (ese no se toca al
 * marcar aquí: ver `comprobante-badge.ts`).
 *
 * 🔴 PENDIENTE → 🟡 SOLICITADA → 🟢 FACTURADA, y desde el 14-sep-2026
 * ⚪ **NO_FACTURABLE** («No requiere factura»), pedido del cliente: «en
 * Facturación (oficina) agregar la opción No requiere factura / No
 * facturable». Un gasto NO_FACTURABLE:
 *   - NO está «por facturar» (el filtro `NO_FACTURADA` = pendiente + solicitada
 *     lo deja fuera),
 *   - NO entra al pendiente `gastos_sin_comprobante` del pre-cierre,
 *   - y si alguien le AMARRA una factura recibida, el trigger del API lo pasa
 *     a FACTURADA (si hay factura, está facturado).
 *
 * Módulo PURO (sin "use client"): lo usan el badge cliente, los diálogos y el
 * historial del vuelo, que es Server Component.
 *
 * TOLERANCIA: `NO_FACTURABLE` necesita la migración
 * `20260914000002_estatus_facturacion_no_facturable.sql`. Si el ambiente no
 * la tiene, el API responde **400 con un mensaje claro** («Esta opción
 * necesita la migración…; mientras, usa Pendiente») y el panel lo pinta tal
 * cual: aquí no se esconde la opción ni se adivina el estado del servidor.
 */

export type EstatusFacturacion =
  | "PENDIENTE"
  | "SOLICITADA"
  | "FACTURADA"
  | "NO_FACTURABLE";

export interface EstadoFacturacion {
  value: EstatusFacturacion;
  /** Corta: badge de la tabla, filtro e historial. */
  label: string;
  /**
   * Aún más corta, SOLO para la columna «Facturación» de Gastos (14-oct-2026,
   * una sola tabla): «No requiere» cabe sin ensanchar la columna. El menú, el
   * filtro y el title siguen con `label` completo.
   */
  labelCorta?: string;
  /** Larga: selectores de los diálogos de alta/verificación. */
  labelForm: string;
  emoji: string;
  /** Clase del puntito del badge / del menú. */
  dot: string;
  /** Clases del pill del badge. */
  pill: string;
}

/** Conservador a propósito: sin dato NUNCA se afirma «facturado». */
export const FACTURACION_DEFAULT: EstatusFacturacion = "PENDIENTE";

export const FACTURACION_ESTADOS: EstadoFacturacion[] = [
  {
    value: "PENDIENTE",
    label: "Pendiente",
    labelForm: "Pendiente de facturar",
    emoji: "🔴",
    dot: "bg-red-500",
    pill: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    value: "SOLICITADA",
    label: "Solicitada",
    labelForm: "Factura solicitada",
    emoji: "🟡",
    dot: "bg-amber-400",
    pill: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    value: "FACTURADA",
    label: "Facturada",
    labelForm: "Facturada",
    emoji: "🟢",
    dot: "bg-emerald-500",
    pill: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    // Gris a propósito: no es un pendiente (no urge) ni un logro (no hay
    // factura) — es «este gasto no lleva factura y no hay nada que perseguir».
    value: "NO_FACTURABLE",
    label: "No requiere factura",
    labelCorta: "No requiere",
    labelForm: "No requiere factura",
    emoji: "⚪",
    dot: "bg-slate-400",
    pill: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300",
  },
];

/** Ficha del estado; valor desconocido o ausente ⇒ Pendiente (conservador). */
export function estadoFacturacion(
  value: string | null | undefined,
): EstadoFacturacion {
  return (
    FACTURACION_ESTADOS.find((e) => e.value === value) ?? FACTURACION_ESTADOS[0]
  );
}

/**
 * Lo que dice el pill de la tabla de Gastos: `labelCorta` si el estado la
 * tiene («No requiere»), si no su `label`. Desconocido o ausente ⇒ «Pendiente»
 * (misma regla conservadora de `estadoFacturacion`).
 */
export function etiquetaFacturacionTabla(value: string | null | undefined): string {
  const e = estadoFacturacion(value);
  return e.labelCorta ?? e.label;
}

/** Title del pill del semáforo (se antepone la etiqueta completa en la versión compacta). */
export const TITULO_FACTURACION_BADGE =
  "Seguimiento de facturación de oficina (no toca el comprobante del piloto). Clic para cambiar.";

/** Etiqueta corta; `null` si el valor no se conoce (el llamador pinta el crudo). */
export function etiquetaFacturacion(
  value: string | null | undefined,
): string | null {
  return FACTURACION_ESTADOS.find((e) => e.value === value)?.label ?? null;
}

/** Opciones de los SELECTORES de los diálogos («🟡 Factura solicitada»). */
export function opcionesFacturacionForm(): Array<{
  value: EstatusFacturacion;
  label: string;
}> {
  return FACTURACION_ESTADOS.map((e) => ({
    value: e.value,
    label: `${e.emoji} ${e.labelForm}`,
  }));
}

/** Filtro agregado de la barra de Gastos: lo que SIGUE por resolver. */
export const FILTRO_NO_FACTURADA = "NO_FACTURADA";

/**
 * Valores que el API acepta en `estatus_facturacion` (los 4 del enum + el
 * meta-valor NO_FACTURADA). Derivado de la fuente única para que agregar un
 * estado no deje el filtro fuera; `?facturacion=` se valida contra esta
 * lista (movida aquí desde la página de Gastos el 14-oct-2026: la usan la
 * página y la barra de filtros).
 */
export const FACTURACION_FILTRO_VALUES: readonly string[] = [
  ...FACTURACION_ESTADOS.map((e) => e.value as string),
  FILTRO_NO_FACTURADA,
];

/**
 * Opciones del filtro de Gastos. «Sin facturar» agrupa pendiente + solicitada
 * — NO_FACTURABLE queda fuera a propósito: no es algo por facturar.
 */
export function opcionesFacturacionFiltro(): Array<{
  value: string;
  label: string;
}> {
  return [
    ...FACTURACION_ESTADOS.map((e) => ({
      value: e.value as string,
      label: `${e.emoji} ${e.label}`,
    })),
    { value: FILTRO_NO_FACTURADA, label: "Sin facturar (pend. + sol.)" },
  ];
}
