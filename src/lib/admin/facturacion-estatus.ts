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
  | "NO_FACTURABLE"
  | "NO_OBTENIDA";

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
  /**
   * Exige un MOTIVO (`gasto.facturacion_nota`) al marcarlo (2-nov-2026,
   * NO_OBTENIDA): el badge abre un diálogo y los selectores de alta /
   * verificación no lo ofrecen (ahí no hay campo para el motivo).
   */
  requiereNota?: boolean;
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
  {
    // Morado: no es «no requiere» (⚪) ni «falta» (🔴): se PIDIÓ y el
    // proveedor no la emitió (o no se pudo obtener). Siempre con motivo.
    // Pedido de la oficina (2-nov-2026, API 0.0.116, invariante 115).
    value: "NO_OBTENIDA",
    label: "No obtenida",
    labelCorta: "No obtenida",
    labelForm: "No obtenida / no emitida (con motivo)",
    emoji: "🟣",
    dot: "bg-violet-500",
    pill: "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    requiereNota: true,
  },
];

/** Título del diálogo que pide el motivo al marcar «No obtenida». */
export const TITULO_NO_OBTENIDA = "Factura no obtenida / no emitida";

/** Explicación del diálogo (qué pasa con el gasto). */
export const AYUDA_NO_OBTENIDA =
  "Se pidió la factura y el proveedor no la emitió (o no se pudo obtener). El gasto sale de " +
  "«Sin facturar» y del pendiente del pre-cierre, y en el Excel de efectivos queda en su propio " +
  "cubo. Si después llega la factura, al amarrarla pasa a Facturada.";

export const ETIQUETA_MOTIVO_NO_OBTENIDA = "Motivo (obligatorio)";
export const PLACEHOLDER_MOTIVO_NO_OBTENIDA =
  "Ej. El FBO no emite factura; se pidió dos veces por correo sin respuesta.";
export const BOTON_NO_OBTENIDA = "Marcar no obtenida";
export const MOTIVO_NO_OBTENIDA_MAX = 500;

/** ¿El motivo tecleado sirve? (1..500 tras recortar). */
export function motivoNoObtenidaValido(motivo: string | null | undefined): boolean {
  const n = (motivo ?? "").trim().length;
  return n >= 1 && n <= MOTIVO_NO_OBTENIDA_MAX;
}

/**
 * Title del pill: con «No obtenida» antepone el motivo (si hay) para que se
 * lea al pasar el mouse sin abrir nada. `compacta` antepone además la etiqueta
 * completa (regla del 14-oct-2026).
 */
export function tituloBadgeFacturacion(
  gasto: { estatus_facturacion?: string | null; facturacion_nota?: string | null },
  compacta: boolean,
): string {
  const e = estadoFacturacion(gasto.estatus_facturacion);
  const motivo =
    e.requiereNota && gasto.facturacion_nota?.trim()
      ? `Motivo: ${gasto.facturacion_nota.trim()}`
      : null;
  return [compacta ? e.label : null, motivo, TITULO_FACTURACION_BADGE]
    .filter((x): x is string => !!x)
    .join(" · ");
}

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

/**
 * Opciones de los SELECTORES de los diálogos («🟡 Factura solicitada»). Los
 * estados que exigen motivo (NO_OBTENIDA) NO se ofrecen aquí: esos diálogos no
 * tienen campo para él (el API respondería 400); se marcan desde el badge.
 */
export function opcionesFacturacionForm(): Array<{
  value: EstatusFacturacion;
  label: string;
}> {
  return FACTURACION_ESTADOS.filter((e) => !e.requiereNota).map((e) => ({
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
