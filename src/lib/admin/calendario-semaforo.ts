/**
 * Semáforo del calendario: CINCO colores y nada más (22-sep-2026).
 *
 * Pedido textual del cliente: «queremos hacer un cambio en el semáforo del
 * calendario, tanto en este calendario del sistema web y la app como en
 * google calendar con la sincronización, para que en los calendarios no se
 * vean tantos colores […] los colores que tiene cada avión configurados los
 * seguiremos respetando principalmente en los reportes del balance individual
 * y general en los excel que se generan, y es que en realidad los colores son
 * para el reporte de excel nada más: Gris: Tentativo · Verde: Confirmado ·
 * Amarillo: Permiso o asunto pendiente · Rojo: Cancelado · Azul: Descanso 💤».
 *
 * Antes convivían OCHO colores (vuelo propio = color del avión, evento,
 * tentativo, sin asignar, externo, descanso, permiso pendiente, cancelado) y
 * el calendario se leía como un mosaico: el color del avión decía QUÉ avión,
 * no CÓMO va el vuelo, que es lo que la oficina mira de un vistazo.
 *
 * QUIÉN DECIDE EL COLOR: el API (`colores-calendario.util.ts`), que lo manda
 * en `color` de cada evento de `GET /v1/calendar` y lo traduce al colorId de
 * Google. **El panel no calcula colores de eventos: solo los pinta.** Este
 * archivo es la fuente única de la LEYENDA (y de las etiquetas del color del
 * avión), y sus hex son copia EXACTA de los del API — si allá cambian, aquí
 * también, o la leyenda mentirá.
 */

/** Gris: tentativo (todo estado anterior a CONFIRMADO: reserva, solicitud…). */
export const COLOR_TENTATIVO = "#64748B";
/** Verde: confirmado, en vuelo, completado — y los eventos de la flota. */
export const COLOR_CONFIRMADO = "#22C55E";
/** Amarillo: permiso de pista o asunto pendiente (incluye mantenimientos). */
export const COLOR_PENDIENTE = "#F59E0B";
/** Rojo: cancelado (en Google el evento se borra, no se pinta). */
export const COLOR_CANCELADO = "#EF4444";
/** Azul: descanso de piloto. */
export const COLOR_DESCANSO = "#3B82F6";

export type ClaveSemaforo =
  | "tentativo"
  | "confirmado"
  | "pendiente"
  | "cancelado"
  | "descanso";

/** Hex por clave del semáforo (mismo valor que los exports de arriba). */
export const COLOR_SEMAFORO: Record<ClaveSemaforo, string> = {
  tentativo: COLOR_TENTATIVO,
  confirmado: COLOR_CONFIRMADO,
  pendiente: COLOR_PENDIENTE,
  cancelado: COLOR_CANCELADO,
  descanso: COLOR_DESCANSO,
};

export interface ItemSemaforo {
  clave: ClaveSemaforo;
  /** Texto del renglón, palabra por palabra como lo pidió el cliente. */
  etiqueta: string;
  color: string;
  /** Tooltip: qué significa y qué hacer (los operadores no son técnicos). */
  titulo: string;
}

/**
 * La leyenda: CINCO renglones, en este orden. Toda leyenda de calendario del
 * panel se pinta desde aquí (hoy: `components/admin/calendar/leyenda-semaforo.tsx`).
 */
export const SEMAFORO_CALENDARIO: readonly ItemSemaforo[] = [
  {
    clave: "tentativo",
    etiqueta: "Tentativo",
    color: COLOR_TENTATIVO,
    titulo:
      "Espacio apartado que todavía no se confirma (reserva o solicitud sin confirmar). Se confirma desde el detalle del vuelo.",
  },
  {
    clave: "confirmado",
    etiqueta: "Confirmado",
    color: COLOR_CONFIRMADO,
    titulo:
      "Vuelo confirmado, en vuelo o completado. También las citas y eventos de la flota (📌), que son agenda firme.",
  },
  {
    clave: "pendiente",
    etiqueta: "Permiso o asunto pendiente",
    color: COLOR_PENDIENTE,
    titulo:
      "Falta algo antes de volar: permiso de pista sin emitir, avión o piloto sin asignar, o un servicio de mantenimiento (🔧) por hacer.",
  },
  {
    clave: "cancelado",
    etiqueta: "Cancelado",
    color: COLOR_CANCELADO,
    titulo:
      "Vuelo cancelado: se queda aquí como historial de operaciones. En Google Calendar su evento se borra.",
  },
  {
    clave: "descanso",
    etiqueta: "Descanso 💤",
    color: COLOR_DESCANSO,
    titulo:
      "Día de descanso de un piloto (botón «Marcar descanso»). Al asignar vuelos, el piloto aparece con aviso esos días.",
  },
];

/** Nota bajo la leyenda: dónde vive ahora el color de cada avión. */
export const NOTA_COLOR_AVION =
  "El color de cada avión ya no se usa en el calendario: se conserva para los reportes de Excel (balance individual y general).";

// ===== El color del avión, donde SÍ se usa =====

/** Etiqueta del campo `aeronave.color_calendario` (ficha, formulario, lista). */
export const ETIQUETA_COLOR_AVION = "Color en los reportes de Excel";

/** Hint del campo en el formulario del avión. */
export const HINT_COLOR_AVION = "#RRGGBB — balance individual y general";

/** Ayuda corta bajo el selector de tonos: dice qué dejó de hacer este color. */
export const AYUDA_COLOR_AVION =
  "Ya no colorea el calendario (ahí manda el semáforo): solo identifica al avión en los Excel de balance.";

/** Tooltip del punto de color en la lista de aeronaves. */
export function tituloColorAvion(hex: string): string {
  return `${ETIQUETA_COLOR_AVION}: ${hex}`;
}
