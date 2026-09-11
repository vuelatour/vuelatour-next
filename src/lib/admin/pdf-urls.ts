/**
 * FUENTE ÚNICA de las URLs de los PDF del panel (proxies `app/api/**`, con
 * la cookie de sesión: nunca viaja el JWT al cliente).
 *
 * Por qué existen (11-sep-2026): los PDF se abrían con
 * `URL.createObjectURL(blob)` + `window.open`. El visor de Chrome pintaba el
 * documento en una URL `blob:` y, al pulsar «Descargar», volvía a pedir ese
 * blob — ya revocado (o inaccesible desde la pestaña) — y fallaba con «Check
 * internet connection». Con una URL real del proxy el visor descarga sin
 * problema y además existe un botón «Descargar» explícito (`?descargar=1` →
 * `Content-Disposition: attachment`).
 *
 * Helpers PUROS (sin `window`): se prueban con vitest y sirven igual en
 * componentes server que en `<a href>`.
 */

export interface OpcionesPdf {
  /** true = el proxy responde `attachment` (descarga directa). */
  descargar?: boolean;
}

function conDescarga(ruta: string, opts?: OpcionesPdf): string {
  return opts?.descargar ? `${ruta}?descargar=1` : ruta;
}

/** PDF del CLIENTE de una cotización (`POST /v1/quotes/:id/pdf`). */
export function rutaPdfCotizacion(quoteId: string, opts?: OpcionesPdf): string {
  return conDescarga(`/api/quotes/${quoteId}/pdf`, opts);
}

/** PDF INTERNO de la cotización (oficina; nunca se manda al cliente). */
export function rutaPdfInternoCotizacion(quoteId: string, opts?: OpcionesPdf): string {
  return conDescarga(`/api/quotes/${quoteId}/pdf-interno`, opts);
}

/** PDF único de una cotización de GRUPO. */
export function rutaPdfGrupo(grupoId: string, opts?: OpcionesPdf): string {
  return conDescarga(`/api/grupos/${grupoId}/pdf`, opts);
}

/** PDF del reparto a socios de un periodo (días en hora Cancún). */
export function rutaPdfReparto(
  desde: string,
  hasta: string,
  opts?: OpcionesPdf,
): string {
  const qs = new URLSearchParams({ desde, hasta });
  if (opts?.descargar) qs.set("descargar", "1");
  return `/api/profit-sharing/pdf?${qs.toString()}`;
}

/** Recibo de pago (PDF, NO fiscal) de un cobro de vuelo. */
export function rutaReciboCobro(cobroId: string, opts?: OpcionesPdf): string {
  return conDescarga(`/api/flights/cobros/${cobroId}/recibo`, opts);
}

/** Recibo de pago del SOBRE de cobro de un grupo (REC-G). */
export function rutaReciboSobreGrupo(sobreId: string, opts?: OpcionesPdf): string {
  return conDescarga(`/api/grupos/cobros/${sobreId}/recibo`, opts);
}

/**
 * Recibo que le toca a un COBRO de vuelo: si es parte de un SOBRE de grupo,
 * el recibo del cliente es el del sobre completo (REC-G) — el cliente pagó
 * un solo monto —, no el de la parte.
 */
export function rutaReciboDeCobro(
  cobro: { id: string; cobro_grupo?: { id: string } | null },
  opts?: OpcionesPdf,
): string {
  const sobre = cobro.cobro_grupo;
  return sobre ? rutaReciboSobreGrupo(sobre.id, opts) : rutaReciboCobro(cobro.id, opts);
}
