import { apiServer } from "./server";
import { isApiError } from "./errors";
import { esErrorDeNext } from "./degradar";
import type { EditoresCotizacionCobrada } from "@/lib/admin/cotizacion-cobrada";
import type { LecturaModeloIa, ModeloIa } from "@/types/ia-modelo";

export interface ConfiguracionFlag {
  clave: string;
  activa: boolean;
  descripcion: string;
  updated_at: string;
  /**
   * Valor numérico opcional de la bandera (p. ej. días de la ventana de
   * edición de gastos de campo). null/ausente = bandera puramente booleana.
   * Opcional porque un API previo a la migración no manda el campo.
   */
  valor_numerico?: number | null;
}

export function getConfiguracion() {
  return apiServer<ConfiguracionFlag[]>("/v1/config", { cache: "no-store" });
}

/**
 * EDITAN COTIZACIONES COBRADAS (26-sep-2026, API 0.0.37): lista POR PERSONA
 * de quién puede editar una cotización que ya tiene cobros. Oficina la lee
 * (la razón del candado nombra a quién pedírselo); solo un miembro de la
 * lista la cambia. 404 = API previo.
 */
export function getEditoresCotizacionCobrada() {
  return apiServer<EditoresCotizacionCobrada>("/v1/config/editores-cotizacion-cobrada", {
    cache: "no-store",
  });
}

/**
 * MODELO DE IA (2-oct-2026, API 0.0.51): `GET /v1/config/ia-modelo` (ADMIN).
 * ACCESORIA y NUNCA lanza (salvo el control de flujo de Next):
 *  - 404 ⇒ `no-disponible` (API previo: la tarjeta no se monta);
 *  - 401/403 ⇒ `no-disponible` (sin permiso: recargar no lo arregla);
 *  - red / 5xx / respuesta sin forma ⇒ `fallo` (la tarjeta lo DICE; jamás se
 *    esconde como si el API fuera previo).
 */
export async function getModeloIa(): Promise<LecturaModeloIa> {
  try {
    const datos = await apiServer<ModeloIa>("/v1/config/ia-modelo", { cache: "no-store" });
    if (!datos || typeof datos !== "object" || !("configurado" in datos)) {
      console.error("[admin] respuesta inesperada de /v1/config/ia-modelo", datos);
      return { estado: "fallo" };
    }
    return { estado: "ok", datos };
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    if (isApiError(e) && (e.status === 404 || e.status === 401 || e.status === 403)) {
      return { estado: "no-disponible" };
    }
    console.error("[admin] no se pudo cargar el modelo de IA", e);
    return { estado: "fallo" };
  }
}
