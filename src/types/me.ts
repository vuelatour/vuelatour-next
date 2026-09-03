/**
 * Shape de la respuesta de GET /v1/me en el API. Inferido directamente del
 * service del backend mientras agregamos @ApiResponse decorators que dejen
 * el spec OpenAPI completo. Cuando el spec esté completo, esto se reemplazará
 * por el tipo generado en src/types/api.ts.
 */
export type Rol =
  | "ADMIN"
  | "COORDINADOR"
  | "ANALISTA"
  | "FACTURACION"
  | "PILOTO"
  | "SOCIO"
  | "MECANICO"
  // Visitante de trabajo: SOLO registra gastos desde la app móvil (fondo de
  // caja chica + tarjeta corporativa); cero acceso a vuelos ni al panel.
  | "VISITANTE";

export type EstadoUsuario = "ACTIVO" | "INACTIVO" | "INVITADO";

export interface MeResponse {
  id: string;
  supabase_auth_id: string;
  email: string;
  nombre: string;
  rol: Rol;
  estado: EstadoUsuario;
  tiene_fondo_caja: boolean;
  tarjeta_terminacion: string | null;
  es_piloto_externo: boolean;
  telefono: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /** Dispositivos push del propio usuario (3-sep-2026; ausente = API viejo). */
  push_dispositivos?: number;
}
