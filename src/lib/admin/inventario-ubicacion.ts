/**
 * Ubicación de los productos de bodega — 25-sep-2026.
 *
 * Pedido del cliente: «aprovechar poner una columna de ubicación, ya que
 * tenemos varias ubicaciones donde pueden estar guardadas las refacciones:
 * la Oficina vieja, la oficina nueva, el locker del aeropuerto, la bodega del
 * taller de Mérida, nuestra bodega en el taller de Cozumel».
 *
 * El API 0.0.35 (migración 20260925000001) creó el catálogo
 * `inventario_ubicacion` y `inventario_item.ubicacion_id`. El texto libre de
 * siempre (`ubicacion`: «Bodega Cancún» ×69, «Corner»…) se CONSERVA como
 * LEGADO y **no se adivina su mapeo**: se pinta con «(anterior)» en ámbar
 * hasta que la oficina elija la ubicación nueva (filtro «Sin ubicación
 * nueva» + «Mover a…»).
 *
 * Todo aquí es PURO (prueba `__tests__/inventario-ubicacion.test.ts`):
 * ningún componente redacta estos textos ni decide el tipo de ubicación.
 *
 * SKEW DE DEPLOY: sin la llave `ubicacion_id` en el ítem (API previo o
 * migración sin aplicar) la ubicación es `'TEXTO'`: se pinta tal cual, sin
 * ámbar — con un API viejo NADA es «anterior».
 */

import type {
  InventarioUbicacion,
  MoverUbicacionResultado,
} from "@/types/inventory";

/** Límites del nombre (espejo del DTO y del CHECK de la BD). */
export const NOMBRE_UBICACION_MIN = 2;
export const NOMBRE_UBICACION_MAX = 50;
/** Tope del lote de «Mover a…» (espejo de `@ArrayMaxSize(500)` del API). */
export const TOPE_MOVER_UBICACION = 500;

/** Valor del filtro «Sin ubicación nueva» (`?ubic=sin`, `ubicacion=sin` del API). */
export const FILTRO_SIN_UBICACION = "sin";

// ───────────────────────── Textos únicos ─────────────────────────

export const ETIQUETA_UBICACION = "Ubicación";
export const MARCA_ANTERIOR = "(anterior)";
export const TITULO_ANTERIOR = "Elige la ubicación nueva";
export const TEXTO_SIN_UBICACION = "Sin ubicación";
export const ETIQUETA_FILTRO_TODAS = "Todas";
export const ETIQUETA_FILTRO_SIN = "Sin ubicación nueva";
export const ETIQUETA_MOVER = "Mover a…";
export const TITULO_DIALOGO_UBICACIONES = "Ubicaciones";
export const ETIQUETA_AGREGAR_UBICACION = "Agregar ubicación";
export const MARCA_INACTIVA = "(inactiva)";

/** Nota ámbar del formulario del producto cuando la ubicación es la anterior. */
export function notaUbicacionAnterior(legado: string): string {
  return `Ubicación anterior: «${legado}». Elige la ubicación nueva.`;
}

/** Tooltip del botón «Desactivar» cuando la ubicación aún tiene productos. */
export function tituloNoDesactivable(productos: number): string {
  return `Mueve primero ${productos === 1 ? "su producto" : `sus ${productos} productos`} a otra ubicación`;
}

/** «1 producto» / «12 productos». */
export function textoProductos(n: number): string {
  return `${n} ${n === 1 ? "producto" : "productos"}`;
}

// ───────────────────────── Lo que se pinta ─────────────────────────

export type TipoUbicacion = "CATALOGO" | "LEGADO" | "VACIA" | "TEXTO";

/** Lo mínimo de un ítem para saber su ubicación. */
export interface ItemConUbicacion {
  ubicacion?: string | null;
  ubicacion_id?: string | null;
  ubicacion_nombre?: string | null;
  ubicacion_legado?: string | null;
}

const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/**
 * Texto y tipo de la ubicación de un ítem:
 *  - `CATALOGO`: tiene `ubicacion_id` ⇒ el nombre del catálogo.
 *  - `LEGADO`: sin `ubicacion_id` pero con texto viejo ⇒ «Bodega Cancún» (se
 *    pinta con «(anterior)» en ámbar y el tooltip «Elige la ubicación nueva»).
 *  - `VACIA`: nada ⇒ «Sin ubicación» tenue.
 *  - `TEXTO`: la llave `ubicacion_id` NO vino (API previo / sin migración) ⇒
 *    el texto tal cual, sin ámbar (nada se adivina).
 */
