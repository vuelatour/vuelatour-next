import { type NextRequest } from "next/server";
import {
  errorPdf,
  esNavegacion,
  esUuid,
  pidioDescarga,
  proxyPdfDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * PDF único de la cotización de GRUPO: proxy con el JWT de la sesión hacia
 * `POST /v1/grupos/:id/pdf` (API → pyservices, ~30 s). Devuelve el binario
 * `application/pdf` inline con el nombre que manda el API
 * ("cotizacion-grupo-G-n.pdf").
 *
 * Uso desde la UI: `window.open(rutaPdfGrupo(id), "_blank")` o un
 * `<a href target="_blank">` — sin token en el cliente y NUNCA por `blob:`
 * (11-sep-2026: «Descargar» del visor de Chrome re-pide la URL). `POST` es
 * alias (mismo verbo que el API); `?descargar=1` responde `attachment`.
 * Errores: JSON `{ message, code }` para `fetch` y página HTML en es-MX para
 * una navegación (401 sin sesión, 403 sin rol, 404 grupo inexistente, 502
 * pyservices caído).
 */

export const dynamic = "force-dynamic";
/**
 * El render de el PDF del grupo (consolidado + anexo de flota) lo hace pyservices y puede tardar
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
    return errorPdf("Grupo inválido.", "BAD_REQUEST", 400, html);
  }
  return proxyPdfDelApi({
    path: `/v1/grupos/${id}/pdf`,
    method: "POST",
    filename: `cotizacion-grupo-${id.slice(0, 8)}.pdf`,
    descargar: pidioDescarga(req),
    errorMsg: "No se pudo generar el PDF del grupo.",
    mensajes: {
      403: { message: "Tu rol no puede generar el PDF del grupo.", code: "FORBIDDEN" },
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
