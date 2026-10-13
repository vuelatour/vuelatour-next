/**
 * FILA ACTIVA y teclado de las tablas (13-oct-2026). PURO: sin React ni DOM.
 *
 * Pedido del cliente: al hacer clic en una fila que quede «activa» (resaltada,
 * distinta del hover), moverse con ↑/↓ por las filas para auditar renglón por
 * renglón, Enter abre el detalle y Esc quita el resaltado. Aplica a TODA
 * `DataTable` y a las dos tablas de resumen auditables del reparto
 * (`profit-sharing/desglose-section.tsx` y `movimientos-cuenta.tsx`). El
 * cableado DOM vive en `hooks/use-filas-activas.ts`; aquí, lo que se prueba
 * sin navegador: qué hace cada tecla según dónde está el foco, el índice
 * siguiente, la fila de entrada del Tab, los atributos de cada fila, qué
 * enlace abre Enter y el scroll necesario.
 *
 * DECISIÓN ARIA: la tabla sigue siendo una <table> NATIVA. Cada <tr> de datos
 * lleva `tabindex` ROVING (exactamente UNA fila por tabla con 0: la activa si
 * está pintada, si no la primera; −1 el resto) y la activa lleva
 * `aria-selected="true"`; las demás NO llevan `aria-selected`. NO se usa
 * `role="grid"`: un grid exige navegación POR CELDA (←/→ entre celdas, un
 * solo tab stop, `gridcell`), quita el «modo tabla» de NVDA/VoiceOver y rompe
 * «los <Link> de cada celda siguen siendo navegables como hoy»; además el
 * atajo ←/→ del detalle de cotización (`direccionDeTecla`) ignora
 * grid/gridcell y aquí ←/→ no significan nada. Plan B en `atributosFila`.
 *
 * CASCADA del resaltado: `hover:bg-muted/50` (TableRow) y `hover:bg-muted/40`
 * (filas con href) compilan a `.x:hover` con especificidad (0,2,0) y le
 * ganarían a cualquier `bg-accent` (0,1,0) al pasar el mouse, y los fondos de
 * `rowClassName` viven en @layer utilities; por eso la regla de la fila activa
 * va en `globals.css` FUERA de las capas (`[data-filas-activas] >
 * tr[data-fila-activa]`), que gana a todo lo que está en capas sin pelear por
 * especificidad. Aquí solo se definen los atributos que esa regla lee.
 */
import { desplazamientoParaVer } from "./desplazamiento-visible";
import type { TeclaPulsada } from "./quote-navegacion";

/** Gancho del <tbody> (CSS y pruebas). Sin rol. */
export const ATRIBUTO_CUERPO_FILAS = "data-filas-activas";
/** Clave de la fila (la `rowKey` de la tabla). Solo en los <tr> navegables. */
export const ATRIBUTO_FILA = "data-fila";
/** Marca de la fila activa (la regla CSS la pinta). */
export const ATRIBUTO_FILA_ACTIVA = "data-fila-activa";
/** El href que abre Enter: lo ÚNICO que Enter abre. */
export const ATRIBUTO_FILA_HREF = "data-fila-href";
/** Renglón pegado NO navegable (se resalta por hermandad con el CSS). */
export const ATRIBUTO_FILA_HIJA = "data-fila-hija";
export const SELECTOR_FILA = "tr[data-fila]";
/** El contenedor con scroll de `ui/table.tsx`. */
export const SELECTOR_MARCO_TABLA = '[data-slot="table-container"]';
/** Disparadores con flechas propias (el ⋯ de Base UI lleva aria-haspopup="menu"). */
export const SELECTOR_DESPLEGABLE = "[aria-haspopup], [aria-expanded]";
/** Lo que, al hacer clic, NO debe perder el foco a favor de la fila. */
export const SELECTOR_CONTROL =
  'a[href], button, input, select, textarea, [contenteditable=""], [contenteditable="true"], [tabindex]';
/** Etiquetas donde ↑/↓ mueven el cursor o cambian el valor. */
export const ETIQUETAS_CON_FLECHAS_VERTICALES: ReadonlySet<string> = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);
/** Roles ARIA donde ↑/↓ tienen significado propio. */
export const ROLES_CON_FLECHAS_VERTICALES: ReadonlySet<string> = new Set([
  "listbox",
  "option",
  "combobox",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "slider",
  "spinbutton",
  "radio",
  "radiogroup",
  "tab",
  "tablist",
  "tree",
  "treeitem",
  "treegrid",
  "grid",
  "gridcell",
  "textbox",
  "searchbox",
  "scrollbar",
]);

export type AccionFila = "arriba" | "abajo" | "primera" | "ultima" | "abrir" | "soltar";

export interface ContextoTeclaFila {
  /** El foco está EN el <tr> (no en un control de dentro). */
  esFila: boolean;
  /** `tagName` del elemento con el foco. */
  etiqueta: string | null;
  /** `isContentEditable` del elemento con el foco. */
  editable: boolean;
  /** `role` del elemento con el foco o de su contenedor más cercano DENTRO de la fila. */
  rol: string | null;
  /** El foco está en (o dentro de) un disparador `[aria-haspopup]`/`[aria-expanded]`. */
  conDesplegable: boolean;
  /** Hay una fila activa pintada (Esc solo actúa entonces). */
  hayActiva: boolean;
}

