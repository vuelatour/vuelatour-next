/**
 * Historial de gastos del vuelo: gastos que CAMBIARON de vuelo (14-sep-2026).
 *
 * Caso del cliente (vuelo #260): el piloto capturó dos gastos, la oficina
 * movió uno al vuelo #268 y el historial del #260 seguía enseñando las dos
 * capturas — la segunda MUDA (sin descripción ni «Editar»), porque el gasto ya
 * no vive aquí. Ahora el API manda, en el evento UPDATE que cambió `vuelo_id`,
 * un campo ADITIVO `movimiento`:
 *   - `salio`  en el vuelo de ORIGEN (con el folio del DESTINO),
 *   - `llego`  en el vuelo DESTINO   (con el folio del ORIGEN).
 * Este módulo es PURO: solo arma los textos es-MX y el enlace.
 */

export interface MovimientoGastoHistorial {
  /** `salio` = se fue de este vuelo; `llego` = vino de otro vuelo. */
  tipo: "salio" | "llego";
  /**
   * El OTRO vuelo (destino si salió, origen si llegó). **Puede ser null**:
   * el API manda `salio` con `vuelo_id: null` cuando al gasto se le QUITÓ el
   * vuelo (no se fue a ninguno) y `llego` con `vuelo_id: null` cuando el
   * gasto NO tenía vuelo y se le ASIGNÓ este (el caso más común de todos:
   * la oficina liga un gasto suelto desde la bandeja). Sin contraparte no
   * hay a dónde ligar y el texto NO puede hablar de «otro vuelo».
   */
  vuelo_id: string | null;
  folio: number | null;
}

/** "vuelo #268" · "otro vuelo" (sin folio no se inventa un número). */
export function textoVueloOtro(folio: number | null | undefined): string {
  return folio != null ? `vuelo #${folio}` : "otro vuelo";
}

/** Enlace al detalle del otro vuelo. */
export function hrefVuelo(vueloId: string): string {
  return `/admin/flights/${vueloId}`;
}

/**
 * Título del evento cuando el gasto cambió de vuelo:
 * «Gasto movido al vuelo #268» / «Gasto traído del vuelo #260».
 *
 * SIN CONTRAPARTE (`vuelo_id` null) NO hubo otro vuelo: al gasto se le quitó
 * el vuelo o se le asignó éste estando suelto. Decir «traído de otro vuelo»
 * ahí sería falso (y la liga apuntaría a la nada).
 */
export function tituloGastoMovido(mov: MovimientoGastoHistorial): string {
  if (!mov.vuelo_id) {
    return mov.tipo === "salio"
      ? "Gasto desligado de este vuelo"
      : "Gasto asignado a este vuelo";
  }
  const otro = textoVueloOtro(mov.folio);
  // Sin folio la frase es «a otro vuelo» / «de otro vuelo» (sin contracción).
  const conFolio = mov.folio != null;
  return mov.tipo === "salio"
    ? `Gasto movido ${conFolio ? "al" : "a"} ${otro}`
    : `Gasto traído ${conFolio ? "del" : "de"} ${otro}`;
}

/**
 * Nota para las líneas VIEJAS (la captura, las ediciones) de un gasto que ya
 * no vive en este vuelo: «Ahora vive en el vuelo #268». Sustituye al botón
 * «Editar», que solo existe para gastos vivos aquí.
 */
export function notaGastoEnOtroVuelo(folio: number | null | undefined): string {
  return folio != null ? `Ahora vive en el vuelo #${folio}` : "Ahora vive en otro vuelo";
}

/** Lo mínimo que este módulo necesita de un evento del historial. */
export interface EventoConMovimiento {
  gasto_id: string;
  created_at: string;
  movimiento?: MovimientoGastoHistorial | null;
}

/**
 * Por gasto, a DÓNDE se fue (último evento `salio`). Con esto las líneas
 * anteriores de ese gasto dicen dónde vive ahora en vez de quedarse mudas.
 * Un gasto puede rebotar entre vuelos: gana el movimiento más reciente.
 *
 * Una salida SIN destino (`vuelo_id` null = se le quitó el vuelo) no entra:
 * no hay vuelo al que mandar al operador y la nota «Ahora vive en otro
 * vuelo» sería mentira.
 */
export function destinoDeGastosMovidos<T extends EventoConMovimiento>(
  eventos: T[],
): Record<string, MovimientoGastoHistorial> {
  const salidas: Record<string, { mov: MovimientoGastoHistorial; created_at: string }> = {};
  for (const e of eventos) {
    const mov = e.movimiento;
    if (!mov || mov.tipo !== "salio" || !mov.vuelo_id) continue;
    const previo = salidas[e.gasto_id];
    // ISO ordena lexicográficamente: el más reciente gana.
    if (!previo || e.created_at.localeCompare(previo.created_at) > 0) {
      salidas[e.gasto_id] = { mov, created_at: e.created_at };
    }
  }
  return Object.fromEntries(Object.entries(salidas).map(([id, v]) => [id, v.mov]));
}
