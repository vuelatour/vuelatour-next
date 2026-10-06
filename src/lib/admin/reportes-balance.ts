/**
 * Card «Balance mensual y balance general» de `/admin/reportes` — FUENTE
 * ÚNICA de su título, sus líneas, sus botones, el nombre del archivo y los
 * parámetros (6-oct-2026, API 0.0.64). PURO (sin React ni red): lo pinta
 * `app/admin/reportes/page.tsx`.
 *
 * Pedido del cliente: «Aquí me pueden poner otro botón para bajar el balance
 * general; el que ya tenemos que se renombre a "Balance mensual" y el nuevo
 * botón sea el "Balance general"». El MENSUAL es el libro de siempre, sin un
 * solo cambio. El GENERAL es el mismo libro con la hoja de vuelos («reporte
 * horas FLOTA») resumida a COSTO TOTAL y COSTO POR HORA, con la fórmula que
 * confirmó el cliente: «es el total de todos los gastos, entre el tiempo
 * volado, entre el tipo de cambio del día, entre 1.16 (para sacar subtotal)».
 *
 * Los dos salen de la MISMA ruta del API; el libro lo elige `modo`
 * (`mensual` | `general`). Sin `modo` el API entrega el mensual y con otro
 * valor responde 400. Los números son los del API: el panel no calcula nada.
 */

/** Libro que se pide al API en `?modo=`. */
export type ModoBalanceVuelaTour = "mensual" | "general";

/**
 * Orden de los botones en la card y valores que acepta el API en `modo`
 * (cualquier otro ⇒ 400).
 */
export const MODOS_BALANCE_VUELATOUR: ReadonlyArray<ModoBalanceVuelaTour> = [
  "mensual",
  "general",
];

/** Ruta ÚNICA de los dos libros (`GET`); el `modo` decide cuál se arma. */
export const RUTA_BALANCE_VUELATOUR = "/v1/aircraft/balance-general.xlsx";

/** Título de la card (antes «Balance general VuelaTour»). */
export const TITULO_CARD_BALANCE_VUELATOUR = "Balance mensual y balance general";

/**
 * Línea común bajo las de cada libro: el periodo es el de la página y el libro
 * de UN avión vive en otra card (Ale y Pablo confundían ambos, 2-sep-2026).
 */
export const NOTA_BALANCE_VUELATOUR =
  "Los dos consolidan toda la flota en el periodo elegido arriba; el libro de un solo avión se descarga en «Balance por avión».";

interface TextosLibroBalance {
  /** Nombre del libro tal como lo dice el cliente. */
  nombre: string;
  /** Qué trae, en una línea (sin el nombre). */
  detalle: string;
  /** Texto del botón de descarga. */
  etiqueta: string;
}

const TEXTOS_LIBRO: Record<ModoBalanceVuelaTour, TextosLibroBalance> = {
  mensual: {
    nombre: "Balance mensual",
    detalle:
      "el libro completo de siempre — resumen por avión, hoja de vuelos (reporte de horas) con el desglose de operación, piloto, otros y permiso AFAC, otros movimientos, cobranza, otros gastos de la empresa, repartidos a aviones, inventario de bodega, balance por avión con sus socios y pendientes de captura.",
    etiqueta: "Descargar balance mensual (Excel)",
  },
  general: {
    nombre: "Balance general",
    detalle:
      "el mismo libro con la hoja de vuelos resumida a costo total y costo por hora (sin desglose de operación/piloto/AFAC). Costo por hora = costo total ÷ tiempo volado ÷ tipo de cambio ÷ 1.16 (dólares sin IVA).",
    etiqueta: "Descargar balance general (Excel)",
  },
};

/** Todo lo que la card necesita para pintar la línea y el botón de un libro. */
export interface LibroBalanceVuelaTour extends TextosLibroBalance {
  modo: ModoBalanceVuelaTour;
  /** Ruta del API (la misma para los dos libros). */
  path: string;
  /** Nombre con el que se guarda el archivo descargado. */
  filename: string;
  /** Parámetros del `GET` (el periodo de la página + el libro). */
  query: { desde: string; hasta: string; modo: ModoBalanceVuelaTour };
}

/**
 * Archivo descargado: `balance-mensual-vuelatour-<desde>-a-<hasta>.xlsx` o
 * `balance-general-vuelatour-<desde>-a-<hasta>.xlsx` (fechas `YYYY-MM-DD`),
 * el mismo nombre que pone el API en `Content-Disposition`. Antes del 0.0.64
 * el único libro bajaba como `balance-general-vuelatour-…`: ese libro hoy es
 * el MENSUAL y el nombre «general» queda para el de costo por hora.
 */
export function archivoBalanceVuelaTour(
  modo: ModoBalanceVuelaTour,
  desde: string,
  hasta: string,
): string {
  return `balance-${modo}-vuelatour-${desde}-a-${hasta}.xlsx`;
}

/** Línea de la descripción de un libro: «Balance general: el mismo libro…». */
export function lineaDescripcionBalance(
  libro: Pick<LibroBalanceVuelaTour, "nombre" | "detalle">,
): string {
  return `${libro.nombre}: ${libro.detalle}`;
}

/**
 * Los dos libros de la card, en el orden de los botones (mensual, general),
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
