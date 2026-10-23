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

/**
 * Estado de un MES hacia afuera (la flota). CIERRE POR AVIÓN (23-oct-2026,
 * API 0.0.104, invariante 105): `PARCIAL` = al menos un avión cerrado y la
 * flota activa no completa (DERIVADO por el API, no persiste). La fila
 * global `cierre_mes` la escribe el API cuando cierra el ÚLTIMO avión activo.
 */
export type EstadoCierreMes = "ABIERTO" | "PARCIAL" | "CERRADO" | "REABIERTO";
/** Alias con el nombre del contrato §1. */
export type EstadoMes = EstadoCierreMes;
/** Estado de UN avión en un mes (`cierre_mes_avion`): nunca PARCIAL. */
export type EstadoCierreAvion = "ABIERTO" | "CERRADO" | "REABIERTO";

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

/** Totales que el API guarda al cerrar UN avión (`cierre_mes_avion.totales`). */
export interface TotalesCierreAvion {
  vuelos?: number;
  vuelos_diferidos?: number;
  diferidos_venta_usd?: number;
  saldo_usd?: number;
  saldo_mxn?: number;
  vuelos_incluidos?: number;
  incluidos?: string[];
}

/**
 * UN avión dentro de `meses[].aviones` (CIERRE POR AVIÓN, API 0.0.104): los
 * activos siempre y los inactivos solo si tienen fila. `estado`,
 * `puede_cerrar` y `motivo_no_cerrable` son los de ESE avión en ese mes
 * (`MES_ANTERIOR_ABIERTO` es por avión).
 */
export interface MesCierreAvion {
  aeronave_id: string;
  matricula: string;
  modelo: string | null;
  activa: boolean;
  estado: EstadoCierreAvion;
  cerrado_at: string | null;
  cerrado_por: UsuarioCierre | null;
  reabierto_at: string | null;
  reabierto_por: UsuarioCierre | null;
  reabierto_motivo: string | null;
  version: number;
  puede_cerrar: boolean;
  motivo_no_cerrable: MotivoNoCerrable | null;
  totales: TotalesCierreAvion | null;
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
  /**
   * CIERRE POR AVIÓN (API 0.0.104): cuántos aviones ACTIVOS tiene el mes y
   * cuántos de ellos ya están cerrados. Ausentes con un API previo o sin la
   * migración por avión (`por_avion: false`).
   */
  aviones_activos?: number;
  aviones_cerrados?: number;
  /** Los aviones del mes con su estado. Ausente ⇒ el panel solo conoce la fila global. */
  aviones?: MesCierreAvion[];
}

export interface CierresRespuesta {
  disponible: boolean;
  /**
   * CIERRE POR AVIÓN (API 0.0.104): `true` = la base ya tiene
   * `cierre_mes_avion` y el API cierra por avión. Ausente o `false` (API
   * previo o sin la migración) ⇒ el panel ofrece SOLO el flujo global de
   * siempre (`modoCierreDelApi`).
   */
  por_avion?: boolean;
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
  /**
   * ADITIVO (API 0.0.91, caso #351): día Cancún `YYYY-MM-DD` del cobro más
   * reciente con fecha POSTERIOR al corte; null sin cobros posteriores. Con
   * un API previo la llave no viaja.
   */
  fecha_cobro_posterior?: string | null;
  motivo: MotivoDiferir | null;
  /** `YYYY-MM` al que pasa (en `vuelos_que_pasan`). */
  destino?: string;
  /** `YYYY-MM` del que viene (en `vuelos_que_vienen`). */
  origen?: string;
  /**
   * Texto es-MX del API: «Pasa a octubre 2026 · pendiente de cobro: cobrado
   * $0.00 de $2,076.40 USD» o, si ya se cobró después del corte (API 0.0.91),
   * «Pasa a octubre 2026 · cobrado el 14-oct, después del 30-sep (al 30-sep:
   * $0.00 de $2,343.20 USD)».
   */
  leyenda: string;
  /**
   * CIERRE POR AVIÓN (API 0.0.104, regla 2): el vuelo lo comparten varios
   * aviones; `otros_aviones` son los demás participantes con su estado en el
   * mes. El PRIMER avión que cierra decide por el vuelo entero.
   */
  multi_avion?: boolean;
  otros_aviones?: OtroAvionVuelo[];
  /**
   * Solo en `vuelos_incluidos`: la decisión «Se queda en <mes>» la tomó el
   * cierre de OTRO avión; desde este no se puede diferir ni des-incluir.
   */
  decidido_por?: AvionCierreRef | null;
}

