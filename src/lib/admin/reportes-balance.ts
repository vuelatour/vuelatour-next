/**
 * Card «Balance mensual» de `/admin/reportes` — FUENTE ÚNICA de su título,
 * sus líneas, sus botones, el nombre del archivo y los parámetros
 * (6-oct-2026, API 0.0.64). PURO (sin React ni red): lo pinta
 * `app/admin/reportes/page.tsx`.
 *
 * Historia: el 6-oct-2026 el cliente pidió «otro botón para bajar el balance
 * general; el que ya tenemos que se renombre a "Balance mensual"». El
 * 23-oct-2026 pidió lo contrario: «eliminar porfis esta opción de balance
 * general (este era un balance abreviado en donde no aparecían los costos
 * individuales de cada vuelo) pero ya no se necesita». Desde entonces la card
 * ofrece SOLO el mensual (el libro de siempre, sin un solo cambio). El API
 * sigue aceptando `modo=general` (no se tocó): el panel simplemente ya no lo
 * ofrece y la vista en pantalla redirige `?modo=general` al mensual.
 *
 * «Balance general VuelaTour» sigue existiendo como NOMBRE DE LIBRO/CONCEPTO
 * (etiquetas de categorías, Dinero, ingresos, cotizaciones): eso no cambia.
 */

/** Libros que el API acepta en `?modo=` (cualquier otro ⇒ 400). */
export type ModoBalanceVuelaTour = "mensual" | "general";

/** Libro que el panel OFRECE (desde el 23-oct-2026, solo el mensual). */
export type ModoBalanceOfrecido = "mensual";

/** Los libros que se ofrecen en la card (y en la vista), en orden. */
export const MODOS_BALANCE_VUELATOUR: ReadonlyArray<ModoBalanceOfrecido> = ["mensual"];

/** El libro que se RETIRÓ del panel (23-oct-2026): si llega en la URL, se redirige al mensual. */
export const MODO_BALANCE_RETIRADO: ModoBalanceVuelaTour = "general";

/** ¿Este valor de la URL (`?modo=` o `?tipo=`) pide el libro retirado? */
export function esModoBalanceRetirado(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.trim().toLowerCase() === MODO_BALANCE_RETIRADO;
}

/** Ruta ÚNICA del libro (`GET`); el `modo` decide cuál se arma. */
export const RUTA_BALANCE_VUELATOUR = "/v1/aircraft/balance-general.xlsx";

/** Título de la card (antes «Balance mensual y balance general»; antes «Balance general VuelaTour»). */
export const TITULO_CARD_BALANCE_VUELATOUR = "Balance mensual";

/**
 * Línea bajo el título: el periodo es el de la página y el libro de UN avión
 * vive en otra card (Ale y Pablo confundían ambos, 2-sep-2026).
 */
export const NOTA_BALANCE_VUELATOUR =
  "Consolida toda la flota en el periodo elegido arriba; el libro de un solo avión se descarga en «Balance por avión».";

/**
 * Título del plegable (`TextoPlegable`) que guarda las descripciones LARGAS de
 * los libros bajo el hero de balances (12-oct-2026). Cerrado por defecto; las
 * líneas siguen en el DOM.
 */
export const TITULO_DETALLE_LIBROS = "¿Qué trae cada libro?";

interface TextosLibroBalance {
  /** Nombre del libro tal como lo dice el cliente. */
  nombre: string;
  /**
   * Una línea CORTA para el tile del libro en `/admin/reportes` (12-oct-2026:
   * los balances al frente). La larga (`detalle`) vive plegada debajo.
   */
  resumen: string;
  /** Qué trae, en una línea (sin el nombre). */
  detalle: string;
  /** Texto del botón de descarga. */
  etiqueta: string;
}

const TEXTOS_LIBRO: Record<ModoBalanceOfrecido, TextosLibroBalance> = {
  mensual: {
    nombre: "Balance mensual",
    resumen:
      "El libro de siempre: resumen por avión, vuelos con desglose, cobranza, gastos, bodega y socios.",
    detalle:
      "el libro completo de siempre — resumen por avión, hoja de vuelos (reporte de horas) con el desglose de operación, piloto, otros y permiso AFAC, otros movimientos, cobranza, otros gastos de la empresa, repartidos a aviones, inventario de bodega, balance por avión con sus socios y pendientes de captura.",
    etiqueta: "Descargar balance mensual (Excel)",
  },
};

/** Todo lo que la card necesita para pintar la línea y el botón de un libro. */
export interface LibroBalanceVuelaTour extends TextosLibroBalance {
  modo: ModoBalanceOfrecido;
  /** Ruta del API. */
  path: string;
  /** Nombre con el que se guarda el archivo descargado. */
  filename: string;
  /** Parámetros del `GET` (el periodo de la página + el libro). */
  query: { desde: string; hasta: string; modo: ModoBalanceOfrecido };
}

/**
 * Archivo descargado: `balance-mensual-vuelatour-<desde>-a-<hasta>.xlsx`
 * (fechas `YYYY-MM-DD`), el mismo nombre que pone el API en
 * `Content-Disposition`. Antes del 0.0.64 el único libro bajaba como
 * `balance-general-vuelatour-…`: ese libro es el MENSUAL de hoy.
 */
export function archivoBalanceVuelaTour(
  modo: ModoBalanceVuelaTour,
  desde: string,
  hasta: string,
): string {
  return `balance-${modo}-vuelatour-${desde}-a-${hasta}.xlsx`;
}

/** Línea de la descripción de un libro: «Balance mensual: el libro completo…». */
export function lineaDescripcionBalance(
  libro: Pick<LibroBalanceVuelaTour, "nombre" | "detalle">,
): string {
  return `${libro.nombre}: ${libro.detalle}`;
}

/**
 * Los libros de la card, en el orden de los botones (hoy solo el mensual),
 * para el periodo YA validado de la página.
 */
export function librosBalanceVuelaTour(
  desde: string,
  hasta: string,
): LibroBalanceVuelaTour[] {
  return MODOS_BALANCE_VUELATOUR.map((modo) => ({
    modo,
    ...TEXTOS_LIBRO[modo],
    path: RUTA_BALANCE_VUELATOUR,
    filename: archivoBalanceVuelaTour(modo, desde, hasta),
    query: { desde, hasta, modo },
  }));
}
