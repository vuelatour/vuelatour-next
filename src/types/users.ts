import type { ListResponse } from "./aircraft";
import type { EstadoUsuario, Rol } from "./me";

export interface User {
  id: string;
  supabase_auth_id: string | null;
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
}

export type UserListResponse = ListResponse<User>;
