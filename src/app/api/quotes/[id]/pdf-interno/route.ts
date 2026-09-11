import { type NextRequest } from "next/server";
import {
  errorPdf,
  esNavegacion,
  esUuid,
  pidioDescarga,
  proxyPdfDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * PDF INTERNO de la cotización (8-sep-2026): una hoja carta para la oficina
 * con comisiones, horas de tacómetro, partición del ingreso, cobros con
 * comisión bancaria y gastos. NUNCA se manda al cliente. Proxy con el JWT de
 * la sesión hacia `POST /v1/quotes/:id/pdf-interno` (API → pyservices,
 * ~30 s); devuelve el binario `application/pdf` inline con el nombre que
 * manda el API ("cotizacion-interna-<folio>.pdf").
 *
 * El API gatea por rol (ADMIN, COORDINADOR, FACTURACION, ANALISTA); el panel
 * solo esconde el botón. Uso desde la UI: `rutaPdfInternoCotizacion(id)`
 * (`lib/admin/pdf-urls.ts`) en `window.open` / `<a href target="_blank">`;
 * `?descargar=1` responde `attachment`. Jamás por `blob:` (11-sep-2026: el
 * botón «Descargar» del visor de Chrome vuelve a pedir la URL y el blob ya no
 * existe). Errores: JSON `{ message, code }` para `fetch` y página HTML en
 * es-MX para una navegación (401 sin sesión, 403 sin rol, 404 cotización
 * inexistente, 502 pyservices caído).
 */

export const dynamic = "force-dynamic";
/**
 * El render de el PDF interno lo hace pyservices y puede tardar
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
    path: `/v1/quotes/${id}/pdf-interno`,
    method: "POST",
    filename: `cotizacion-interna-${id.slice(0, 8)}.pdf`,
    descargar: pidioDescarga(req),
    errorMsg: "No se pudo generar el PDF interno de la cotización.",
    mensajes: {
      403: { message: "Tu rol no puede generar el PDF interno.", code: "FORBIDDEN" },
    },
    html,
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handler(req, ctx);
}
