import type { ListResponse } from "./aircraft";

export interface Card {
  id: string;
  terminacion: string;
  nombre_titular: string;
  usuario_id: string | null;
  banco: string | null;
  cuenta_bancaria_id: string | null;
  notas: string | null;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export type CardListResponse = ListResponse<Card>;
