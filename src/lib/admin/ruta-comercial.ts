/**
 * Ruta COMPLETA recorriendo los tramos, para vistas INTERNAS del panel
 * (encabezados de detalle de cotización/vuelo).
 *
 * Mismo walk tolerante a huecos que `puntosRutaVisible` del API (fuente del
 * PDF), pero SIN el filtro `pdf_oculto`: la vista interna muestra TODO. El
 * hueco aparece cuando el filtrado aguas arriba quita un tramo intermedio
 * (p. ej. cancelado): el origen del siguiente tramo entra como punto propio
 * en lugar de desaparecer.
 *
 * Reglas del walk: el origen entra solo cuando difiere del último punto
 * pintado; el destino entra SIEMPRE (un sobrevuelo CUN→CUN se pinta
 * "CUN → CUN"). Presentación pura: no toca precios ni totales.
 */
export function puntosRuta(
  legs: ReadonlyArray<{ origen?: unknown; destino?: unknown }>,
): string[] {
  const puntos: string[] = [];
  for (const l of legs) {
    const o = typeof l.origen === "string" ? l.origen.trim() : "";
    const d = typeof l.destino === "string" ? l.destino.trim() : "";
    if (o && o !== puntos[puntos.length - 1]) puntos.push(o);
    if (d) puntos.push(d);
  }
  return puntos;
}
