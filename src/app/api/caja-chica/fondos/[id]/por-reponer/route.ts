import { type NextRequest } from "next/server";
import {
  TIPO_XLSX,
  errorArchivo,
  esNavegacion,
  esUuid,
  proxyArchivoDelApi,
} from "@/lib/api/pdf-proxy";

/**
 * Excel de lo PENDIENTE por reponer HOY de una caja chica (24-sep-2026):
 * proxy con el JWT de la sesión hacia
 * `GET /v1/caja-chica/fondos/:id/por-reponer.xlsx`. Mismo formato que el de
 * una reposición registrada, para descargarlo ANTES de reponer.
 *
 * Siempre `attachment` con el nombre del API («Por reponer caja
 * <responsable> <hoy>.xlsx»). Errores: JSON para `fetch`, HTML en es-MX para
 * una navegación.
 */

export const dynamic = "force-dynamic";
/** El Excel lo arma pyservices: sin esto Vercel cortaría con 504. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const html = esNavegacion(req);
  if (!esUuid(id)) {
    return errorArchivo("Caja inválida.", "BAD_REQUEST", 400, html, TIPO_XLSX.tituloError);
  }
  return proxyArchivoDelApi({
    tipo: TIPO_XLSX,
    path: `/v1/caja-chica/fondos/${id}/por-reponer.xlsx`,
    method: "GET",
    filename: `Por reponer caja ${id.slice(0, 8)}.xlsx`,
    descargar: true,
    errorMsg: "No se pudo generar el Excel de lo pendiente por reponer.",
    mensajes: {
      403: {
        message: "Solo administración y facturación pueden descargar este Excel.",
        code: "FORBIDDEN",
      },
    },
    html,
  });
}
