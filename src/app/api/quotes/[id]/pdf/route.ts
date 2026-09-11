import { type NextRequest } from "next/server";
import {
  errorPdf,
  esNavegacion,
  esUuid,
  pidioDescarga,
  proxyPdfDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * PDF del CLIENTE de una cotización: proxy con el JWT de la sesión hacia
 * `POST /v1/quotes/:id/pdf` (API → pyservices/WeasyPrint). Devuelve el
 * binario `application/pdf` con el nombre que manda el API
 * ("cotizacion-<folio>.pdf").
 *
 * Por qué existe (11-sep-2026): el panel lo abría con
 * `URL.createObjectURL(blob)` + `window.open`; el visor de Chrome lo pintaba
 * en una URL `blob:` y su botón «Descargar» fallaba con «Check internet
 * connection» al volver a pedir el blob. Ahora la pestaña abre ESTA URL
 * (`inline`, con `Content-Length`) y el botón «Descargar» del panel usa
 * `?descargar=1` (`attachment`).
 *
 * Uso desde la UI: `rutaPdfCotizacion(id)` (`lib/admin/pdf-urls.ts`).
 * Errores: JSON `{ message, code }` para `fetch` y una página HTML en es-MX
 * para una navegación (401 sin sesión, 403 sin rol, 404 cotización
 * inexistente, 502 pyservices caído).
 */

export const dynamic = "force-dynamic";
/**
 * El render de el PDF del cliente (WeasyPrint + fichas de aeronave) lo hace pyservices y puede tardar
 * DECENAS de segundos. Antes el navegador hablaba directo con el API y no
 * había límite; ahora pasa por esta función, así que sin `maxDuration` se
 * cortaría con un 504 (y el operador vería «no se pudo abrir el PDF» en
 * vez del documento). 60 s es el tope que admiten todos los planes de
 * Vercel; si algún día no alcanza, se sube aquí, no en el cliente.
 */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const html = esNavegacion(req);
  if (!esUuid(id)) {
    return errorPdf("Cotización inválida.", "BAD_REQUEST", 400, html);
  }
  return proxyPdfDelApi({
    path: `/v1/quotes/${id}/pdf`,
    method: "POST",
    filename: `cotizacion-${id.slice(0, 8)}.pdf`,
    descargar: pidioDescarga(req),
    errorMsg: "No se pudo generar el PDF de la cotización.",
    mensajes: {
      403: { message: "Tu rol no puede generar el PDF de la cotización.", code: "FORBIDDEN" },
    },
    html,
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(req, ctx);
}

/** Alias POST: mismo verbo que el API, para un `fetch` desde la UI. */
export async function POST(req: NextRequest, ctx: Ctx) {
  return handler(req, ctx);
}