/** Otro avión que participa en un vuelo multi-avión (previa por avión). */
export interface OtroAvionVuelo {
  aeronave_id: string;
  matricula: string;
  estado: EstadoCierreAvion;
}

/** Referencia corta a un avión en la previa / los 409 del cierre. */
export interface AvionCierreRef {
  aeronave_id: string;
  matricula: string;
}

export interface BloqueantePrevia {
  clave: string;
  titulo: string;
  count: number;
  ids?: string[];
  /**
   * ADITIVO (API 0.0.95): `true` = el API no pudo leer ese renglón y manda
   * `count: 0`. Ese 0 NO es «no hay»: el renglón bloquea el cierre y se
   * pinta «sin verificar» (`textoConteoPreCierre`), jamás «· 0».
   */
  lectura_fallida?: boolean | null;
  /** ADITIVO (API 0.0.95, `gastos_por_pagar`): el subconjunto de `ids` que es NÓMINA. */
  ids_nomina?: string[];
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
  /** INCLUIR EN EL MES (API 0.0.102, 21-oct-2026): cuántos de «pasan» se quedan por decisión de la oficina. Sin la llave (API previo) ⇒ 0. */
  incluidos?: number;
}

/** `GET /v1/cierres/:periodo/previa`: «qué pasaría» al cerrar. */
export interface PreviaCierre {
  periodo: string;
  /** El estado del AVIÓN (previa por avión) o de la flota. */
  estado: EstadoCierreMes;
  listo: boolean;
  /**
   * CIERRE POR AVIÓN (API 0.0.104): el avión de `?aeronave_id` (null = toda
   * la flota abierta) y los aviones que cierra ESTA previa. Ausentes con un
   * API previo.
   */
  aeronave?: { id: string; matricula: string; modelo?: string | null } | null;
  aviones_alcance?: AvionCierreRef[];
  /** Bloqueantes de OTROS aviones (informativos: no impiden este cierre). */
  bloqueantes_otros_aviones?: BloqueantePrevia[];
  motivo_no_cerrable: MotivoNoCerrable | null;
  /** Texto es-MX del motivo, armado por el API (gana sobre el espejo del panel). */
  texto_no_cerrable?: string | null;
  bloqueantes: BloqueantePrevia[];
  vuelos_que_pasan: VueloDiferido[];
  vuelos_que_vienen: VueloDiferido[];
  /**
   * INCLUIR EN EL MES (API 0.0.102, 21-oct-2026): los de «pasan» que la
   * oficina marcó (`?incluir=`) y se QUEDAN en el mes (ya cobrados después
   * del corte; leyenda «Se queda en …»). Ya no están en `vuelos_que_pasan`.
   * Sin la llave (API previo) ⇒ [].
   */
  vuelos_incluidos?: VueloDiferido[];
  totales: TotalesPrevia;
  reparto: { antes: RepartoAvionPrevia[]; despues: RepartoAvionPrevia[] } | null;
}

/** Una fila de `cierre_mes_avion` tal como la devuelven cerrar / reabrir. */
export interface FilaCierreAvion {
  aeronave_id?: string;
  matricula?: string;
  estado?: EstadoCierreAvion;
  version?: number;
}

/** Respuesta 201 de `POST /v1/cierres/:periodo`. */
export interface ResultadoCerrarMes {
  /** API ≤ 0.0.103 (cierre global). */
  cierre?: {
    periodo: string;
    estado: EstadoCierreMes;
    version: number;
    cerrado_at: string;
    cerrado_por: UsuarioCierre | null;
  };
  /** CIERRE POR AVIÓN (API 0.0.104): el avión cerrado (null = toda la flota), las filas por avión y el mes después. */
  aeronave?: { id: string; matricula: string } | null;
  cierres?: FilaCierreAvion[];
  mes?: MesCierre | null;
  diferidos: VueloDiferido[];
  /** INCLUIR EN EL MES (API 0.0.102): los que se quedaron en el mes. */
  incluidos?: VueloDiferido[];
  totales: TotalesPrevia | TotalesCierre;
  reparto: { aviones: { matricula: string; saldo_usd: number }[]; total_usd: number } | null;
  notificados: number;
}

