/**
 * Piezas COMUNES del orden de una tabla de lista (`DataTable` con prop
 * `orden`): lo que NO depende de qué se ordena. Nacieron en
 * `inventario-orden.ts` (24-sep-2026) y salieron aquí el 26-oct-2026 al darle
 * orden a Vencimientos, para que cada tabla tenga UNA sola copia de estas
 * reglas:
 *
 *  - el valor de orden de una columna es `col` (ascendente) o `col-desc`;
 *  - el clic en un encabezado arranca con la dirección natural de la
 *    columna, el segundo clic invierte y el tercero regresa;
 *  - la elección del clic solo gana mientras la URL viva siga en el valor
 *    sobre el que se tomó (ver `resolverOrden`);
 *  - lo desconocido (null) va AL FINAL en las dos direcciones: un «—» arriba
 *    de la lista no le dice nada al operador;
 *  - texto es-MX sin distinguir acentos ni mayúsculas y con números
 *    naturales («Filtro 9» antes que «Filtro 10»).
 *
 * Todo PURO; lo prueban los tests de cada tabla
 * (`__tests__/inventario-orden.test.ts`, `__tests__/vencimientos-orden.test.ts`).
 */

export type DireccionOrden = "asc" | "desc";

/** Valor de orden que nace de una columna: `col` o `col-desc`. */
export type OrdenDeColumna<C extends string> = C | `${C}-desc`;

export function ordenDeColumna<C extends string>(
  columna: C,
  dir: DireccionOrden,
): OrdenDeColumna<C> {
  return (dir === "asc" ? columna : `${columna}-desc`) as OrdenDeColumna<C>;
}

/** Dirección con la que la columna está ordenando ahora (null = no ordena por ella). */
export function direccionDeColumna(columna: string, orden: string): DireccionOrden | null {
  if (orden === columna) return "asc";
  if (orden === `${columna}-desc`) return "desc";
  return null;
}

/**
 * Clic en el encabezado de una columna: si ya ordena por ella, invierte la
 * dirección; si no, arranca con su dirección natural (`primeraDireccion`).
 */
export function ordenAlPulsarColumna<C extends string>(
  columna: C,
  actual: string,
  primeraDireccion: Readonly<Record<C, DireccionOrden>>,
): OrdenDeColumna<C> {
  const dir = direccionDeColumna(columna, actual);
  if (dir === "asc") return ordenDeColumna(columna, "desc");
  if (dir === "desc") return ordenDeColumna(columna, "asc");
  return ordenDeColumna(columna, primeraDireccion[columna]);
}

/** Elección del clic mientras la URL (replaceState) se asienta. */
export interface EleccionOrden<O extends string> {
  /** `?orden=` vigente cuando se hizo clic. */
  base: O;
  valor: O;
}

/**
 * Qué orden se PINTA. La URL viva manda (al volver del detalle con
 * router.back() Next reusa el payload viejo de la página, así que una prop
 * del server no sirve); la elección del clic solo gana mientras la URL siga
 * en el valor sobre el que se tomó, para responder al instante. En cuanto la
 * URL cambia, la elección CADUCA (`eleccion: null`): si no, resucitaría
 * cuando la URL regresara a su base (p. ej. el menú lateral limpia `?orden=`
 * sin remontar la tabla). Devuelve la MISMA elección si sigue vigente (el
 * componente solo actualiza su estado si cambió).
 */
export function resolverOrden<O extends string>(
  eleccion: EleccionOrden<O> | null,
  ordenUrl: O,
): { orden: O; eleccion: EleccionOrden<O> | null } {
  if (eleccion && eleccion.base === ordenUrl) return { orden: eleccion.valor, eleccion };
  return { orden: ordenUrl, eleccion: null };
}

/** Comparación de texto es-MX: sin acentos ni mayúsculas, números naturales. */
export const coladorEsMx = new Intl.Collator("es-MX", { sensitivity: "base", numeric: true });

/** Número conocido o null (null, undefined, "" y NaN son «no se sabe»). */
export function numeroONulo(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function textoONulo(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/** Desconocidos AL FINAL sin importar la dirección; si ambos se conocen, `cmp`. */
export function nulosAlFinal<V>(
  a: V | null,
  b: V | null,
  cmp: (x: V, y: V) => number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

/** Desempate final por id: determinista (recargar no baraja filas). */
export function compararIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
