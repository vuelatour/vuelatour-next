import { apiServer } from "./server";
import { todayCancun } from "@/lib/datetime";

/** Respuesta de GET /v1/tipo-cambio/oficial. */
export interface TipoCambioOficial {
  fecha: string;
  /** null = sin dato para esa fecha (sin red / sin registro). */
  tc: number | null;
  /** OPEN_ER_API (diario) · ECB_FRANKFURTER (histórico) · BANXICO_FIX (legado). */
  fuente: string | null;
  /** Día real del dato (fin de semana → último publicado antes). */
  fecha_dato?: string | null;
}

/**
 * TC oficial de referencia USD→MXN (open.er-api.com; BCE para fechas pasadas
 * sin registro) vigente para una fecha YYYY-MM-DD (default hoy Cancún).
 * Best-effort: NUNCA lanza — el endpoint puede no tener datos o el rol no
 * tener acceso, y eso no debe bloquear el render de la página que lo usa
 * como sugerencia.
 */
export async function getTipoCambioOficial(fecha?: string): Promise<number | null> {
  try {
    const res = await apiServer<TipoCambioOficial>("/v1/tipo-cambio/oficial", {
      searchParams: { fecha: fecha ?? todayCancun() },
      cache: "no-store",
    });
    const tc = Number(res?.tc);
    return Number.isFinite(tc) && tc > 0 ? tc : null;
  } catch {
    return null;
  }
}
