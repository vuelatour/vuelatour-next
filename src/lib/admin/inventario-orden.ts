/**
 * Orden de la tabla de Inventario — 24-sep-2026.
 *
 * Pedido del cliente (captura de `/admin/inventory`, vista por producto):
 * «no sé si se pueda poner una opción de ver en orden descendente de cantidad
 * de stock, para visualizar primero las cosas que se van acabando». Lo que
 * llamó «descendente» es en realidad «lo que se acaba primero», así que el
 * atajo se llama así y no «Stock ↓» (que pondría arriba lo que MÁS hay).
 *
 * Órdenes (el valor viaja en `?orden=` para compartir/recargar):
 *  - `nombre` (DEFAULT, A–Z) / `nombre-desc`.
 *  - `categoria` / `categoria-desc`.
 *  - `stock` (menos primero) / `stock-desc` (más primero).
 *  - `ganancia` / `ganancia-desc`.
 *  - `se-acaban`: primero los que están por debajo del mínimo (chip «Bajo»),
 *    luego por stock ascendente.
 *
 * Reglas comunes:
 *  - Empates SIEMPRE alfabéticos A–Z por producto (en cualquier dirección) y,
 *    al final, por id: el orden es determinista (recargar no baraja filas).
 *  - Lo que no se conoce (stock ausente, producto que nunca vendió con
 *    precio) va AL FINAL en las dos direcciones: un «—» arriba de la lista no
 *    le dice nada al operador.
 *  - Comparación de texto es-MX sin distinguir acentos ni mayúsculas y con
 *    números naturales («Filtro 9» antes que «Filtro 10»).
 *
 * El panel YA carga la bodega completa (`listInventarioTodo` pagina hasta
 * `count`), así que el orden se aplica sobre TODOS los ítems antes de la
 * búsqueda y del paginado de la tabla, nunca solo sobre la página visible.
 *
 * Todo aquí es PURO (prueba `__tests__/inventario-orden.test.ts`).
 */

import { valorDeCatalogo } from "./url-params";

export const ORDENES_INVENTARIO = [
  "nombre",
  "nombre-desc",
  "categoria",
  "categoria-desc",
  "stock",
  "stock-desc",
  "ganancia",
  "ganancia-desc",
  "se-acaban",
] as const;
export type OrdenInventario = (typeof ORDENES_INVENTARIO)[number];

/** El orden de siempre: alfabético por producto. No se escribe en la URL. */
export const ORDEN_INVENTARIO_DEFAULT: OrdenInventario = "nombre";

/** Columnas de la tabla que se pueden ordenar con clic en su encabezado. */
export type ColumnaInventario = "nombre" | "categoria" | "stock" | "ganancia";
export type DireccionOrden = "asc" | "desc";

/** Atajos visibles arriba de la tabla (lo que el operador pidió, sin jerga). */
export const ATAJOS_ORDEN_INVENTARIO: ReadonlyArray<{
  valor: OrdenInventario;
  etiqueta: string;
  titulo: string;
}> = [
  { valor: "nombre", etiqueta: "A–Z", titulo: "Orden alfabético por producto" },
  {
    valor: "se-acaban",
    etiqueta: "Se están acabando primero",
    titulo:
      "Arriba los que están por debajo del mínimo (Bajo) y luego los que tienen menos stock",
  },
  { valor: "stock-desc", etiqueta: "Más stock", titulo: "Arriba los que tienen más stock" },
];

/** Dirección con la que arranca cada columna al primer clic. */
const PRIMERA_DIRECCION: Record<ColumnaInventario, DireccionOrden> = {
  nombre: "asc",
  categoria: "asc",
  // Menos stock arriba: es lo que el cliente quiere ver primero.
  stock: "asc",
  // Lo que más ganó arriba (dinero: lo grande primero).
  ganancia: "desc",
};

function ordenDe(columna: ColumnaInventario, dir: DireccionOrden): OrdenInventario {
  return (dir === "asc" ? columna : `${columna}-desc`) as OrdenInventario;
}

/**
 * `?orden=` → orden válido. Fuera de catálogo (enlace viejo, dedazo) o
 * ausente ⇒ el default A–Z: la lista sale completa y en su orden de siempre,
 * nunca una pantalla rota. Un parámetro repetido toma el primero.
 */
export function ordenInventarioDeUrl(
  valor: string | readonly string[] | null | undefined,
): OrdenInventario {
  const v = Array.isArray(valor) ? valor[0] : (valor as string | null | undefined);
  return valorDeCatalogo(v, ORDENES_INVENTARIO) ?? ORDEN_INVENTARIO_DEFAULT;
}

/** Dirección con la que la columna está ordenando ahora (null = no ordena por ella). */
export function direccionDeColumna(
  columna: ColumnaInventario,
  orden: OrdenInventario,
): DireccionOrden | null {
  if (orden === columna) return "asc";
  if (orden === `${columna}-desc`) return "desc";
  return null;
}

