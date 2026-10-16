/**
 * CIERRE DE MES formal (16-oct-2026, API 0.0.88): `GET /v1/cierres`,
 * `GET /v1/cierres/:periodo/previa`, `POST /v1/cierres/:periodo` y
 * `POST /v1/cierres/:periodo/reabrir`, más las llaves ADITIVAS que el reparto,
 * el pre-cierre, los balances y el vuelo traen desde ese API. Todo lo que es
 * ADITIVO va opcional: con un API previo las llaves no viajan y el panel se
 * comporta como hoy (ningún chip, ninguna card nueva).
 *
 * El panel NO calcula dinero ni decide qué vuelo pasa de mes: copia las
 * leyendas (`leyenda`, `cierre_marca`) que arma el API (fuente única).
 */

export type EstadoCierreMes = "ABIERTO" | "CERRADO" | "REABIERTO";

export type MotivoNoCerrable =
  | "MES_EN_CURSO"
  | "MES_ANTERIOR_ABIERTO"
  | "YA_CERRADO"
  | "PRECIERRE_NO_LISTO"
  /** La previa de un mes antes del inicio oficial (el API responde 400 antes). */
  | "PERIODO_ANTES_DEL_INICIO";

export interface UsuarioCierre {
  id: string;
  nombre: string;
}

/** Totales que el API guarda al cerrar (y devuelve en `meses[].totales`). */
export interface TotalesCierre {
  vuelos?: number;
  vuelos_diferidos?: number;
  diferidos_venta_usd?: number;
  diferidos_cobrado_usd?: number;
  diferidos_por_cobrar_usd?: number;
  saldo_total_usd?: number;
  por_avion?: { aeronave_id: string; matricula: string; saldo_usd: number }[];
}

/** Un mes de `GET /v1/cierres` (del inicio oficial al mes en curso). */
export interface MesCierre {
  periodo: string; // YYYY-MM
  estado: EstadoCierreMes;
  cerrado_at: string | null;
  cerrado_por: UsuarioCierre | null;
  reabierto_at: string | null;
  reabierto_por: UsuarioCierre | null;
  reabierto_motivo: string | null;
  version: number;
  puede_cerrar: boolean;
  motivo_no_cerrable: MotivoNoCerrable | null;
  totales: TotalesCierre | null;
}

export interface CierresRespuesta {
  disponible: boolean;
  inicio_oficial: string | null;
  mes_en_curso: string;
  meses: MesCierre[];
  siguiente_a_cerrar: string | null;
}

export type MotivoDiferir = "SIN_COBRO" | "COBRO_PARCIAL" | "COBRO_POSTERIOR";

/** Un vuelo que PASA al mes siguiente (o que VINO de uno anterior). */
export interface VueloDiferido {
  id: string;
  /** El API lo tipa `number | null` (un vuelo sin folio no debería existir). */
  folio: number | null;
  clave_cliente: string | null;
  cliente: string | null;
  aeronave: { id: string; matricula: string | null } | null;
  fecha_vuelo: string | null;
  venta_usd: number;
  cobrado_usd: number;
  por_cobrar_usd: number;
  cobrado_posterior_usd: number;
  motivo: MotivoDiferir | null;
  /** `YYYY-MM` al que pasa (en `vuelos_que_pasan`). */
  destino?: string;
  /** `YYYY-MM` del que viene (en `vuelos_que_vienen`). */
  origen?: string;
  /** Texto es-MX del API («Pasa a octubre 2026 · pendiente de cobro: …»). */
  leyenda: string;
}

export interface BloqueantePrevia {
  clave: string;
  titulo: string;
  count: number;
  ids?: string[];
}

export interface RepartoAvionPrevia {
  aeronave_id?: string;
  matricula: string;
  saldo_usd: number;
  cobrado_usd: number;
  gastos_usd: number;
}

export interface TotalesPrevia {
  vuelos: number;
  completados: number;
  cancelados: number;
  pasan: number;
  pasan_venta_usd: number;
  pasan_cobrado_al_corte_usd: number;
  pasan_por_cobrar_usd: number;
  pasan_cobrado_posterior_usd: number;
  pasan_mxn: number;
  pasan_usd_nativo: number;
  se_quedan_en_cero: number;
}