/**
 * Qué hace una tecla con el foco dentro de una fila. Modificadores o
 * `defaultPrevented` ⇒ nada. ↑/↓/Home/End mueven la activa salvo en un campo
 * (INPUT/TEXTAREA/SELECT/contenteditable), en un rol con flechas propias o en
 * un desplegable; la autorrepetición SÍ vale (mantener ↓ recorre la tabla).
 * Enter abre SOLO con el foco en el <tr> (en un enlace o botón es el nativo) y
 * sin repetición. Esc suelta SOLO si hay activa y no es un campo (ahí Esc es
 * del campo). ←/→, Espacio, Tab, PageUp/PageDown y lo demás ⇒ `null` (jamás se
 * les hace preventDefault: el atajo ←/→ del detalle de cotización sigue igual).
 */
export function accionDeTeclaFila(t: TeclaPulsada, ctx: ContextoTeclaFila): AccionFila | null {
  if (t.altKey || t.ctrlKey || t.metaKey || t.shiftKey) return null;
  if (t.defaultPrevented) return null;
  const enCampo =
    ctx.editable ||
    (ctx.etiqueta !== null && ETIQUETAS_CON_FLECHAS_VERTICALES.has(ctx.etiqueta.toUpperCase()));
  switch (t.key) {
    case "ArrowUp":
    case "ArrowDown":
    case "Home":
    case "End": {
      if (enCampo) return null;
      if (ctx.rol !== null && ROLES_CON_FLECHAS_VERTICALES.has(ctx.rol)) return null;
      if (ctx.conDesplegable) return null;
      if (t.key === "ArrowUp") return "arriba";
      if (t.key === "ArrowDown") return "abajo";
      return t.key === "Home" ? "primera" : "ultima";
    }
    case "Enter":
      return ctx.esFila && !t.repeat ? "abrir" : null;
    case "Escape":
      return ctx.hayActiva && !enCampo ? "soltar" : null;
    default:
      return null;
  }
}

/**
 * Índice de la fila destino entre las `total` filas VISIBLES (orden DOM). En
 * el borde se queda (NO cambia de página: la paginación escribe la URL y haría
 * desaparecer la fila bajo el dedo). Sin referencia (`actual < 0`): ↓ va a la
 * primera y ↑ a la última. `total <= 0` ⇒ `null`.
 */
export function indiceFilaSiguiente(
  actual: number,
  accion: "arriba" | "abajo" | "primera" | "ultima",
  total: number,
): number | null {
  if (total <= 0) return null;
  if (accion === "primera") return 0;
  if (accion === "ultima") return total - 1;
  if (actual < 0) return accion === "abajo" ? 0 : total - 1;
  const siguiente = accion === "abajo" ? actual + 1 : actual - 1;
  return Math.min(total - 1, Math.max(0, siguiente));
}

/** La fila que recibe el Tab (tabindex 0): la activa si está pintada, si no la primera. */
export function filaDeEntrada(claves: readonly string[], activa: string | null): string | null {
  if (activa !== null && claves.includes(activa)) return activa;
  return claves[0] ?? null;
}

export interface AtributosFila {
  "data-fila": string;
  tabIndex: 0 | -1;
  "data-fila-href"?: string;
  "data-fila-activa"?: "";
  "aria-selected"?: true;
}

/**
 * Atributos de un <tr> navegable. NUNCA `aria-selected: false` (las filas no
 * activas no llevan el atributo) ni `role`. Plan B si VoiceOver/NVDA no
 * anuncian «seleccionado» en una tabla simple: cambiar aquí
 * `"aria-selected": true` por `"aria-current": true` (una línea; el CSS y el
 * hook leen `data-fila-activa`, no el aria).
 */
export function atributosFila(
  clave: string,
  activa: string | null,
  entrada: string | null,
  href?: string | null,
): AtributosFila {
  const a: AtributosFila = { "data-fila": clave, tabIndex: clave === entrada ? 0 : -1 };
  if (href) a["data-fila-href"] = href;
  if (clave === activa) {
    a["data-fila-activa"] = "";
    a["aria-selected"] = true;
  }
  return a;
}

/**
 * Qué enlace de la fila abre Enter: el PRIMERO cuyo `href` es EXACTAMENTE el
 * `data-fila-href` (el mismo clic del mouse: pasa por `useCambiosSinGuardar` y
 * por el <Link> de Next). Sin href o sin coincidencia ⇒ `null`: nunca «el
 * primero» (40 de las 47 tablas no tienen rowHref y sí enlaces sueltos a
 * vuelos o aviones: jamás se navega a algo que no se eligió).
 */
export function indiceEnlaceDeFila(
  hrefs: readonly (string | null)[],
  href: string | null | undefined,
): number | null {
  if (!href) return null;
  const i = hrefs.indexOf(href);
  return i >= 0 ? i : null;
}

/** Medidas del contenedor con scroll de la tabla (las del DOM). */
export interface MarcoScroll {
  scrollTop: number;
  /** `clientHeight` del marco. */
  altoVisible: number;
  /** Alto del <thead> sticky, que tapa el inicio de la zona visible. */
  altoFijoArriba: number;
}

/** Caja de la fila en coordenadas del CONTENIDO del marco. */
export interface CajaFila {
  top: number;
  alto: number;
}

/**
 * El `scrollTop` nuevo del marco para que la fila se vea entera y NO bajo el
 * <thead> sticky, o `null` si ya se ve. Envoltorio de `desplazamientoParaVer`
 * (fuente única con el LibroExcel).
 */
export function scrollParaVerFila(marco: MarcoScroll, fila: CajaFila): number | null {
  return desplazamientoParaVer({
    inicio: fila.top,
    fin: fila.top + fila.alto,
    scroll: marco.scrollTop,
    alto: marco.altoVisible,
    fijoAntes: marco.altoFijoArriba,
  });
}
