/**
 * `POST /v1/expenses/reparto-iguales` (API 0.0.90, 16-oct-2026; contrato A1.7):
 * reparte cada gasto de NÓMINA en PARTES IGUALES entre los aviones elegidos
 * (o QUITA el reparto con `aeronave_ids: []`). Copia 1:1 de la respuesta del
 * API: el panel NO calcula ningún monto, los pinta.
 */

/** Cuerpo exacto que viaja (el API corre con `forbidNonWhitelisted`). */
export interface CuerpoRepartoIguales {
  /** 1..200 uuid sin repetir. */
  gasto_ids: string[];
  /** 0..20 uuid sin repetir; `[]` = QUITAR el reparto. */
  aeronave_ids: string[];
  /** Solo `true`: vista previa sin escribir. Ausente = aplicar. */
  simular?: true;
}

export interface ParteRepartoIguales {
  aeronave_id: string;
  matricula: string | null;
  monto: string | number;
}

/** Códigos por gasto: GASTO_NO_EXISTE, CATEGORIA_NO_REPARTIBLE, GASTO_CON_VUELO,
 *  MONTO_MUY_CHICO, MES_CERRADO (con el texto del API) y ERROR. */
export interface ErrorRepartoIguales {
  code: string;
  message: string;
}

export interface GastoRepartoIguales {
  gasto_id: string;
  fecha_gasto: string | null;
  monto: string | number;
  moneda: string;
  ok: boolean;
  /** Ya tenía reparto antes de esta llamada (aplicar lo REEMPLAZA). */
  ya_repartido: boolean;
  partes: ParteRepartoIguales[];
  error: ErrorRepartoIguales | null;
}

export interface TotalRepartoIguales {
  moneda: string;
  monto: string | number;
  gastos_n: number;
  por_avion: Array<{ aeronave_id: string; matricula: string | null; monto: string | number }>;
}

export interface RespuestaRepartoIguales {
  simulado: boolean;
  quitar: boolean;
  aeronaves: Array<{ id: string; matricula: string | null }>;
  gastos: GastoRepartoIguales[];
  totales: TotalRepartoIguales[];
  aplicados: number;
  errores: number;
}
