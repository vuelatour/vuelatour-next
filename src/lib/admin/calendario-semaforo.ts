/**
 * Semáforo del calendario: SEIS colores y nada más (24-sep-2026).
 *
 * Pedido textual del cliente (24-sep-2026), sobre el semáforo de 5 del
 * 22-sep: «Ale quiere cambiar el color del descanso y agregar el de cobrado
 * (este me imagino se cambiaría en automático cuando ya esté cobrado). Para
 * que no haya confusiones pongo la listita: Tentativo - Gris · Pendiente
 * (permiso) - Amarillo · Confirmado - Verde · Pagado - Azul · Cancelado -
 * Rojo · Descanso - Morado».
 *
 * Qué cambió respecto al 22-sep:
 * - **Pagado (azul `#3B82F6`)** es nuevo: el vuelo quedó COBRADO COMPLETO
 *   (`vuelo.cobrado`, que el API mantiene solo al registrar/borrar cobros).
 *   Se pinta sin que nadie haga nada y regresa a verde si se borra o reembolsa
 *   un cobro. Un vuelo en $0 (cliente interno) nunca es «pagado».
 * - **El descanso pasó de azul a MORADO (`#8B5CF6`)**: el azul ahora es del
 *   pagado. OJO: `#8B5CF6` era el morado del viejo «sin asignar» (retirado el
 *   22-sep); hoy SOLO significa descanso.
 * - Precedencia de un vuelo o tramo (la decide el API, no el panel):
 *   cancelado > tentativo > pendiente > PAGADO > confirmado. Un pagado con
 *   permiso pendiente se ve AMARILLO hasta resolver el permiso.
 *
 * Antes del 22-sep convivían OCHO colores (el del avión entre ellos) y el
 * calendario se leía como un mosaico: el color del avión decía QUÉ avión, no
 * CÓMO va el vuelo, que es lo que la oficina mira de un vistazo. El color del
 * avión sigue fuera de los calendarios: vive solo en los Excel de balance.
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
/** Amarillo: permiso de pista pendiente, falta avión/piloto, o mantenimiento. */
export const COLOR_PENDIENTE = "#F59E0B";
/** Verde: confirmado, en vuelo, completado sin cobrar completo — y los eventos de la flota. */
export const COLOR_CONFIRMADO = "#22C55E";
/** Azul: pagado — el vuelo quedó cobrado completo (automático, `vuelo.cobrado`). */
export const COLOR_PAGADO = "#3B82F6";
/** Rojo: cancelado (en Google el evento se borra, no se pinta). */
export const COLOR_CANCELADO = "#EF4444";
/** Morado: descanso de piloto. */
export const COLOR_DESCANSO = "#8B5CF6";

export type ClaveSemaforo =
  | "tentativo"
  | "pendiente"
  | "confirmado"
  | "pagado"
  | "cancelado"
  | "descanso";

/** Hex por clave del semáforo (mismo valor que los exports de arriba). */
export const COLOR_SEMAFORO: Record<ClaveSemaforo, string> = {
  tentativo: COLOR_TENTATIVO,
  pendiente: COLOR_PENDIENTE,
  confirmado: COLOR_CONFIRMADO,
  pagado: COLOR_PAGADO,
  cancelado: COLOR_CANCELADO,
  descanso: COLOR_DESCANSO,
};

/**
 * Tooltip base del renglón «Pendiente (permiso)»: COPIA EXACTA de
 * `AYUDA_PENDIENTE` del API (`colores-calendario.util.ts`), que la app también
 * usa tal cual (`kLeyendaCalendario`). El amarillo no es solo el permiso: también
 * se prende cuando a un vuelo CONFIRMADO le falta avión o piloto. Si allá cambia
 * la redacción, aquí también (lo vigila `calendario-semaforo.test.ts`).
 */
export const AYUDA_PENDIENTE =
  "Permiso de pista pendiente. También se pinta así el vuelo confirmado que todavía no tiene avión o piloto asignado.";

export interface ItemSemaforo {
  clave: ClaveSemaforo;
  /** Texto del renglón, palabra por palabra como lo pidió el cliente. */
  etiqueta: string;
  color: string;
  /** Tooltip: qué significa y qué hacer (los operadores no son técnicos). */
  titulo: string;
}

/**
 * La leyenda: SEIS renglones, en el orden de la «listita» del cliente. Toda
 * leyenda de calendario del panel se pinta desde aquí (hoy:
 * `components/admin/calendar/leyenda-semaforo.tsx`).
 */
export const SEMAFORO_CALENDARIO: readonly ItemSemaforo[] = [
  {
    clave: "tentativo",
    etiqueta: "Tentativo",
    color: COLOR_TENTATIVO,
    titulo:
      "Espacio apartado que todavía no se confirma (reserva, solicitud o cotización sin confirmar). Se confirma desde el detalle del vuelo.",
  },
  {
    clave: "pendiente",
    etiqueta: "Pendiente (permiso)",
    color: COLOR_PENDIENTE,
    // Misma redacción que el API y la app (`AYUDA_PENDIENTE`) + lo que solo
    // se ve en el panel: el mantenimiento y la precedencia sobre el pagado.
    titulo: `${AYUDA_PENDIENTE} También los servicios de mantenimiento (🔧) por hacer. Un vuelo ya pagado se queda en amarillo hasta resolver el pendiente.`,
  },
  {
    clave: "confirmado",
    etiqueta: "Confirmado",
    color: COLOR_CONFIRMADO,
    titulo:
      "Vuelo confirmado, en vuelo o completado que todavía no está cobrado completo. También las citas y eventos de la flota (📌), que son agenda firme.",
  },
  {
    clave: "pagado",
    etiqueta: "Pagado",
    color: COLOR_PAGADO,
    titulo:
      "Vuelo cobrado completo. Cambia a azul solo, al registrar el cobro que lo liquida; si se borra o se reembolsa un cobro, regresa a verde. Un vuelo en $0 (cliente interno) nunca se pinta de pagado.",
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
