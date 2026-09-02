import { apiServer } from "./server";

/**
 * Consumo de créditos de IA (Anthropic) registrado por pyservices en `ia_uso`
 * + checkpoint manual de saldo (`ia_saldo_checkpoint`). Tipos locales del
 * panel: el contrato vive en GET /v1/config/ia-uso (ADMIN).
 *
 * OJO: el registro del API es best-effort (una llamada que falla o expira
 * puede consumir tokens sin quedar registrada) y Anthropic NO expone el saldo
 * por API — todo lo de aquí es ESTIMADO, nunca "el" saldo.
 */

export interface IaUsoTotal {
  llamadas: number;
  input_tokens: number;
  output_tokens: number;
  costo_usd: number;
}

export interface IaUsoCategoria extends IaUsoTotal {
  categoria: string;
}

export interface IaUsoModelo extends IaUsoTotal {
  modelo: string;
}

export interface IaUsoDia {
  /** YYYY-MM-DD (día calendario en Cancún). */
  dia: string;
  llamadas: number;
  costo_usd: number;
}

export interface IaSaldoCheckpoint {
  saldo_usd: number;
  notas?: string | null;
  created_at: string;
}

export interface IaUsoResumen {
  desde: string;
  hasta: string;
  total: IaUsoTotal;
  por_categoria: IaUsoCategoria[];
  por_modelo: IaUsoModelo[];
  por_dia: IaUsoDia[];
  /** Último saldo capturado a mano desde console.anthropic.com (o null). */
  checkpoint: IaSaldoCheckpoint | null;
  /** checkpoint.saldo_usd − consumo registrado DESPUÉS del checkpoint. */
  saldo_estimado: number | null;
}

/**
 * Best-effort a propósito: si el endpoint aún no existe o falla, la página de
 * configuración NO se cae — la sección de IA muestra su estado vacío.
 */
export function getIaUso(
  desde: string,
  hasta: string,
): Promise<IaUsoResumen | null> {
  return apiServer<IaUsoResumen>("/v1/config/ia-uso", {
    cache: "no-store",
    searchParams: { desde, hasta },
  }).catch(() => null);
}

/**
 * Mes "YYYY-MM" → rango date-only [primer día, último día] del mes. Aritmética
 * de calendario pura (Date.UTC día 0 del mes siguiente = último día): no toca
 * horas de pared, así que no aplica cancunInputToIso.
 */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
  };
}