/**
 * Clic en el encabezado de una columna: si ya ordena por ella, invierte la
 * dirección; si no, arranca con su dirección natural (`PRIMERA_DIRECCION`).
 */
export function ordenAlPulsarColumna(
  columna: ColumnaInventario,
  actual: OrdenInventario,
): OrdenInventario {
  const dir = direccionDeColumna(columna, actual);
  if (dir === "asc") return ordenDe(columna, "desc");
  if (dir === "desc") return ordenDe(columna, "asc");
  return ordenDe(columna, PRIMERA_DIRECCION[columna]);
}

/** Elección del clic mientras la URL (replaceState) se asienta. */
export interface EleccionOrden {
  /** `?orden=` vigente cuando se hizo clic. */
  base: OrdenInventario;
  valor: OrdenInventario;
}

/**
 * Qué orden se PINTA. La URL viva manda (al volver del detalle con
 * router.back() Next reusa el payload viejo de la página, así que una prop
 * del server no sirve); la elección del clic solo gana mientras la URL siga
 * en el valor sobre el que se tomó, para responder al instante. En cuanto la
 * URL cambia, la elección CADUCA (`eleccion: null`): si no, resucitaría
 * cuando la URL regresara a su base (p. ej. el menú lateral «Inventario»
 * limpia `?orden=` sin remontar la tabla). Devuelve la MISMA elección si
 * sigue vigente (el componente solo actualiza su estado si cambió).
 */
export function resolverOrdenInventario(
  eleccion: EleccionOrden | null,
  ordenUrl: OrdenInventario,
): { orden: OrdenInventario; eleccion: EleccionOrden | null } {
  if (eleccion && eleccion.base === ordenUrl) return { orden: eleccion.valor, eleccion };
  return { orden: ordenUrl, eleccion: null };
}

/** Lo mínimo que se necesita de un ítem para ordenarlo. */
export interface ItemOrdenable {
  id: string;
  nombre: string;
  categoria?: string | null;
  /** El API siempre lo manda; null/NaN = desconocido (skew o dato roto). */
  stock?: number | string | null;
  bajo_stock?: boolean | null;
  /** null = nunca vendió con precio (no es una ganancia de $0). */
  ganancia_mxn?: number | string | null;
}

const colador = new Intl.Collator("es-MX", { sensitivity: "base", numeric: true });

/** Número conocido o null (null, undefined, "" y NaN son «no se sabe»). */
function numeroONulo(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function textoONulo(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/** Desconocidos AL FINAL sin importar la dirección; si ambos se conocen, `cmp`. */
function nulosAlFinal<V>(a: V | null, b: V | null, cmp: (x: V, y: V) => number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

/** Desempate universal: producto A–Z y, si se llaman igual, id (determinista). */
function desempate(a: ItemOrdenable, b: ItemOrdenable): number {
  const porNombre = colador.compare(a.nombre ?? "", b.nombre ?? "");
  if (porNombre !== 0) return porNombre;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function comparador(orden: OrdenInventario): (a: ItemOrdenable, b: ItemOrdenable) => number {
  const signo = orden.endsWith("-desc") ? -1 : 1;
  switch (orden) {
    case "nombre":
    case "nombre-desc":
      return (a, b) => {
        const c = colador.compare(a.nombre ?? "", b.nombre ?? "") * signo;
        return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      };
    case "categoria":
    case "categoria-desc":
      return (a, b) =>
        nulosAlFinal(textoONulo(a.categoria), textoONulo(b.categoria), (x, y) =>
          colador.compare(x, y) * signo,
        ) || desempate(a, b);
    case "stock":
    case "stock-desc":
      return (a, b) =>
        nulosAlFinal(numeroONulo(a.stock), numeroONulo(b.stock), (x, y) => (x - y) * signo) ||
        desempate(a, b);
    case "ganancia":
    case "ganancia-desc":
      return (a, b) =>
        nulosAlFinal(
          numeroONulo(a.ganancia_mxn),
          numeroONulo(b.ganancia_mxn),
          (x, y) => (x - y) * signo,
        ) || desempate(a, b);
    case "se-acaban":
      return (a, b) =>
        nulosAlFinal(numeroONulo(a.stock), numeroONulo(b.stock), (x, y) => {
          // 1.º los que están por debajo del mínimo (chip «Bajo»)…
          const bajoA = a.bajo_stock ? 0 : 1;
          const bajoB = b.bajo_stock ? 0 : 1;
          if (bajoA !== bajoB) return bajoA - bajoB;
          // …y dentro de cada grupo, lo que menos hay arriba.
          return x - y;
        }) || desempate(a, b);
  }
}

/**
 * Ordena una COPIA de la lista (no muta la de entrada). Se aplica sobre la
 * bodega completa, antes de la búsqueda y del paginado de la tabla.
 */
export function ordenarInventario<T extends ItemOrdenable>(
  items: readonly T[],
  orden: OrdenInventario,
): T[] {
  return [...items].sort(comparador(orden));
}
