import { cache } from "react";
import { apiServer } from "./server";
import { esErrorDeNext } from "./degradar";
import {
  clasificarFalloCierres,
  normalizarCierres,
  normalizarPrevia,
  type EstadoCargaCierres,
} from "@/lib/admin/cierre-mes";
import type { CierresRespuesta, PreviaCierre } from "@/types/cierres";

/**
 * CIERRE DE MES (16-oct-2026, API 0.0.88). Lecturas que NUNCA lanzan (salvo
 * el control de flujo de Next) y distinguen cada fallo: `api-previo` (404
 * «Cannot GET» del API 0.0.87), `sin-migracion` (503 `CIERRE_NO_DISPONIBLE`
 * o `disponible:false`), `sin-permiso` (401/403) y `error` (red, 500, 502 tras
 * los reintentos). La card dice lo que pasó; jamás pinta «Abierto» cuando no
 * pudo leer.
 */
export type CargaCierres<T> = { estado: "ok"; datos: T } | { estado: Exclude<EstadoCargaCierres, "ok"> };

function fallo<T>(err: unknown, que: string): CargaCierres<T> {
  if (esErrorDeNext(err)) throw err;
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const estado = clasificarFalloCierres(
    typeof e?.status === "number" ? e.status : null,
    typeof e?.code === "string" ? e.code : null,
    typeof e?.message === "string" ? e.message : null,
  );
  if (estado === "error") console.error(`[admin] no se pudo cargar ${que}`, err);
  return { estado: estado as Exclude<EstadoCargaCierres, "ok"> };
}

/** `GET /v1/cierres`: estado por mes. `react.cache`: una sola lectura por petición. */
export const getCierres = cache(async (): Promise<CargaCierres<CierresRespuesta>> => {
  try {
    const raw = await apiServer<unknown>("/v1/cierres", { cache: "no-store" });
    const datos = normalizarCierres(raw);
    if (!datos) {
      console.error("[admin] respuesta inesperada de /v1/cierres", raw);
      return { estado: "error" };
    }
    return datos.disponible ? { estado: "ok", datos } : { estado: "sin-migracion" };
  } catch (err) {
    return fallo(err, "el estado del cierre de mes");
  }
});

/**
 * `GET /v1/cierres/:periodo/previa`: qué pasaría al cerrar (lectura pesada).
 * CIERRE POR AVIÓN (23-oct-2026, API 0.0.104): con `aeronaveId` la previa es
 * la de ESE avión (`?aeronave_id=<uuid>`); sin él, la de toda la flota
 * abierta. Quien llama ya validó el uuid (jamás se manda basura).
 */
export async function getPreviaCierre(
  periodo: string,
  incluir: string[] = [],
  aeronaveId: string | null = null,
): Promise<CargaCierres<PreviaCierre>> {
  try {
    // INCLUIR EN EL MES (21-oct-2026): la previa se recalcula con los vuelos
    // que la oficina marcó para quedarse (`?incluir=id,id`).
    const partes = [
      ...(aeronaveId ? [`aeronave_id=${encodeURIComponent(aeronaveId)}`] : []),
      ...(incluir.length > 0 ? [`incluir=${encodeURIComponent(incluir.join(","))}`] : []),
    ];
    const q = partes.length > 0 ? `?${partes.join("&")}` : "";
    const raw = await apiServer<unknown>(`/v1/cierres/${periodo}/previa${q}`, { cache: "no-store" });
    const datos = normalizarPrevia(raw);
    if (!datos) {
      if (raw && typeof raw === "object" && (raw as { disponible?: unknown }).disponible === false) {
        return { estado: "sin-migracion" };
      }
      console.error("[admin] respuesta inesperada de la previa del cierre", raw);
      return { estado: "error" };
    }
    return { estado: "ok", datos };
  } catch (err) {
    return fallo(err, "la previa del cierre de mes");
  }
}
