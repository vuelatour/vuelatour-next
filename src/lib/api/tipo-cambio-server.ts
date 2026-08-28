import { apiServer } from "./server";
import { todayCancun } from "@/lib/datetime";

/** Respuesta de GET /v1/tipo-cambio/oficial. */
export interface TipoCambioOficial {
  fecha: string;
  /** null = sin dato para esa fecha (BANXICO_TOKEN vacío, fin de semana sin FIX…). */
  tc: number | null;
  fuente: string | null;
}

/**
 * TC oficial USD→MXN (Banxico FIX) vigente para una fecha YYYY-MM-DD (default
 * hoy Cancún). Best-effort: NUNCA lanza — el endpoint puede no tener datos
 * (BANXICO_TOKEN vacío) o el rol no tener acceso, y eso no debe bloquear el
 * render de la página que lo usa como sugerencia.
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
