import type { ListResponse } from "./aircraft";
import type { EstadoUsuario, Rol } from "./me";

export interface User {
  id: string;
  supabase_auth_id: string | null;
  /** Null en pilotos externos sin correo de contacto. */
  email: string | null;
  nombre: string;
  rol: Rol;
  estado: EstadoUsuario;
  tiene_fondo_caja: boolean;
  tarjeta_terminacion: string | null;
  /** También vuela (doble rol): entra a selectores de piloto y horas. */
  es_piloto: boolean;
  es_piloto_externo: boolean;
  telefono: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Dispositivos con token push registrados (3-sep-2026). 0 = no recibe
   * avisos (eventos, vuelos): oficina debe avisarle por otro medio. Ausente
   * con API viejo — nunca inventar un 0.
   */
  push_dispositivos?: number;
}

export type UserListResponse = ListResponse<User>;
