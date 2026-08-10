import { apiServer } from "./server";

export interface ConfiguracionFlag {
  clave: string;
  activa: boolean;
  descripcion: string;
  updated_at: string;
}

export function getConfiguracion() {
  return apiServer<ConfiguracionFlag[]>("/v1/config", { cache: "no-store" });
}
