/**
 * PESTAÑAS (23-oct-2026) — reglas PURAS (sin React) del componente
 * `components/admin/pestanas.tsx`: qué pestaña abre, cómo se mueve el foco
 * con el teclado y cómo se rotula una pestaña con su conteo. Pedido del
 * cliente (pantalla por avión): «las tablas acomódalas por pestañas, para que
 * no esté una tabla encima de otra y nos confundamos con el scroll».
 *
 * Patrón WAI-ARIA de pestañas con activación automática: ← → mueven y
 * seleccionan (con vuelta), Inicio/Fin van a la primera/última.
 */

export interface PestanaDef {
  /** Clave estable (también vale como valor de `?seccion=`). */
  clave: string;
  etiqueta: string;
  /** Conteo que se pinta entre paréntesis: «Vuelos (3)». null/undefined = sin conteo. */
  conteo?: number | null;
  /** Tooltip nativo (p. ej. el nombre largo del grupo). */
  title?: string;
}

/** La pestaña que se abre: `inicial` si existe entre las pestañas; si no, la primera (null sin pestañas). */
export function pestanaInicial(
  pestanas: ReadonlyArray<Pick<PestanaDef, "clave">>,
  inicial: string | null | undefined,
): string | null {
  if (pestanas.length === 0) return null;
  if (inicial && pestanas.some((p) => p.clave === inicial)) return inicial;
  return pestanas[0].clave;
}

/**
 * A qué pestaña lleva una tecla desde `actual`: → siguiente, ← anterior
 * (las dos con vuelta), Inicio la primera, Fin la última; cualquier otra
 * tecla (o una lista vacía) ⇒ null (la tecla no es de la lista).
 */
export function siguientePestana(
  claves: ReadonlyArray<string>,
  actual: string,
  tecla: string,
): string | null {
  if (claves.length === 0) return null;
  const i = Math.max(0, claves.indexOf(actual));
  switch (tecla) {
    case "ArrowRight":
      return claves[(i + 1) % claves.length];
    case "ArrowLeft":
      return claves[(i - 1 + claves.length) % claves.length];
    case "Home":
      return claves[0];
    case "End":
      return claves[claves.length - 1];
    default:
      return null;
  }
}

/** «Gastos del periodo (64)» · «Socios» (sin conteo). */
export function textoPestana(p: Pick<PestanaDef, "etiqueta" | "conteo">): string {
  return p.conteo == null ? p.etiqueta : `${p.etiqueta} (${p.conteo})`;
}
