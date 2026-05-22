export interface AppNotification {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  data: Record<string, unknown>;
  link: string | null;
  leida: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NotificationListResponse {
  data: AppNotification[];
  count: number;
  limit: number;
  offset: number;
}
