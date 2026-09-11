import { type NextRequest } from "next/server";
import {
  errorPdf,
  esNavegacion,
  pidioDescarga,
  proxyPdfDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * PDF del REPARTO a socios (`GET /v1/profit-sharing/pdf?desde&hasta`): proxy
 * con el JWT de la sesión. Mismo patrón que los PDF de cotización — se abre
 * por URL real, nunca desde un `blob:` (11-sep-2026: el botón «Descargar»
 * del visor de Chrome vuelve a pedir la URL y con un blob falla con «Check
 * internet connection»).
 *
 * `desde`/`hasta` son días en hora Cancún (YYYY-MM-DD), los mismos que la
 * página de reportes; `?descargar=1` responde `attachment`. El API gatea el
 * rol (ADMIN, ANALISTA, SOCIO).
 */

export const dynamic = "force-dynamic";
/**
 * El render de el PDF del reparto a socios lo hace pyservices y puede tardar
 * DECENAS de segundos. Antes el navegador hablaba directo con el API y no
 * había límite; ahora pasa por esta función, así que sin `maxDuration` se
 * cortaría con un 504 (y el operador vería «no se pudo abrir el PDF» en
 * vez del documento). 60 s es el tope que admiten todos los planes de
 * Vercel; si algún día no alcanza, se sube aquí, no en el cliente.
 */
export const maxDuration = 60;

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const html = esNavegacion(req);
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  if (!DIA_RE.test(desde) || !DIA_RE.test(hasta)) {
    return errorPdf(
      "El periodo del reporte es inválido (se esperaba desde/hasta como AAAA-MM-DD).",
      "BAD_REQUEST",
      400,
      html,
    );
  }
  return proxyPdfDelApi({
    path: `/v1/profit-sharing/pdf?desde=${desde}&hasta=${hasta}`,
    method: "GET",
    filename: `reparto-${desde}-a-${hasta}.pdf`,
    descargar: pidioDescarga(req),
    errorMsg: "No se pudo generar el PDF del reparto.",
    mensajes: {
      403: { message: "Tu rol no puede ver el reparto a socios.", code: "FORBIDDEN" },
    },
    html,
  });
}
