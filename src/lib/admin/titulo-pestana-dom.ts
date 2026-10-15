/**
 * Título de la PESTAÑA con los datos de la página (14-oct-2026): el lado DOM
 * de `<TituloPestana>` (`components/admin/titulo-pestana.tsx`). Sin React y
 * con el documento y el `MutationObserver` INYECTADOS: la prueba
 * (`__tests__/titulo-pestana-dom.test.ts`) los simula en node.
 *
 * Por qué la página pone el título y no `generateMetadata`: ver la regla 5 de
 * `titulos-pestana.ts` (la precarga de cada <Link> visible corre
 * `generateMetadata` SIN la página: una lectura del API por fila).
 *
 * Por qué se VIGILA el <head> en vez de escribir el título una sola vez:
 * Next vuelve a montar su <title> en CADA respuesta del servidor (la `key`
 * de su Metadata lleva el id de la petición): el router.refresh() de
 * RefreshOnFocus al volver a la pestaña, una server action que revalida, un
 * cambio de `?mes=`. React mete ese <title> nuevo ANTES del anterior y la
 * pestaña volvía al genérico («Vuelo · Vuelatour») justo al regresar a ella,
 * que es el caso de varias pestañas que motivó el pedido.
 *
 * Reglas:
 *  - El último montado manda (pila): dos a la vez jamás se pelean el título.
 *  - Lo que escribimos no despierta al vigilante (`takeRecords`); se escribe
 *    solo si la pestaña dice otra cosa: no hay ciclo posible.
 *  - Al desmontar el último, si la pestaña sigue con lo nuestro, se repone el
 *    último título que puso Next (nunca queda el de una pantalla que ya no
 *    está); si Next ya puso el de la pantalla nueva, no se toca.
 */

/** Lo que devuelve `document.title`: espacios ASCII colapsados y recortados. */
export function normalizarTituloDocumento(texto: string): string {
  return texto.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
}

/** Lo que se usa del `document` (en la prueba, un objeto simple). */
export interface DocumentoConTitulo {
  title: string;
  readonly head: object | null;
}

/** Lo que se usa de un `MutationObserver`. */
export interface VigilanteTitulo {
  observe(objetivo: object, opciones: { childList: true; subtree: true; characterData: true }): void;
  takeRecords(): unknown[];
  disconnect(): void;
}

export type CrearVigilanteTitulo = (alCambiar: () => void) => VigilanteTitulo;

export interface ControlTituloPestana {
  /** Pone `titulo` en la pestaña mientras viva; devuelve su limpieza. */
  fijar(titulo: string): () => void;
}

export function crearControlTituloPestana(
  doc: DocumentoConTitulo,
  crearVigilante: CrearVigilanteTitulo,
): ControlTituloPestana {
  const pila: Array<{ titulo: string }> = [];
  let vigilante: VigilanteTitulo | null = null;
  /** El último título que puso Next (el que había antes del nuestro). */
  let deNext: string | null = null;
  /** Lo último que escribimos, tal como quedó en `document.title`. */
  let escrito: string | null = null;

  function imponer() {
    const deseado = pila.length > 0 ? pila[pila.length - 1].titulo : null;
    if (deseado === null) return;
    const actual = doc.title;
    if (actual === deseado) return;
    if (actual !== escrito) deNext = actual;
    doc.title = deseado;
    escrito = doc.title;
    vigilante?.takeRecords();
  }

  return {
    fijar(titulo) {
      const entrada = { titulo: normalizarTituloDocumento(titulo) };
      pila.push(entrada);
      if (vigilante === null && doc.head !== null) {
        vigilante = crearVigilante(imponer);
        vigilante.observe(doc.head, { childList: true, subtree: true, characterData: true });
      }
      imponer();
      return () => {
        const i = pila.lastIndexOf(entrada);
        if (i >= 0) pila.splice(i, 1);
        if (pila.length > 0) {
          imponer();
          return;
        }
        vigilante?.disconnect();
        vigilante = null;
        if (deNext !== null && escrito !== null && doc.title === escrito) doc.title = deNext;
        deNext = null;
        escrito = null;
      };
    },
  };
}