/** `GET /v1/cierres/:periodo/previa`: «qué pasaría» al cerrar. */
export interface PreviaCierre {
  periodo: string;
  estado: EstadoCierreMes;
  listo: boolean;
  motivo_no_cerrable: MotivoNoCerrable | null;
  /** Texto es-MX del motivo, armado por el API (gana sobre el espejo del panel). */
  texto_no_cerrable?: string | null;
  bloqueantes: BloqueantePrevia[];
  vuelos_que_pasan: VueloDiferido[];
  vuelos_que_vienen: VueloDiferido[];
  totales: TotalesPrevia;
  reparto: { antes: RepartoAvionPrevia[]; despues: RepartoAvionPrevia[] } | null;
}

/** Respuesta 201 de `POST /v1/cierres/:periodo`. */
export interface ResultadoCerrarMes {
  cierre: {
    periodo: string;
    estado: EstadoCierreMes;
    version: number;
    cerrado_at: string;
    cerrado_por: UsuarioCierre | null;
  };
  diferidos: VueloDiferido[];
  totales: TotalesPrevia | TotalesCierre;
  reparto: { aviones: { matricula: string; saldo_usd: number }[]; total_usd: number } | null;
  notificados: number;
}

/** Respuesta 200 de `POST /v1/cierres/:periodo/reabrir`. */
export interface ResultadoReabrirMes {
  cierre: {
    periodo: string;
    estado: EstadoCierreMes;
    version: number;
    reabierto_at: string | null;
    reabierto_por: UsuarioCierre | null;
    reabierto_motivo?: string | null;
  };
  revertidos: number;
  no_revertidos: unknown[];
}

/** `details` del 409 `MES_CERRADO` (candado de capturas). */
export interface DetallesMesCerrado {
  periodo: string; // YYYY-MM
  cerrado_at?: string | null;
  cerrado_por?: UsuarioCierre | null;
  registro?: string;
}

// =============================================================================
// Llaves ADITIVAS en payloads que ya existían
// =============================================================================

/** `cierre` en la raíz del reparto, el pre-cierre y los balances. */
export interface CierrePeriodoAditivo {
  disponible: boolean;
  periodo: string | null;
  estado: EstadoCierreMes;
  cerrado_at?: string | null;
  cerrado_por_nombre?: string | null;
  version?: number;
  /** Solo en el reparto: saldo por avión ±0.01 vs el snapshot del cierre. */
  coincide_con_snapshot?: boolean | null;
  /** Reparto: los que SALEN de este mes (no cuentan) y los que ENTRAN. */
  diferidos_salen?: VueloDiferidoMarca[];
  diferidos_entran?: VueloDiferidoMarca[];
  /** Reparto, mes ABIERTO: los que pasarían hoy al cerrar. */
  pendientes_que_pasarian?: VueloDiferidoMarca[];
  /** Balances: mismas tres listas con otros nombres. */
  pasan?: VueloDiferidoMarca[];
  vienen?: VueloDiferidoMarca[];
  pasarian?: VueloDiferidoMarca[];
  /** Pre-cierre: quién puede cerrar y si ya se puede. */
  puede_cerrar?: boolean;
  motivo_no_cerrable?: MotivoNoCerrable | null;
  roles_cierran?: string[];
}

/** Elemento de las listas de diferidos en reparto/balances (shape corto). */
export interface VueloDiferidoMarca {
  id?: string;
  clave?: string;
  /** Reparto: número; balances (vía pyservices): puede llegar como texto. */
  folio?: number | string | null;
  cliente?: string | null;
  matricula?: string | null;
  fecha?: string | null;
  venta_usd?: number;
  cobrado_usd?: number;
  por_cobrar_usd?: number;
  venta_mxn?: number;
  cobrado_mxn?: number;
  por_cobrar_mxn?: number;
  destino?: string;
  origen?: string;
  leyenda: string;
}

/** `cierre` del vuelo (`findById` / snapshot), solo con la migración. */
export interface VueloCierreAditivo {
  diferido_de: string | null;
  diferido_a: string | null;
  mes_cerrado: boolean;
  cierre: { periodo: string; cerrado_at: string | null; cerrado_por_nombre: string | null } | null;
}
