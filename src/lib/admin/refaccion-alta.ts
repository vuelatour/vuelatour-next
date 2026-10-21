/**
 * REFACCIÓN EN EL ALTA DE GASTO = UN GASTO NORMAL (21-oct-2026, API 0.0.102,
 * invariante 101 del API). Pedido del cliente: «quitar la opción de "¿a
 * dónde va la refacción?" para que las existencias se registren en la
 * sección de inventario cuando llegue pero ya registramos el gasto … y que
 * cuando llegue algo y se dé de alta en el inventario venga una opción para
 * vincular con el gasto previamente registrado».
 *
 * El alta ya NO manda el bloque `inventario` (deprecado en el API). Con
 * avión, la refacción es el gasto indirecto del avión de siempre; sin avión,
 * un gasto de la empresa pendiente de ligar a una compra desde
 * Inventario/Tienda. Esta es la FUENTE ÚNICA (PURA) de la nota que lo dice.
 */

export const NOTA_REFACCION_CON_AVION =
  "Se carga directo al avión (hoja Gastos Indirectos). No pasa por Inventario/Tienda: si la pieza va a la bodega, regístrala desde Inventario/Tienda → Compras y vincula este gasto.";

export const NOTA_REFACCION_SIN_AVION =
  "Sin avión queda como gasto de la empresa. Cuando la pieza llegue a bodega, vincula este gasto desde Inventario/Tienda → Compras («Vincular gasto ya registrado») o desde la entrada del artículo.";

/** La nota bajo la categoría Refacción del alta, según haya avión elegido. */
export function notaRefaccionAlta(p: { conAvion: boolean }): string {
  return p.conAvion ? NOTA_REFACCION_CON_AVION : NOTA_REFACCION_SIN_AVION;
}
