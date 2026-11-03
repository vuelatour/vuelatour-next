/**
 * SESIÓN de un diálogo de edición = UNA apertura para UNA entidad
 * (3-nov-2026).
 *
 * Caso de la oficina (Mary, 2-nov-2026): capturaba los datos fiscales de un
 * cliente —a mano o con la IA leyendo la constancia— y «no se quedaban
 * guardados». La tabla se vuelve a pintar con objetos NUEVOS en cada
 * refresh de la ruta (`RefreshOnFocus` al volver del selector de archivos o
 * de WhatsApp, una revalidación) y la fila que recibe el diálogo cambia de
 * identidad sin cambiar de cliente; un `useEffect([open, fila, reset])`
 * hacía `reset()` y borraba lo tecleado. La llave de la sesión se compara
 * por id: el formulario se reinicia SOLO al abrir o al cambiar de entidad
 * con el diálogo abierto, nunca por una identidad nueva de la misma fila.
 */

/** Llave de la apertura: `null` = cerrado; sin id = alta («NUEVO»). */
export function llaveSesionDialogo(open: boolean, id: string | null | undefined): string | null {
  if (!open) return null;
  return id ?? "NUEVO";
}

/**
 * Apertura en curso. `cancelada` la marcan el cierre, el cambio de entidad y
 * el desmontaje: las respuestas asíncronas (tarifas, catálogos) de una
 * apertura anterior se descartan en vez de pisar la nueva.
 */
export interface SesionDialogo {
  llave: string;
  cancelada: boolean;
}

/**
 * Decide si empieza una apertura. Misma llave ⇒ `{ cambia: false }` (no
 * hay nada que reiniciar aunque la fila sea otro objeto). Llave distinta ⇒
 * cancela la sesión anterior y devuelve la nueva (`sesion: null` = se
 * cerró).
 */
export function abrirSesionDialogo(
  actual: SesionDialogo | null,
  llave: string | null,
): { cambia: false } | { cambia: true; sesion: SesionDialogo | null } {
  if ((actual?.llave ?? null) === llave) return { cambia: false };
  if (actual) actual.cancelada = true;
  return { cambia: true, sesion: llave === null ? null : { llave, cancelada: false } };
}
