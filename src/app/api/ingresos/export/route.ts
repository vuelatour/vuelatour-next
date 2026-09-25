import { type NextRequest } from "next/server";
import {
  TIPO_XLSX,
  esNavegacion,
  proxyArchivoDelApi,
} from "@/lib/api/pdf-proxy";
import { nombreExportIngresos, parametrosExportDeUrl } from "@/lib/admin/ingresos-ui";
import { todayCancun } from "@/lib/datetime";

/**
 * Excel de INGRESOS (24-sep-2026): proxy con el JWT de la sesión hacia
 * `GET /v1/ingresos/export.xlsx` con los MISMOS filtros de la pantalla. Solo
 * reenvía los parámetros conocidos y válidos (`parametrosExportDeUrl`): el API
 * corre con `forbidNonWhitelisted` y un parámetro de más sería un 400.
 *
 * Siempre `attachment` con el nombre del API («Ingresos <desde> a
 * <hasta>.xlsx»). Errores: JSON para `fetch`, HTML en es-MX para una
 * navegación.
 */

export const dynamic = "force-dynamic";
/** El Excel lo arma pyservices: sin esto Vercel cortaría con 504. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const params = parametrosExportDeUrl(new URL(req.url).searchParams);
  const hoy = todayCancun();
  const desde = params.get("desde") ?? `${hoy.slice(0, 7)}-01`;
  const hasta = params.get("hasta") ?? hoy;
  const qs = params.toString();
  return proxyArchivoDelApi({
    tipo: TIPO_XLSX,
    path: `/v1/ingresos/export.xlsx${qs ? `?${qs}` : ""}`,
    method: "GET",
    filename: nombreExportIngresos(desde, hasta),
    descargar: true,
    errorMsg: "No se pudo generar el Excel de ingresos.",
    mensajes: {
      403: {
        message: "Tu usuario no tiene permiso para descargar los ingresos.",
        code: "FORBIDDEN",
      },
    },
    html: esNavegacion(req),
  });
}
