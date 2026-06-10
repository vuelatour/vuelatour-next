import type { EstadoVuelo } from "@/types/quotes-persisted";

/**
 * Fuente ÚNICA de estilos y etiquetas del estado de vuelo/cotización.
 * Antes cada página definía su propio mapa y los colores divergían
 * (mismo estado, distinto color según la pantalla). Importar SIEMPRE de aquí.
 */
export const ESTADO_STYLES: Record<EstadoVuelo, string> = {
  RESERVA: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  SOLICITUD: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  COTIZADO: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  CONFIRMADO: "bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30",
  EN_VUELO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  COMPLETADO: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADO: "bg-destructive/15 text-destructive border-destructive/30",
};

export const ESTADO_LABELS: Record<EstadoVuelo, string> = {
  RESERVA: "Reserva tentativa",
  SOLICITUD: "Solicitud",
  COTIZADO: "Cotizado",
  CONFIRMADO: "Confirmado",
  EN_VUELO: "En vuelo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};