export function textoUbicacion(it: ItemConUbicacion): { texto: string; tipo: TipoUbicacion } {
  if (!("ubicacion_id" in it) || it.ubicacion_id === undefined) {
    const t = limpio(it.ubicacion);
    return t ? { texto: t, tipo: "TEXTO" } : { texto: TEXTO_SIN_UBICACION, tipo: "VACIA" };
  }
  if (it.ubicacion_id) {
    return {
      texto: limpio(it.ubicacion_nombre) ?? limpio(it.ubicacion) ?? TEXTO_SIN_UBICACION,
      tipo: "CATALOGO",
    };
  }
  const legado = limpio(it.ubicacion_legado) ?? limpio(it.ubicacion);
  return legado ? { texto: legado, tipo: "LEGADO" } : { texto: TEXTO_SIN_UBICACION, tipo: "VACIA" };
}

// ───────────────────────── Filtro ─────────────────────────

/** null = «Todas»; `'sin'` = sin ubicación nueva; uuid = una del catálogo. */
export type FiltroUbicacion = string | null;

/**
 * `?ubic=` → filtro válido. Un uuid que no está en el catálogo (enlace
 * viejo, dedazo) o cualquier otro valor se IGNORA (= «Todas»): la lista sale
 * completa, nunca una pantalla rota. Parámetro repetido ⇒ el primero.
 */
export function filtroUbicacionDeUrl(
  valor: string | readonly string[] | null | undefined,
  catalogo: ReadonlyArray<Pick<InventarioUbicacion, "id">>,
): FiltroUbicacion {
  const v = (Array.isArray(valor) ? valor[0] : (valor as string | null | undefined)) ?? "";
  if (v === FILTRO_SIN_UBICACION) return FILTRO_SIN_UBICACION;
  return catalogo.some((u) => u.id === v) ? v : null;
}

/**
 * Filtra la bodega COMPLETA (antes de la búsqueda y del paginado). `'sin'` =
 * `ubicacion_id` null CON la llave presente (un ítem de un API previo no es
 * «sin ubicación nueva»: simplemente no se sabe). Sin filtro ⇒ la MISMA lista.
 */
export function filtrarPorUbicacion<T extends ItemConUbicacion>(
  items: readonly T[],
  filtro: FiltroUbicacion,
): T[] {
  if (!filtro) return items as T[];
  if (filtro === FILTRO_SIN_UBICACION) {
    return items.filter((it) => "ubicacion_id" in it && it.ubicacion_id == null);
  }
  return items.filter((it) => it.ubicacion_id === filtro);
}

export interface OpcionFiltroUbicacion {
  valor: string;
  etiqueta: string;
  conteo: number;
}

/**
 * Opciones del selector «Ubicación: Todas · Sin ubicación nueva (N) ·
 * Oficina vieja (N) · …». Las ACTIVAS en su orden; una inactiva solo si aún
 * tiene productos en la lista (no debería pasar: la BD no la deja desactivar
 * así). Los conteos salen de la MISMA lista que se filtra.
 */
export function opcionesFiltroUbicacion(
  items: readonly ItemConUbicacion[],
  catalogo: readonly InventarioUbicacion[],
): OpcionFiltroUbicacion[] {
  const porId = new Map<string, number>();
  let sin = 0;
  for (const it of items) {
    if (it.ubicacion_id) porId.set(it.ubicacion_id, (porId.get(it.ubicacion_id) ?? 0) + 1);
    else if ("ubicacion_id" in it) sin += 1;
  }
  const opciones: OpcionFiltroUbicacion[] = [
    { valor: FILTRO_SIN_UBICACION, etiqueta: ETIQUETA_FILTRO_SIN, conteo: sin },
  ];
  for (const u of ordenarCatalogo(catalogo)) {
    const conteo = porId.get(u.id) ?? 0;
    if (!u.activo && conteo === 0) continue;
    opciones.push({
      valor: u.id,
      etiqueta: u.activo ? u.nombre : `${u.nombre} ${MARCA_INACTIVA}`,
      conteo,
    });
  }
  return opciones;
}

const colador = new Intl.Collator("es-MX", { sensitivity: "base", numeric: true });

