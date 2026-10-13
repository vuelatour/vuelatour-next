/**
 * Desplazamiento «justo» para que un elemento quede a la vista dentro de un
 * contenedor con scroll, en UNA dimensión (13-oct-2026). FUENTE ÚNICA — quién
 * la usa:
 *  - las FILAS ACTIVAS de las tablas (`filas-activas.ts#scrollParaVerFila`,
 *    eje vertical del `div[data-slot="table-container"]`, con el <thead>
 *    sticky como zona fija al inicio);
 *  - el LibroExcel (`libro-excel.ts#ejeParaVer`, Decisión B del mismo lote):
 *    por eje, el vertical con las letras + filas inmovilizadas y el
 *    horizontal con la numeración + columnas inmovilizadas.
 * No nacen dos cálculos paralelos: si cambia la regla, cambia aquí.
 *
 * Reglas (estilo Excel, sin animación — quien lo aplica asigna
 * `scrollTop`/`scrollLeft` directo, instantáneo):
 *  - la banda ÚTIL es [scroll + fijoAntes, scroll + alto − fijoDespues): lo
 *    que de verdad se ve, descontando lo que tapa algo fijo;
 *  - si el elemento ya se ve ENTERO ahí ⇒ `null` (no se toca el scroll);
 *  - si empieza antes de la banda ⇒ queda pegado al inicio de la banda;
 *  - si termina después ⇒ queda pegado al final de la banda, y si no cabe se
 *    alinea al INICIO (nunca al final: lo primero que se lee es su arranque);
 *  - nunca devuelve negativos.
 * PURO: sin DOM. Las medidas se le pasan ya leídas.
 */
export interface BandaVisible {
  /** Borde inicial del elemento, en coordenadas del CONTENIDO desplazable. */
  inicio: number;
  /** Borde final del elemento (inicio + tamaño). */
  fin: number;
  /** Scroll actual del marco (`scrollTop` o `scrollLeft`). */
  scroll: number;
  /** Tamaño VISIBLE del marco (`clientHeight` o `clientWidth`). */
  alto: number;
  /** Lo tapado por algo fijo al INICIO de la banda (p. ej. el <thead> sticky). */
  fijoAntes?: number;
  /** Lo tapado por algo fijo al FINAL de la banda (default 0). */
  fijoDespues?: number;
}

/** El scroll NUEVO para ver el elemento entero, o `null` si ya se ve. */
export function desplazamientoParaVer(b: BandaVisible): number | null {
  const fijoAntes = b.fijoAntes ?? 0;
  const fijoDespues = b.fijoDespues ?? 0;
  const desde = b.scroll + fijoAntes;
  const hasta = b.scroll + b.alto - fijoDespues;
  if (b.inicio < desde) return Math.max(0, b.inicio - fijoAntes);
  if (b.fin > hasta) {
    // Pegado al final; si no cabe en la banda, alineado al inicio.
    return Math.max(0, Math.min(b.fin - b.alto + fijoDespues, b.inicio - fijoAntes));
  }
  return null;
}
