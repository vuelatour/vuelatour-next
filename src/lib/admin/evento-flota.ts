/**
 * EVENTOS NO-VUELO DEL CALENDARIO (citas, lavados, trámites, visitas) —
 * FUENTE ÚNICA PURA de sus textos y de la regla «para todos» en el panel.
 * Sin React ni red; prueba `__tests__/evento-flota.test.ts`.
 *
 * EVENTO SIN RESPONSABLE = PARA TODOS (12-nov-2026, API 0.0.139, invariante
 * 134 del API). Pedido de Dirección con la captura de «Agendar evento (no
 * vuelo)» de la app («Jorge Cortes Avionico IJP», Sin responsable): «que se
 * le pueda poner como responsable "Todos", o que al momento de poner "sin
 * responsable" le apareciera a todos en su calendario más bien, en la app y
 * en web».
 *
 * La regla la decide el API (el panel solo la pinta):
 *  - CON responsable: es de esa persona. Lo ve en su app (inicio y Mis
 *    vuelos) y recibe aviso y recordatorios.
 *  - SIN responsable: es de TODOS. Le aparece a cada quien en su calendario
 *    (la oficina, además, lo ve como siempre en el calendario de flota). No
 *    se manda aviso al teléfono de nadie.
 *  - `para_todos` viaja en cada evento (ADITIVO). Ausente = API previo, donde
 *    un evento sin responsable lo veía solo la oficina: ahí se conservan los
 *    textos de antes («Sin responsable · nadie recibe aviso»).
 */

/** Lo mínimo de un evento para saber si es de todos. */
export interface EventoConParaTodos {
  para_todos?: boolean | null;
}

/** ¿El API dijo que este evento es de todos? (ausente = API previo ⇒ no). */
export function esEventoParaTodos(ev: EventoConParaTodos | null | undefined): boolean {
  return ev?.para_todos === true;
}

// ═══════════════════════════ El selector «Responsable» ═══════════════════════════

/** La opción vacía del selector: ya no es «Sin responsable». */
export const ETIQUETA_TODOS = "Todos (sin responsable)";

export const DESCRIPCION_OPCION_TODOS =
  "Les aparece a todos en su calendario. Sin aviso al teléfono.";

/**
 * Renglón de ayuda bajo el selector, según lo elegido: dice QUIÉN lo verá y
 * si alguien recibe aviso (lo que la opción decide de verdad).
 */
export function hintResponsable(responsableElegido: boolean): string {
  return responsableElegido
    ? "Solo esa persona lo verá en su app (inicio y Mis vuelos) y recibirá aviso. Si no tiene la app con notificaciones, avísale por otro medio."
    : "Lo verán todos en su calendario (inicio y Mis vuelos de la app). No se manda aviso al teléfono de nadie.";
}

// ═══════════════════════════ Diálogos ═══════════════════════════

export const DESCRIPCION_NUEVO_EVENTO =
  "Cita, lavado, trámite, visita… Sale en el calendario de flota. Con responsable, solo esa persona lo ve en su app y recibe aviso; sin responsable, les aparece a todos en su calendario.";

export const DESCRIPCION_EDITAR_EVENTO =
  "Si cambias fecha, avión, título o notas se le avisa al responsable; si cambias de responsable, el anterior recibe «ya no te toca» y el nuevo su aviso. Si le quitas el responsable, el evento pasa a ser de todos.";

// ═══════════════════════════ Tras guardar ═══════════════════════════

export type VerboEvento = "agendado" | "actualizado";

/** «Evento agendado · para todos: les aparece en su calendario (sin aviso al teléfono)». */
export function textoGuardadoParaTodos(verbo: VerboEvento): string {
  return `Evento ${verbo} · para todos: les aparece en su calendario (sin aviso al teléfono)`;
}

/** API previo (sin `para_todos`): el evento sin responsable lo ve solo la oficina. */
export function textoGuardadoSinResponsableLegado(verbo: VerboEvento): string {
  return `Evento ${verbo} (sin responsable: nadie recibirá aviso)`;
}

/**
 * Texto del toast cuando el API NO mandó aviso (`aviso: null`) y no se eligió
 * responsable. Con `para_todos` del API ⇒ es de todos; sin él (API previo) ⇒
 * el texto de antes: nunca se promete «les aparece a todos» a un API que no
 * lo hace.
 */
export function textoGuardadoSinResponsable(
  verbo: VerboEvento,
  ev: EventoConParaTodos | null | undefined,
): string {
  return esEventoParaTodos(ev)
    ? textoGuardadoParaTodos(verbo)
    : textoGuardadoSinResponsableLegado(verbo);
}

// ═══════════════════════════ Detalle del día y chips ═══════════════════════════

/** Renglón del detalle del día de un evento de todos. */
export const TEXTO_EVENTO_PARA_TODOS =
  "Para todos · les aparece en su calendario (sin aviso al teléfono)";

/** Renglón del detalle con un API previo (lo veía solo la oficina). */
export const TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO = "Sin responsable · nadie recibe aviso";

/** Renglón del detalle del día de un evento SIN responsable. */
export function textoEventoSinResponsable(ev: EventoConParaTodos | null | undefined): string {
  return esEventoParaTodos(ev) ? TEXTO_EVENTO_PARA_TODOS : TEXTO_EVENTO_SIN_RESPONSABLE_LEGADO;
}

/** Sufijo del tooltip del chip del mes (el chip no cambia: sin nombre = de todos). */
export const SUFIJO_TOOLTIP_PARA_TODOS = "Para todos";

/** Tooltip del chip: el título del API y, si es de todos, que lo es. */
export function tooltipEvento(titulo: string, ev: EventoConParaTodos | null | undefined): string {
  return esEventoParaTodos(ev) ? `${titulo} · ${SUFIJO_TOOLTIP_PARA_TODOS}` : titulo;
}

// ═══════════════════════════ Quitar un evento ═══════════════════════════

/**
 * Texto de la confirmación de «Quitar» (regla del cliente: todo borrado se
 * confirma). Dice a quién afecta: con responsable se le avisa; uno de todos
 * deja de aparecerle a todos y no se avisa a nadie; con un API previo (sin
 * `para_todos`) y sin responsable, nadie se entera.
 */
export function textoConfirmarQuitarEvento(
  titulo: string,
  ev: (EventoConParaTodos & { conResponsable: boolean }) | null | undefined,
): string {
  const efecto = ev?.conResponsable
    ? "Se elimina del calendario y se le avisa al responsable."
    : esEventoParaTodos(ev)
      ? "Se elimina del calendario de todos (sin aviso al teléfono)."
      : "Se elimina del calendario.";
  return `${titulo}. ${efecto} No toca ningún vuelo.`;
}

// ═══════════════════════════ Leyenda del calendario ═══════════════════════════

export const NOTA_LEYENDA_EVENTOS =
  "Al agendar un evento con responsable se le avisa por push; ⚠ = no tiene la app registrada (avísale por otro medio). Sin responsable, el evento les aparece a todos en su calendario (sin aviso).";
