export type UserRole = "ADMIN" | "COORDINADOR" | "ANALISTA" | "FACTURACION" | "PILOTO" | "SOCIO";
export type UserEstado = "ACTIVO" | "INACTIVO" | "INVITADO";

export interface MeResponse {
  id: string;
  supabase_auth_id: string;
  email: string;
  nombre: string;
  rol: UserRole;
  estado: UserEstado;
  tiene_fondo_caja: boolean;
  tarjeta_terminacion: string | null;
  es_piloto_externo: boolean;
  telefono: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
