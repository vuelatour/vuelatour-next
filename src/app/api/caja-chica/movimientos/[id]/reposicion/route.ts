import { type NextRequest } from "next/server";
import {
  TIPO_XLSX,
  errorArchivo,
  esNavegacion,
  esUuid,
  proxyArchivoDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * Excel de lo que repuso UNA reposición de caja chica (24-sep-2026): proxy
 * con el JWT de la sesión hacia
 * `GET /v1/caja-chica/movimientos/:id/reposicion.xlsx` (API → pyservices).
 * Pedido del cliente: «al momento de reembolsar la caja de cada uno, me puede
 * arrojar un Excel descargable con la información de lo que estoy
 * reembolsando».
 *
 * Siempre `attachment` y conserva el nombre que manda el API («Reposicion
 * caja <responsable> <fecha>.xlsx»). Errores: JSON `{ message, code }` para
 * `fetch` y página HTML en es-MX para una navegación (401 sin sesión, 403 sin
 * rol, 404 movimiento inexistente, 409 MOVIMIENTO_NO_ES_REPOSICION, 502/503
 * pyservices).
 */

export const dynamic = "force-dynamic";
/** El Excel lo arma pyservices: sin esto Vercel cortaría con 504. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const html = esNavegacion(req);
  if (!esUuid(id)) {
    return errorArchivo("Movimiento inválido.", "BAD_REQUEST", 400, html, TIPO_XLSX.tituloError);
  }
  return proxyArchivoDelApi({
    tipo: TIPO_XLSX,
    path: `/v1/caja-chica/movimientos/${id}/reposicion.xlsx`,
    method: "GET",
    filename: `Reposicion caja ${id.slice(0, 8)}.xlsx`,
    descargar: true,
    errorMsg: "No se pudo generar el Excel de la reposición.",
    mensajes: {
      403: {
        message: "Solo administración y facturación pueden descargar este Excel.",
        code: "FORBIDDEN",
      },
    },
    html,
  });
}
