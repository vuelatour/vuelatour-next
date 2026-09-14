/**
 * Etiqueta del badge de la columna «Comp.» (Gastos y detalle del vuelo).
 *
 * Pedido del cliente (14-sep-2026): quitar la palabra «Factura» de esa
 * columna — se confundía con el semáforo «Facturada / Pendiente» de la
 * columna vecina («¿ya lo facturé?»). Con una factura como comprobante la
 * MINIATURA ya lo dice: no se pinta ningún badge. Solo se etiqueta lo que
 * sí aporta información: «Vale» (no es factura) y «Sin comp.» (no entregó
 * nada). Fuente única de las dos tablas.
 */
export function etiquetaComprobante(estatus: string | null | undefined): string | null {
  switch (estatus) {
    case "SIN_COMPROBANTE":
      return "Sin comp.";
    case "VALE":
      return "Vale";
    default:
      return null;
  }
}
