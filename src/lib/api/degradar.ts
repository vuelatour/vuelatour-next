/**
 * Degradación POR TARJETA, sin mentir — 21-sep-2026.
 *
 * El síntoma: una página del panel hacía `Promise.all([...])` y UNA llamada
 * accesoria (el catálogo de proveedores, el de aeronaves…) tumbaba la pantalla
 * completa al error boundary. Inventario era el caso reportado: tres de cinco
 * llamadas sin `.catch`.
 *
 * La regla, y por qué son dos reglas distintas:
 *  - Llamada **ACCESORIA** (catálogos que alimentan selectores: proveedores,
 *    aeronaves, cuentas, clientes, configuración, `/me`): se degrada a vacío y
 *    la página lo DICE con un aviso discreto. Un selector corto es molesto; la
 *    pantalla en blanco es peor.
 *  - Llamada **PRINCIPAL** (los datos que la pantalla existe para mostrar):
 *    JAMÁS se traga. Pintar «sin ítems» porque el API no contestó sería
 *    MENTIR, y sobre dinero se toman decisiones. O va al boundary (que ya
 *    reintenta) o se pinta `ErrorState` con opción de recargar.
 *
 * Uso (Server Component):
 * ```ts
 * const degradado = new Degradaciones();
 * const [items, proveedores] = await Promise.all([
 *   listInventarioTodo(),                                        // principal
 *   degradado.opcional("los proveedores", listProviders(), { data: [] }),
 * ]);
 * // …
 * <AvisoDegradado faltantes={degradado.faltantes} />
 * ```
 */

/** Errores de control de flujo de Next (`notFound()`, `redirect()`). */
export function esErrorDeNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * ¿El fallo es «no tienes acceso» en vez de «no se pudo»? 401/403 son
 * deterministas: recargar no los arregla, así que anunciarlos como falla
 * pasajera sería otra mentira. Se degrada en silencio, igual que hoy
 * (p. ej. `/v1/clients` está restringido por rol).
 */
function esFaltaDePermiso(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/**
 * Recolector por REQUEST (nunca a nivel de módulo: se compartiría entre
 * peticiones de distintos usuarios).
 */
export class Degradaciones {
  private readonly _faltantes: string[] = [];

  /** Etiquetas de lo que no se pudo cargar, en el orden en que falló. */
  get faltantes(): string[] {
    return [...this._faltantes];
  }

  get hayFallas(): boolean {
    return this._faltantes.length > 0;
  }

  /**
   * Envuelve una llamada ACCESORIA: si falla, devuelve `vacio` y apunta la
   * etiqueta para el aviso. `etiqueta` se lee dentro de «No se pudo cargar
   * …», así que va en minúsculas y con artículo: «los proveedores».
   *
   * `vacio` puede ser más angosto que la respuesta (`{ data: [] }` frente al
   * `{ data, count, limit, offset }` del API): la página solo usa lo que de
   * verdad necesita y TypeScript vigila que sea así.
   */
  async opcional<T, V = T>(etiqueta: string, promesa: Promise<T>, vacio: V): Promise<T | V> {
    try {
      return await promesa;
    } catch (e) {
      if (esErrorDeNext(e)) throw e;
      if (!esFaltaDePermiso(e)) {
        if (!this._faltantes.includes(etiqueta)) this._faltantes.push(etiqueta);
        console.error(`[admin] no se pudo cargar ${etiqueta}`, e);
      }
      return vacio;
    }
  }
}

/**
 * Resultado de la llamada PRINCIPAL de una pantalla. `ok:false` NO es una
 * lista vacía: la página debe pintar `TarjetaErrorCarga` (o dejar subir el
 * error al boundary), nunca «sin datos».
 */
export type Cargado<T> = { ok: true; datos: T } | { ok: false; datos: null };

/**
 * Envuelve la llamada PRINCIPAL para poder pintar la tarjeta de error sin
 * perder la cabecera de la pantalla. El control de flujo de Next
 * (`notFound()`, `redirect()`) sigue subiendo intacto.
 */
export async function principal<T>(promesa: Promise<T>): Promise<Cargado<T>> {
  try {
    return { ok: true, datos: await promesa };
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    console.error("[admin] falló la carga principal de la pantalla", e);
    return { ok: false, datos: null };
  }
}

/** Une etiquetas en es-MX: «A», «A y B», «A, B y C». */
export function unirEtiquetas(etiquetas: string[]): string {
  if (etiquetas.length === 0) return "";
  if (etiquetas.length === 1) return etiquetas[0];
  return `${etiquetas.slice(0, -1).join(", ")} y ${etiquetas[etiquetas.length - 1]}`;
}

/**
 * ¿La etiqueta está en plural? Las etiquetas son sintagmas con artículo («los
 * proveedores», «las aeronaves», «tu usuario»), así que el artículo manda.
 * Lo verificó el arnés el 21-sep: con una sola etiqueta plural salía «No se
 * pudo cargar los proveedores», que ningún hispanohablante escribiría.
 */
function esPlural(etiqueta: string): boolean {
  return /^(los|las|unos|unas)\s/i.test(etiqueta.trim());
}

/**
 * Texto del aviso discreto. `null` cuando no faltó nada (el componente no
 * pinta nada). El verbo concuerda con lo que falta: varias cosas, o una sola
 * en plural, piden «No se pudieron cargar». El operador lee esto, no un log.
 */
export function textoDegradado(faltantes: string[]): string | null {
  if (faltantes.length === 0) return null;
  const plural = faltantes.length > 1 || esPlural(faltantes[0]);
  const verbo = plural ? "No se pudieron cargar" : "No se pudo cargar";
  return `${verbo} ${unirEtiquetas(faltantes)}; recarga para reintentar.`;
}