/** Respuesta 200 de `POST /v1/cierres/:periodo/reabrir`. */
export interface ResultadoReabrirMes {
  /** API ≤ 0.0.103 (reabrir global). */
  cierre?: {
    periodo: string;
    estado: EstadoCierreMes;
    version: number;
    reabierto_at: string | null;
    reabierto_por: UsuarioCierre | null;
    reabierto_motivo?: string | null;
  };
  /** CIERRE POR AVIÓN (API 0.0.104). */
  aeronave?: { id: string; matricula: string } | null;
  cierres?: FilaCierreAvion[];
  mes?: MesCierre | null;
  revertidos: number;
  no_revertidos: unknown[];
}

/** `details` del 409 `MES_CERRADO` (candado de capturas). */
export interface DetallesMesCerrado {
  periodo: string; // YYYY-MM
  cerrado_at?: string | null;
  cerrado_por?: UsuarioCierre | null;
  registro?: string;
  /**
   * CIERRE POR AVIÓN (API 0.0.104, regla 5): el avión cuyo cierre rebotó la
   * captura, o null si fue la fila global (toda la flota) o un registro sin
   * avión. Ausente con un API previo.
   */
  aeronave?: { id: string; matricula: string } | null;
}

// =============================================================================
// Llaves ADITIVAS en payloads que ya existían
// =============================================================================

/**
 * CIERRE POR AVIÓN (API 0.0.104): `aviones[].cierre_avion` en el reparto, el
 * pre-cierre y el payload del PDF/XLSX; `cierre.cierre_avion` en
 * `GET /v1/profit-sharing/aviones/:id`. SIEMPRE viaja con ese API
 * (`'ABIERTO'` por defecto); ausente con uno previo.
 */
export interface CierreAvionAditivo {
  estado: EstadoCierreAvion;
  cerrado_at?: string | null;
  cerrado_por_nombre?: string | null;
  reabierto_at?: string | null;
  version?: number;
  /** Saldo de ESE avión ±0.01 vs su snapshot (null si no está cerrado). */
  coincide_con_snapshot?: boolean | null;
}

/** `cierre` en la raíz del reparto, el pre-cierre y los balances. */
export interface CierrePeriodoAditivo {
  disponible: boolean;
  periodo: string | null;
  /** Estado de la FLOTA (puede ser PARCIAL); en el balance por avión, el del AVIÓN. */
  estado: EstadoCierreMes;
  cerrado_at?: string | null;
  cerrado_por_nombre?: string | null;
  version?: number;
  /** Solo en el reparto: saldo por avión ±0.01 vs el snapshot del cierre (AND de los aviones cerrados). */
  coincide_con_snapshot?: boolean | null;
  /** CIERRE POR AVIÓN (API 0.0.104): matrículas de los aviones cerrados en el mes. */
  aviones_cerrados?: string[];
  /** Balance por avión: `estado` es el del avión y este el de la flota. */
  estado_flota?: EstadoCierreMes;
  /** Pantalla por avión: el bloque global trae además el del avión. */
  cierre_avion?: CierreAvionAditivo | null;
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
  /**
   * ADITIVOS (API 0.0.91, caso #351; ausentes con un API previo). Reparto:
   * `motivo` y lo cobrado DESPUÉS del corte (`cobrado_posterior_usd`; la
   * fecha solo en los que pasarían). Balances: `motivo`, `corte`
   * (`YYYY-MM-DD`, último día del mes que se cierra) y, en los que pasarían,
   * `cobrado_despues_usd/_mxn` y `fecha_cobro_despues`.
   */
  motivo?: MotivoDiferir | null;
  corte?: string | null;
  cobrado_posterior_usd?: number | null;
  fecha_cobro_posterior?: string | null;
  cobrado_despues_usd?: number | null;
  cobrado_despues_mxn?: number | null;
  fecha_cobro_despues?: string | null;
  leyenda: string;
}

/** `cierre` del vuelo (`findById` / snapshot), solo con la migración. */
export interface VueloCierreAditivo {
  diferido_de: string | null;
  diferido_a: string | null;
  mes_cerrado: boolean;
  cierre: { periodo: string; cerrado_at: string | null; cerrado_por_nombre: string | null } | null;
}
