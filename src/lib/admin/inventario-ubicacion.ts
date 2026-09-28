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

// ─────────────── Alta rápida, administrar y eliminar (28-sep-2026) ───────────────
//
// Pedido del cliente (captura del selector «Ubicación» del formulario del
// producto): «Necesitamos una forma rápida y ágil para poder editar, borrar o
// agregar opciones a este listado de lugares para el inventario». API 0.0.38:
// `DELETE ubicaciones/:id` (solo sin productos; 409 `UBICACION_EN_USO`) y
// `PUT ubicaciones/orden` (409 `UBICACIONES_CAMBIARON`).

/** Valor CENTINELA de la opción «＋ Agregar ubicación…» del selector (nunca viaja al API). */
export const VALOR_AGREGAR_UBICACION = "__agregar_ubicacion__";
export const ETIQUETA_OPCION_AGREGAR = "＋ Agregar ubicación…";
/** Texto accesible (aria-label/title) del botón con engrane junto al selector. */
export const ETIQUETA_ADMINISTRAR_UBICACIONES = "Administrar ubicaciones";
export const PLACEHOLDER_NUEVA_UBICACION = "Nombre de la ubicación nueva";
export const ETIQUETA_ELIMINAR = "Eliminar";

/** Nombre como se guarda: sin espacios en los extremos ni dobles (espejo del DTO). */
export function limpiarNombreUbicacion(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Opciones del selector de ubicación del producto: las ACTIVAS en su orden +
 * la ACTUAL del ítem aunque esté inactiva (se ve «(inactiva)» y no se vuelve
 * a elegir). Fuente única del formulario y de «Mover a…».
 */
export function opcionesSelectorUbicacion<T extends InventarioUbicacion>(
  catalogo: readonly T[],
  actualId?: string | null,
): T[] {
  return ordenarCatalogo(catalogo).filter((u) => u.activo || (actualId != null && u.id === actualId));
}

/**
 * ¿El valor elegido sigue siendo válido con el catálogo nuevo? "" (sin
 * ubicación / sin elegir) siempre; un id solo si existe y está activo, o es
 * la ubicación que el ítem YA tiene. Si la eliminaron o la desactivaron desde
 * «Administrar», el selector vuelve a "" en vez de quedarse apuntando a nada.
 */
export function ubicacionSigueElegible(
  catalogo: ReadonlyArray<Pick<InventarioUbicacion, "id" | "activo">>,
  valor: string,
  actualId?: string | null,
): boolean {
  if (!valor) return true;
  return catalogo.some((u) => u.id === valor && (u.activo || u.id === actualId));
}

/** Qué hacer con el nombre tecleado en «＋ Agregar ubicación…». */
export type AltaRapidaUbicacion =
  | { tipo: "INVALIDO"; error: string }
  /** Ya existe ACTIVA (sin acentos ni mayúsculas): se ELIGE, no se duplica. */
  | { tipo: "EXISTE"; ubicacion: InventarioUbicacion }
  /** Existe pero desactivada: no se puede elegir hasta reactivarla. */
  | { tipo: "INACTIVA"; ubicacion: InventarioUbicacion; error: string }
  | { tipo: "NUEVA"; nombre: string };

/**
 * Alta rápida desde el selector: el operador escribe «oficina NUEVA» y ya
 * existe «Oficina nueva» ⇒ se elige esa (sin error ni duplicado); escribe una
 * desactivada ⇒ se le dice cómo reactivarla; si no, se crea. El 409 del API
 * (`UBICACION_DUPLICADA`) sigue siendo el candado real.
 */
export function resolverAltaRapidaUbicacion(
  nombre: string,
  catalogo: readonly InventarioUbicacion[],
): AltaRapidaUbicacion {
  const limpio = limpiarNombreUbicacion(nombre);
  const clave = normalizarNombreUbicacion(limpio);
  const existente = clave ? catalogo.find((u) => normalizarNombreUbicacion(u.nombre) === clave) : undefined;
  if (existente?.activo) return { tipo: "EXISTE", ubicacion: existente };
  if (existente) {
    return {
      tipo: "INACTIVA",
      ubicacion: existente,
      error: `«${existente.nombre}» ya existe pero está desactivada: actívala en «${ETIQUETA_ADMINISTRAR_UBICACIONES}» (engrane).`,
    };
  }
  const error = errorNombreUbicacion(limpio, catalogo);
  if (error) return { tipo: "INVALIDO", error };
  return { tipo: "NUEVA", nombre: limpio };
}

/** Toast del alta rápida. */
export function textoUbicacionAgregada(nombre: string): string {
  return `Ubicación «${nombre}» agregada y seleccionada.`;
}

/** Toast cuando lo tecleado ya existía: se eligió esa. */
export function textoUbicacionYaExistia(nombre: string): string {
  return `«${nombre}» ya existía: quedó seleccionada.`;
}

/**
 * Subir/bajar con ▲▼: el catálogo COMPLETO (activas e inactivas, como lo
 * pinta el diálogo) con esa fila intercambiada con su vecina, listo para
 * `PUT ubicaciones/orden` (una sola llamada: el API numera 1..n). null = ya
 * está en el extremo o no existe.
 */
export function ordenTrasMover(
  catalogo: readonly InventarioUbicacion[],
  id: string,
  direccion: "arriba" | "abajo",
): string[] | null {
  const ids = ordenarCatalogo(catalogo).map((u) => u.id);
  const i = ids.indexOf(id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** Reemplaza (o agrega) una fila del catálogo con la respuesta del API. No muta. */
export function reemplazarUbicacion(
  catalogo: readonly InventarioUbicacion[],
  fila: InventarioUbicacion,
): InventarioUbicacion[] {
  return catalogo.some((u) => u.id === fila.id)
    ? catalogo.map((u) => (u.id === fila.id ? { ...u, ...fila } : u))
    : [...catalogo, fila];
}

/** A dónde se pueden mover los productos de una ubicación antes de eliminarla. */
export function destinosParaVaciar(
  catalogo: readonly InventarioUbicacion[],
  id: string,
): InventarioUbicacion[] {
  return ubicacionesActivas(catalogo).filter((u) => u.id !== id);
}

/** Confirmación de «Eliminar» cuando nadie la usa: se borra DE VERDAD. */
export function textoConfirmarEliminar(nombre: string): string {
  return `Se eliminará «${nombre}» de la lista para siempre. Ningún producto la usa, así que nada más cambia.`;
}

/**
 * «Eliminar» con productos activos: no se borra; se explica y se ofrece
 * moverlos primero (el API respondería 409 `UBICACION_EN_USO`).
 */
export function textoEliminarConProductos(nombre: string, productos: number): string {
  const pron = productos === 1 ? "muévelo" : "muévelos";
  return `«${nombre}» tiene ${textoProductos(productos)}. Para eliminarla, primero ${pron} a otra ubicación:`;
}

/** Toast al eliminar. */
export function textoUbicacionEliminada(nombre: string): string {
  return `Ubicación «${nombre}» eliminada.`;
}

/**
 * Valor del selector después de «Mover N productos» (vaciar `desdeId` hacia
 * `haciaId`) desde «Administrar» (revisión adversaria 28-sep-2026). El
 * formulario del producto que abrió el engrane apunta a la ubicación que se
 * acaba de vaciar ⇒ su producto (activo) YA vive en el destino: el selector
 * lo sigue. Si no, al eliminar la vacía el selector caía a «Sin ubicación» y
 * «Guardar» le quitaba al producto la ubicación a la que el operador lo
 * acababa de mover. Cualquier otro valor se respeta.
 */
export function ubicacionTrasVaciar(valor: string, desdeId: string, haciaId: string): string {
  return valor !== "" && valor === desdeId ? haciaId : valor;
}

/**
 * «＋ Agregar ubicación…» con un nombre tecleado y SIN guardar cuando se
 * pulsa el botón principal del formulario (o «Mover» en «Mover a…»): no se
 * guarda nada y se dice qué falta (revisión adversaria 28-sep-2026). Sin esto
 * el producto se guardaba con la ubicación ANTERIOR y el nombre se perdía en
 * silencio — dos «Guardar» a la vista y el operador cree que ya quedó.
 */
export function textoAltaUbicacionPendiente(nombre: string): string {
  return `Falta guardar la ubicación nueva «${limpiarNombreUbicacion(nombre)}»: pulsa Enter o «Guardar» junto al nombre (o cancélala con Esc).`;
}

/** Lo mínimo de un `ActionResult` fallido para redactar el error. */
export interface ErrorAccionUbicacion {
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Error es-MX de una acción del catálogo. Los códigos del API
 * (`UBICACION_DUPLICADA`, `UBICACION_EN_USO`, `UBICACIONES_CAMBIARON`,
 * `UBICACION_NO_EXISTE`, `MIGRACION_PENDIENTE`) ya traen su mensaje en
 * es-MX y se pintan tal cual. Un 404 SIN código en «eliminar»/«ordenar» es
 * la RUTA que no existe (API previo al 0.0.38): se dice qué hacer mientras.
 */
export function textoErrorUbicacion(
  accion: "agregar" | "renombrar" | "ordenar" | "eliminar" | "activar" | "mover",
  res: ErrorAccionUbicacion,
): string {
  const conCodigo =
    res.code != null &&
    [
      "UBICACION_DUPLICADA",
      "UBICACION_EN_USO",
      "UBICACIONES_CAMBIARON",
      "UBICACION_NO_EXISTE",
      "UBICACION_INACTIVA",
      "MIGRACION_PENDIENTE",
    ].includes(res.code);
  if (conCodigo && res.error) return res.error;
  if (res.status === 404 && accion === "eliminar") {
    return "El sistema todavía no permite eliminar ubicaciones; desactívala mientras tanto.";
  }
  if (res.status === 403) return "Tu usuario no puede cambiar las ubicaciones.";
  const respaldo: Record<typeof accion, string> = {
    agregar: "No se pudo agregar la ubicación",
    renombrar: "No se pudo renombrar",
    ordenar: "No se pudo cambiar el orden",
    eliminar: "No se pudo eliminar la ubicación",
    activar: "No se pudo guardar el cambio",
    mover: "No se pudieron mover los productos",
  };
  return res.error || respaldo[accion];
}

/**
 * ¿El PUT de orden no existe en este API (previo al 0.0.38)? 404 sin código
 * de negocio ⇒ el panel cae a los dos PATCH de siempre (`intercambioOrden`).
 */
export function ordenSinRutaNueva(res: ErrorAccionUbicacion): boolean {
  return res.status === 404 && res.code !== "UBICACION_NO_EXISTE";
}
