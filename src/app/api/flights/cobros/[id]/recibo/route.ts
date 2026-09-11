import { type NextRequest } from "next/server";
import {
  errorPdf,
  esNavegacion,
  esUuid,
  pidioDescarga,
  proxyPdfDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * Recibo de pago (PDF, NO fiscal) de un COBRO de vuelo: proxy con el JWT de
 * la sesión hacia `GET /v1/flights/cobros/:id/recibo.pdf` (API → pyservices).
 * Espejo de `/api/grupos/cobros/[id]/recibo` (el del SOBRE de grupo).
 *
 * Se sirve `inline` para que la pestaña MUESTRE el recibo antes de mandarlo
 * al cliente; `?descargar=1` lo baja como archivo. Nunca por `blob:`: el
 * botón «Descargar» del visor de Chrome vuelve a pedir la URL (11-sep-2026).
 *
 * Errores: JSON `{ message, code }` para `fetch` y página HTML en es-MX para
 * una navegación (401 sin sesión, 403 sin rol, 404 cobro inexistente, 409
 * cobro negativo = reembolso sin recibo, 502 pyservices caído).
 */

export const dynamic = "force-dynamic";
/**
 * El render de el recibo de pago lo hace pyservices y puede tardar
 * DECENAS de segundos. Antes el navegador hablaba directo con el API y no
 * había límite; ahora pasa por esta función, así que sin `maxDuration` se
 * cortaría con un 504 (y el operador vería «no se pudo abrir el PDF» en
 * vez del documento). 60 s es el tope que admiten todos los planes de
 * Vercel; si algún día no alcanza, se sube aquí, no en el cliente.
 */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const html = esNavegacion(req);
  if (!esUuid(id)) {
    return errorPdf("Cobro inválido.", "BAD_REQUEST", 400, html);
  }
  return proxyPdfDelApi({
    path: `/v1/flights/cobros/${id}/recibo.pdf`,
    method: "GET",
    filename: `recibo-${id.slice(0, 8)}.pdf`,
    descargar: pidioDescarga(req),
    errorMsg: "No se pudo generar el recibo del cobro.",
    mensajes: {
      403: { message: "Tu rol no puede generar recibos de cobro.", code: "FORBIDDEN" },
      409: {
        message: "Un reembolso no tiene recibo de pago.",
        code: "COBRO_NEGATIVO",
      },
    },
    html,
  });
}
