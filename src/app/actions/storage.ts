"use server";

import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { esBucketFirmable, esPathFirmable, TOPE_PATHS_FIRMA } from "@/lib/admin/foto-firmada";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Respuesta de `POST /v1/storage/firmar` (API 0.0.48). */
interface FirmarResponse {
  urls?: Record<string, string> | null;
  expira_en_s?: number | null;
}

/**
 * URLs FIRMADAS NUEVAS de un bucket privado (1-oct-2026): la miniatura o el
 * visor de una foto cuya URL venció (la oficina deja la pestaña abierta más
 * de lo que dura la firma) pide otra aquí. Las imágenes NO pasan por Vercel:
 * esto solo devuelve URLs directas a Supabase (Active CPU limitado).
 *
 * Nunca lanza: un API viejo (404), un rol sin permiso (403) o un bucket fuera
 * de la lista blanca devuelven `{ok:false}` y la foto queda en su
 * placeholder con «Reintentar».
 */
export async function refrescarUrlsFirmadasAction(input: {
  bucket: string;
  paths: string[];
}): Promise<ActionResult<{ urls: Record<string, string>; expiraEnS: number | null }>> {
  const bucket = input?.bucket;
  if (!esBucketFirmable(bucket)) return { ok: false, error: "Archivo no disponible." };
  // Un path que el API rechazaría (URL completa, «/» inicial, «..»…) NO se
  // manda: el 400 `PATH_INVALIDO` tumbaría el lote ENTERO y todas las fotos
  // que se renovaron junto con él quedarían en placeholder. Ese path
  // simplemente no recibe URL.
  const paths = [
    ...new Set((Array.isArray(input?.paths) ? input.paths : []).filter(esPathFirmable)),
  ];
  if (paths.length === 0) return { ok: true, data: { urls: {}, expiraEnS: null } };
  if (paths.length > TOPE_PATHS_FIRMA) {
    return { ok: false, error: `Máximo ${TOPE_PATHS_FIRMA} archivos por llamada.` };
  }
  try {
    const res = await apiServer<FirmarResponse>("/v1/storage/firmar", {
      method: "POST",
      body: { bucket, paths },
      cache: "no-store",
    });
    return {
      ok: true,
      data: { urls: res?.urls ?? {}, expiraEnS: res?.expira_en_s ?? null },
    };
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      return { ok: false, error: "El servidor todavía no renueva los enlaces de las fotos." };
    }
    if (isApiError(err)) return { ok: false, error: err.message };
    return { ok: false, error: "No se pudo renovar el enlace de la foto." };
  }
}
