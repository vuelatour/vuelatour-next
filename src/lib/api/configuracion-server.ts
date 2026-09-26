import { apiServer } from "./server";
import type { EditoresCotizacionCobrada } from "@/lib/admin/cotizacion-cobrada";

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