/** Catálogo por `orden` y luego nombre (así lo pinta todo selector). No muta. */
export function ordenarCatalogo<T extends Pick<InventarioUbicacion, "orden" | "nombre" | "id">>(
  catalogo: readonly T[],
): T[] {
  return [...catalogo].sort(
    (a, b) =>
      (Number(a.orden) || 0) - (Number(b.orden) || 0) ||
      colador.compare(a.nombre, b.nombre) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** id → posición (0..n) del catálogo ya ordenado: la usa el orden de la tabla. */
export function mapaOrdenUbicacion(
  catalogo: readonly InventarioUbicacion[],
): Map<string, number> {
  return new Map(ordenarCatalogo(catalogo).map((u, i) => [u.id, i]));
}

/** Destinos elegibles para «Mover a…» y para el formulario: SOLO activas, en su orden. */
export function ubicacionesActivas(
  catalogo: readonly InventarioUbicacion[],
): InventarioUbicacion[] {
  return ordenarCatalogo(catalogo.filter((u) => u.activo));
}

// ───────────────────────── Elección del filtro (URL viva) ─────────────────────────

/** Elección del select mientras la URL (replaceState) se asienta. */
export interface EleccionFiltroUbicacion {
  /** `?ubic=` vigente cuando se eligió. */
  base: FiltroUbicacion;
  valor: FiltroUbicacion;
}

/**
 * Mismo contrato que `resolverOrdenInventario`: la URL viva manda (al volver
 * del detalle Next reusa el payload viejo) y la elección local solo gana
 * mientras la URL siga en el valor sobre el que se tomó.
 */
export function resolverFiltroUbicacion(
  eleccion: EleccionFiltroUbicacion | null,
  filtroUrl: FiltroUbicacion,
): { filtro: FiltroUbicacion; eleccion: EleccionFiltroUbicacion | null } {
  if (eleccion && eleccion.base === filtroUrl) return { filtro: eleccion.valor, eleccion };
  return { filtro: filtroUrl, eleccion: null };
}

// ───────────────────────── «Mover a…» ─────────────────────────

/** Cuántos nombres se enseñan en la confirmación antes del «y N más». */
export const MUESTRA_MOVER = 5;

/**
 * Confirmación del lote: «Se moverán 12 productos a «Oficina nueva»: Aceite
 * 15W-50, Balata 66-105, … y 7 más. No mueve stock ni dinero.»
 *
 * `n` y `muestra` son SOLO los que de verdad cambian de ubicación; `yaAhi` =
 * los de la vista que ya están en ese destino (revisión 25-sep-2026: el
 * conteo decía «Se moverán 12» cuando 3 ya estaban ahí y solo cambiaban 9).
 */
export function textoConfirmarMover(
  n: number,
  nombreDestino: string,
  muestra: readonly string[],
  yaAhi = 0,
): string {
  const nombres = muestra.slice(0, MUESTRA_MOVER);
  const resto = Math.max(0, n - nombres.length);
  const lista =
    nombres.length > 0
      ? `: ${nombres.join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`
      : "";
  const verbo = n === 1 ? "Se moverá" : "Se moverán";
  const yaEstan =
    yaAhi > 0 ? ` (${yaAhi === 1 ? "1 ya está ahí" : `${yaAhi} ya están ahí`})` : "";
  return `${verbo} ${textoProductos(n)} a «${nombreDestino}»${lista}${yaEstan}. No mueve stock ni dinero.`;
}

/** Todos los de la vista ya están en el destino: no hay nada que mover. */
export function textoNadaQueMover(yaAhi: number, nombreDestino: string): string {
  const todos = yaAhi === 1 ? "El producto ya está" : `Los ${yaAhi} productos ya están`;
  return `${todos} en «${nombreDestino}»: no hay nada que mover.`;
}

/**
 * Parte los productos de la vista contra el destino elegido: los que cambian
 * de ubicación (en su orden) y cuántos ya estaban ahí. Sin destino, todos
 * cuentan como «por mover». El API sigue siendo el que decide (`sin_cambio`):
 * esto solo evita prometer un conteo que no va a pasar.
 */
export function particionMover<T extends { ubicacion_id?: string | null }>(
  productos: readonly T[],
  destinoId: string | null | undefined,
): { porMover: T[]; yaAhi: number } {
  if (!destinoId) return { porMover: [...productos], yaAhi: 0 };
  const porMover = productos.filter((p) => p.ubicacion_id !== destinoId);
  return { porMover, yaAhi: productos.length - porMover.length };
}

/** Botón del diálogo: «Mover 12 productos». */
export function textoBotonMover(n: number): string {
  return `Mover ${textoProductos(n)}`;
}

/**
 * Toast del resultado: «12 productos ahora están en «Oficina nueva».» + el
 * detalle de lo que no cambió (ya estaban ahí / ya no están activos). Nada se
 * esconde: si no se movió ninguno, se dice por qué.
 */
export function textoResultadoMover(r: MoverUbicacionResultado): {
  titulo: string;
  detalle: string | null;
} {
  const destino = r.ubicacion?.nombre ?? "la ubicación elegida";
  const partes: string[] = [];
  if (r.sin_cambio > 0) {
    partes.push(
      r.sin_cambio === 1 ? "1 ya estaba ahí" : `${r.sin_cambio} ya estaban ahí`,
    );
  }
  const noAplican = (r.no_encontrados?.length ?? 0) + (r.inactivos?.length ?? 0);
  if (noAplican > 0) {
    partes.push(
      noAplican === 1
        ? "1 no se movió porque ya no está activo"
        : `${noAplican} no se movieron porque ya no están activos`,
    );
  }
  const detalle = partes.length > 0 ? `${partes.join(" · ")}.` : null;
  if (r.movidos === 0) {
    return { titulo: `Ningún producto cambió de ubicación.`, detalle };
  }
  const verbo = r.movidos === 1 ? "ahora está" : "ahora están";
  return { titulo: `${textoProductos(r.movidos)} ${verbo} en «${destino}».`, detalle };
}

// ───────────────────────── Diálogo «Ubicaciones» ─────────────────────────

/** Normaliza para comparar nombres (sin acentos ni mayúsculas, espacios colapsados). */
export function normalizarNombreUbicacion(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validación del nombre ANTES de ir al API (el 409 del API sigue siendo el
 * candado real): vacío/corto/largo y duplicado contra el catálogo (sin
 * acentos ni mayúsculas, ignorando la propia fila al renombrar). null = ok.
 */
export function errorNombreUbicacion(
  nombre: string,
  catalogo: ReadonlyArray<Pick<InventarioUbicacion, "id" | "nombre">>,
  propioId?: string,
): string | null {
  const t = (nombre ?? "").trim().replace(/\s+/g, " ");
  if (t.length < NOMBRE_UBICACION_MIN) return `Escribe al menos ${NOMBRE_UBICACION_MIN} letras.`;
  if (t.length > NOMBRE_UBICACION_MAX) return `Máximo ${NOMBRE_UBICACION_MAX} caracteres.`;
  const n = normalizarNombreUbicacion(t);
  const dup = catalogo.find((u) => u.id !== propioId && normalizarNombreUbicacion(u.nombre) === n);
  return dup ? `Ya existe la ubicación «${dup.nombre}».` : null;
}

/**
 * Subir/bajar una ubicación: devuelve los DOS cambios de `orden` que hay que
 * guardar (intercambio con la vecina) o null si ya está en el extremo. Si las
 * dos traen el mismo `orden` (datos viejos), la que sube queda antes.
 */
export function intercambioOrden(
  catalogo: readonly InventarioUbicacion[],
  id: string,
  direccion: "arriba" | "abajo",
): Array<{ id: string; orden: number }> | null {
  const lista = ordenarCatalogo(catalogo);
  const i = lista.findIndex((u) => u.id === id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  const a = lista[i];
  const b = lista[j];
  let ordenA = Number(b.orden) || 0;
  let ordenB = Number(a.orden) || 0;
  if (ordenA === ordenB) {
    // Mismo orden: se separan para que el intercambio se note.
    if (direccion === "arriba") ordenB = ordenA + 1;
    else ordenA = ordenB + 1;
  }
  return [
    { id: a.id, orden: ordenA },
    { id: b.id, orden: ordenB },
  ];
}

/** Confirmación de activar/desactivar una ubicación. */
export function textoConfirmarActivo(nombre: string, activar: boolean): string {
  return activar
    ? `«${nombre}» vuelve a aparecer para elegirla en los productos y en «Mover a…».`
    : `«${nombre}» deja de aparecer para elegirla. Los productos no cambian; se puede volver a activar.`;
}
