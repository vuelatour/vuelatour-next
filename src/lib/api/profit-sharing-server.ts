import { apiServer } from "./server";
import { esErrorDeNext } from "./degradar";
import type { ProfitSharingResult } from "@/types/profit-sharing";
import {
  clasificarFalloCargaPagos,
  esMesValido,
  normalizarRespuestaPagos,
  type RepartoPagosCarga,
} from "@/lib/admin/reparto-pagos";

export interface ProfitSharingQuery {
  desde?: string;
  hasta?: string;
  aeronave_id?: string;
}

export function getProfitSharing(query: ProfitSharingQuery) {
  return apiServer<ProfitSharingResult>("/v1/profit-sharing", {
    searchParams: query as Record<string, string | number | boolean | undefined>,
    cache: "no-store",
  });
}

/**
 * PAGOS A SOCIOS del mes (`GET /v1/profit-sharing/pagos?mes=YYYY-MM`,
 * API 0.0.49). NUNCA lanza (salvo el control de flujo de Next) y distingue:
 *  - `ok` con `disponible:false` ⇒ el servidor aún no tiene la tabla;
 *  - `no-disponible` ⇒ API previo (404 «Cannot GET») o el 503 con
 *    `PAGOS_SOCIOS_NO_DISPONIBLE`;
 *  - `sin-permiso` ⇒ 401/403 (el rol no lee pagos: no se pinta nada);
 *  - `error` ⇒ red, 500, o el 502/503 de un deploy tras los reintentos del
 *    fetcher. La pantalla dice que NO se pudo cargar — jamás «sin pagos».
 */
export async function getRepartoPagos(
  mes: string,
  aeronave_id?: string,
): Promise<RepartoPagosCarga> {
  if (!esMesValido(mes)) return { estado: "error" };
  try {
    const raw = await apiServer<unknown>("/v1/profit-sharing/pagos", {
      searchParams: { mes, aeronave_id },
      cache: "no-store",
    });
    const datos = normalizarRespuestaPagos(raw);
    if (!datos) {
      console.error("[admin] respuesta inesperada de los pagos a socios", raw);
      return { estado: "error" };
    }
    return { estado: "ok", datos };
  } catch (err) {
    if (esErrorDeNext(err)) throw err;
    const e = err as { status?: unknown; code?: unknown } | null;
    const tipo = clasificarFalloCargaPagos(
      typeof e?.status === "number" ? e.status : null,
      typeof e?.code === "string" ? e.code : null,
    );
    if (tipo === "error") console.error("[admin] no se pudieron cargar los pagos a socios", err);
    return { estado: tipo };
  }
}
