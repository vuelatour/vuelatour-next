/**
 * Nombre corto del piloto para Google Calendar (17-sep-2026).
 *
 * Pedido del cliente: Luis (mecánico) es el único que sigue leyendo el
 * calendario de Google y el título debe verse como los eventos que la
 * oficina escribía a mano — `Saab N4142R cun-mid-cun 10:00`. El apodo es el
 * primer campo de ese título y NO se puede derivar del nombre: a
 * «Alexander E. Saab» le dicen «Saab», a «Abraham Zamora» «Zamora» y a
 * «Pablo Canales» «Pab». Por eso la oficina lo captura aquí; si está vacío,
 * el API usa el primer nombre.
 *
 * Fuente ÚNICA de las reglas del campo en el panel (diálogos de alta y
 * edición): tope de largo, normalización y el delta «solo si cambió».
 */

/** Tope del API (`@MaxLength(20)` en los DTO de usuario). */
export const APODO_MAX = 20;

/** Texto de ayuda del campo — mismo ejemplo en alta y edición. */
export const APODO_LABEL = "Nombre corto para el calendario";
export const APODO_PLACEHOLDER = "Saab";
export const APODO_HINT =
  "Así aparece en Google Calendar: “Saab N4142R cun-mid-cun 10:00”";

/**
 * Espacios de sobra fuera (el título del evento se arma pegando piezas con
 * un espacio: un apodo con cola rompería el formato).
 */
export function normalizarApodo(valor: string | null | undefined): string {
  return (valor ?? "").trim().replace(/\s+/g, " ");
}

export interface ApodoDelta {
  /** `false` ⇒ la llave NO viaja en el PATCH/POST. */
  cambio: boolean;
  /** `null` = borrar el apodo (el API vuelve al primer nombre). */
  valor: string | null;
}

/**
 * Qué mandar al API: nada si el apodo no cambió (mandarlo siempre volvería a
 * escribir el usuario y a re-encolar sus vuelos en el espejo del calendario),
 * `null` explícito al vaciarlo — el `stripEmpty` de las actions tira el `""`
 * y borrarlo sería un no-op silencioso (mismo patrón que la tarjeta corp.).
 */
export function apodoParaPayload(
  original: string | null | undefined,
  nuevo: string | null | undefined,
): ApodoDelta {
  const antes = normalizarApodo(original);
  const despues = normalizarApodo(nuevo);
  if (antes === despues) return { cambio: false, valor: despues === "" ? null : despues };
  return { cambio: true, valor: despues === "" ? null : despues };
}

/**
 * API viejo (aún sin el campo en el DTO): Nest corre con
 * `forbidNonWhitelisted` y responde 400 «property apodo should not exist».
 * Se traduce a un mensaje que la oficina entienda en vez del error técnico.
 * Un 400 por largo («apodo must be shorter…») NO entra aquí: ese sí es un
 * error real del capturista y se muestra tal cual.
 */
export function esRechazoPorApodo(mensaje: string | undefined | null): boolean {
  if (!mensaje) return false;
  return /apodo/i.test(mensaje) && /should not exist/i.test(mensaje);
}

export const APODO_API_VIEJO =
  "El API todavía no acepta el nombre corto para el calendario. Actualízalo y vuelve a guardar (lo demás sí se puede guardar dejando el campo como estaba).";
