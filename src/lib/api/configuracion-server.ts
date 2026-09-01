import { apiServer } from "./server";

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
