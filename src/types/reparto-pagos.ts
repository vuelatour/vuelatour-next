/**
 * CUENTA CORRIENTE DE LOS SOCIOS del reparto de utilidades (v2, 1-oct-2026,
 * API 0.0.50 · tablas `reparto_pago` + `reparto_cuenta_socio`, migraciones
 * `20261001000001` y `20261002000001`).
 *
 * Aclaración del cliente (audio del 1-oct-2026): «cuando el socio dice:
 * necesito que me adelanten 70,000 pesos de mis utilidades, necesitamos
 * poder grabarlo en algún lado y que se lleve el HISTÓRICO de cuánto se le
 * ha ido repartiendo a los socios, cuánto falta por repartir, cómo se le
 * repartió (transferencia o efectivo), la fecha de la entrega y algún
 * comprobante escaneado». Es una CUENTA CORRIENTE por socio, no un estatus
 * por mes (eso era la v1 del mismo día, que se retiró).
 *
 * Solo la FORMA del contrato (1:1 con `/v1/profit-sharing/socios*` y
 * `/v1/profit-sharing/pagos*`). Textos, colores, validación del formulario y
 * tolerancia al API previo viven en `lib/admin/reparto-pagos.ts`. El DINERO
 * (utilidad generada por mes y avión, entregado, por entregar, saldo
 * corrido, estado, equivalente en USD de una entrega en pesos) lo calcula el
 * API: el panel nunca lo recalcula.
 */

export type MonedaPagoSocio = "USD" | "MXN";

export type MetodoPagoSocio = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "OTRO";

/**
 * Estado de la cuenta del socio (lo decide el API con tolerancia de $1.00):
 * AL_CORRIENTE (|saldo| ≤ 1), POR_ENTREGAR (saldo > 1: se le debe) o
 * ADELANTADO (saldo < −1: se le entregó más de lo que ha generado).
 * String en la unión: un estado nuevo del API no rompe el tipado.
 */
export type EstadoCuentaSocio = "AL_CORRIENTE" | "POR_ENTREGAR" | "ADELANTADO";

export interface AeronaveRef {
  id: string;
  matricula: string;
}

export interface SocioRef {
  id: string;
  nombre: string;
  /** Rol del usuario socio (informativo). */
  rol?: string | null;
  /** ACTIVO / INACTIVO… (informativo). */
  estado?: string | null;
}

/**
 * Una ENTREGA de utilidades a un socio (fila de `reparto_pago`; las bajas
 * nunca llegan: soft delete). `periodo` y `aeronave_id` son «corresponde a»
 * INFORMATIVOS y opcionales: una entrega «a cuenta» no trae ninguno.
 */
export interface PagoSocio {
  id: string;
  socio_id: string;
  /** «Corresponde a» este avión (opcional, informativo). */
  aeronave_id: string | null;
  /** «Corresponde a» este mes, primer día (`YYYY-MM-01`) o null. */
  periodo: string | null;
  /** El mismo «corresponde a» como `YYYY-MM` (null = a cuenta, sin mes). */
  mes?: string | null;
  /** Lo que se entregó, en su moneda. */
  monto: number;
  moneda: MonedaPagoSocio | (string & {});
  /** Solo con MXN (6 decimales). */
  tc_usd_mxn: number | null;
  /** Lo que descuenta del saldo (USD = monto; MXN = monto ÷ T.C.). Lo
      calcula el API. */
  monto_usd: number;
  /** v1: utilidad del renglón (avión × mes) al registrar. null en v2. */
  utilidad_snapshot_usd: number | null;
  /** Por entregar del socio ANTES de esta entrega (informativo). */
  saldo_snapshot_usd: number | null;
  /** Día de la entrega (`YYYY-MM-DD`, día Cancún). */
  fecha_pago: string;
  metodo: MetodoPagoSocio | (string & {});
  referencia: string | null;
  /** Usuario que entregó el dinero. */
  entregado_por: string | null;
  entregado_por_nombre: string | null;
  /** Nombre de quien recibió si no fue el socio. */
  recibido_por: string | null;
  /** Folio de la factura cuando el socio cobra con factura. */
  factura_folio: string | null;
  /** Llave en el bucket privado `reparto-comprobantes`. */
  comprobante_path: string | null;
  /** URL firmada (8 h) del comprobante, o null. */
  comprobante_url: string | null;
  notas: string | null;
  client_request_id?: string | null;
  created_by: string | null;
  created_by_nombre: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Avión «corresponde a» resuelto (o null). */
  aeronave: AeronaveRef | null;
}

/** Cómo arranca la cuenta del socio (`reparto_cuenta_socio`). */
export interface CuentaSocio {
  /** Mes de arranque (`YYYY-MM`; el panel tolera `YYYY-MM-01`). */
  cuenta_desde: string;
  /** Positivo = se le debía al arrancar; negativo = ya se le había adelantado. */
  saldo_inicial_usd: number;
  notas: string | null;
  /** false = no hay fila: el API usa el default (sep 2026, saldo 0). */
  configurada: boolean;
  /** ADITIVO: última vez que se configuró (null sin fila). */
  updated_at?: string | null;
}

export interface UltimoPagoSocio {
  id: string;
  fecha_pago: string;
  monto: number;
  moneda: MonedaPagoSocio | (string & {});
  monto_usd: number;
  metodo: MetodoPagoSocio | (string & {});
}

/** Avión en el que la persona es (o fue) socia. */
export interface AvionDeSocio {
  id: string;
  matricula: string;
  porcentaje: number;
  /** true = sigue vigente hoy. */
  vigente: boolean;
  /** ADITIVO: false = el avión está dado de baja (ya no suma utilidad). */
  activa?: boolean;
}

/** Un renglón del resumen `GET /v1/profit-sharing/socios`. */
export interface ResumenCuentaSocio {
  socio: SocioRef;
  cuenta: CuentaSocio;
  /** Utilidades generadas desde `cuenta_desde` hasta el mes actual
      INCLUSIVE (el mes en curso incluido). */
  generado_usd: number;
  /** Parte de `generado_usd` del mes en curso (cambia día con día). */
  mes_en_curso_usd: number;
  entregado_usd: number;
  /** Saldo: saldo inicial + generado − entregado (negativo = adelantado). */
  por_entregar_usd: number;
  estado: EstadoCuentaSocio | (string & {});
  ultimo_pago: UltimoPagoSocio | null;
  aviones: AvionDeSocio[];
  /** ADITIVO: avisos de la cuenta en texto listo (entregas antes del
      arranque, avión dado de baja…). */
  avisos?: string[];
}

export interface TotalesCuentasSocios {
  generado_usd: number;
  entregado_usd: number;
  /** Σ de lo por entregar POSITIVO (un adelanto no compensa a otro socio). */
  por_entregar_usd: number;
  /** ADITIVO: Σ de lo adelantado (saldos negativos, en positivo). */
  adelantado_usd?: number;
  socios_por_entregar: number;
  socios_adelantados: number;
}

/** `GET /v1/profit-sharing/socios`. */
export interface SociosCuentaRespuesta {
  /** false = el servidor aún no tiene la migración (lista vacía). */
  disponible: boolean;
  /** Mes hasta el que se calculó (`YYYY-MM`, el mes en curso). */
  hasta_mes: string;
  socios: ResumenCuentaSocio[];
  /** null para un SOCIO (solo ve su renglón y sin totales). */
  totales: TotalesCuentasSocios | null;
}

export type TipoMovimientoCuenta = "SALDO_INICIAL" | "SALDO_ANTERIOR" | "UTILIDAD" | "ENTREGA";

/**
 * Un movimiento del estado de cuenta, en orden de fecha y con el saldo
 * corrido. Convención DEL API (`reparto-cuenta.util.ts`): `cargo_usd` SUMA a
 * lo por entregar (utilidad generada —NEGATIVA en un mes con pérdida— o
 * saldo inicial a favor del socio) y `abono_usd` RESTA (siempre ≥ 0:
 * entregas o saldo inicial ya adelantado). El panel los pinta como
 * «Generó (+)» y «Entregado (−)».
 */
export interface MovimientoCuenta {
  /** `YYYY-MM-DD`. Utilidad: último día de su mes; entrega: su fecha. */
  fecha: string;
  tipo: TipoMovimientoCuenta | (string & {});
  /** «Utilidad sep 2026 · N4142R 69 %», «Entrega · Transferencia · ref …»,
      «Adelanto a cuenta». Lo redacta el API; para una ENTREGA el panel pinta
      `conceptoEntregaCuenta` (no repite monto/T.C. y no dice «adelanto» a
      una entrega sin mes). */
  concepto: string;
  /** UTILIDAD: su mes · ENTREGA: «corresponde a» (null = a cuenta). */
  mes: string | null;
  aeronave: AeronaveRef | null;
  porcentaje: number | null;
  cargo_usd: number;
  abono_usd: number;
  /** Saldo por entregar DESPUÉS del movimiento. */
  saldo_usd: number;
  /** Utilidad del mes en curso (todavía cambia). */
  en_curso: boolean;
  /** La entrega completa (solo en ENTREGA). */
  pago: PagoSocio | null;
}

export interface UtilidadAvionMes {
  aeronave: AeronaveRef;
  porcentaje: number;
  monto_usd: number;
}

export interface ResumenMesCuenta {
  /** `YYYY-MM`. */
  mes: string;
  utilidad_usd: number;
  en_curso: boolean;
  por_avion: UtilidadAvionMes[];
  /** Σ entregas con `fecha_pago` en ese mes (flujo de dinero). */
  entregado_usd: number;
}

export interface TotalesEstadoCuenta {
  generado_usd: number;
  /** ADITIVO: parte de `generado_usd` del mes en curso. */
  mes_en_curso_usd?: number;
  entregado_usd: number;
  por_entregar_usd: number;
  estado: EstadoCuentaSocio | (string & {});
}

/** `GET /v1/profit-sharing/socios/:socioId/estado-cuenta?desde&hasta`. */
export interface EstadoCuentaRespuesta {
  /** false = sin la migración 2 (el panel dice «Disponible cuando…»). */
  disponible?: boolean;
  socio: SocioRef;
  cuenta: CuentaSocio;
  /** `YYYY-MM`. */
  desde: string;
  /** `YYYY-MM`. */
  hasta: string;
  /** Saldo al cierre del mes anterior a `desde` (incluye saldo inicial y
      entregas previas). */
  saldo_anterior_usd: number;
  movimientos: MovimientoCuenta[];
  por_mes: ResumenMesCuenta[];
  /** De TODA la cuenta, HOY (las mismas cifras que el resumen), aunque el
      filtro de meses sea otro. */
  totales: TotalesEstadoCuenta;
  /** ADITIVO: los aviones del socio (para «Corresponde a»). */
  aviones?: AvionDeSocio[];
  /** ADITIVO: solo lo que cae en [desde, hasta]. */
  rango?: { generado_usd: number; entregado_usd: number; saldo_final_usd: number } | null;
  /** ADITIVO: avisos de la cuenta en texto listo. */
  avisos?: string[];
}

/** `POST /v1/profit-sharing/pagos`. */
export interface CrearPagoSocioPayload {
  socio_id: string;
  monto: number;
  moneda: MonedaPagoSocio;
  tc_usd_mxn?: number;
  /** `YYYY-MM-DD` (día Cancún, no futuro). */
  fecha_pago: string;
  metodo: MetodoPagoSocio;
  referencia?: string;
  /** Default en el API: quien registra. Debe ser usuario ACTIVO. */
  entregado_por_id?: string;
  recibido_por?: string;
  factura_folio?: string;
  notas?: string;
  /** «Corresponde a» (opcional): avión del socio. */
  aeronave_id?: string;
  /** «Corresponde a» (opcional): `YYYY-MM`. */
  mes?: string;
  /** Registrar aunque supere lo que hay por entregar (ADELANTO confirmado). */
  aceptar_exceso?: boolean;
  /** Idempotencia: el MISMO id en el reintento ⇒ el API no duplica. */
  client_request_id?: string;
}

/** `PATCH /v1/profit-sharing/pagos/:id` (al menos un campo). No cambia el
    socio; el «corresponde a» sí (null lo quita). */
export interface PatchPagoSocioPayload {
  monto?: number;
  moneda?: MonedaPagoSocio;
  /** null = quitarlo (al pasar a USD). */
  tc_usd_mxn?: number | null;
  fecha_pago?: string;
  metodo?: MetodoPagoSocio;
  referencia?: string | null;
  entregado_por_id?: string;
  recibido_por?: string | null;
  factura_folio?: string | null;
  notas?: string | null;
  /** «Corresponde a» este avión; null lo quita. */
  aeronave_id?: string | null;
  /** «Corresponde a» este mes (`YYYY-MM`); null = a cuenta (sin mes). */
  mes?: string | null;
  aceptar_exceso?: boolean;
}

/** Respuesta de alta (201, o 200 con `idempotente`) y de edición: la entrega
    y el renglón del socio ya recalculado (null si no llegó). */
export interface ResultadoPagoSocio {
  pago: PagoSocio;
  cuenta: ResumenCuentaSocio | null;
  idempotente?: boolean;
}

/** Respuesta de la baja (soft delete). */
export interface ResultadoBajaPagoSocio {
  deleted: true;
  cuenta: ResumenCuentaSocio | null;
}

/** Respuesta de la subida del comprobante. */
export interface ResultadoComprobantePagoSocio {
  pago: PagoSocio;
}

/** `PUT /v1/profit-sharing/socios/:socioId/cuenta`. */
export interface ConfigurarCuentaPayload {
  /** `YYYY-MM`. */
  cuenta_desde: string;
  saldo_inicial_usd: number;
  notas?: string | null;
}

/** `details` del 409 `PAGO_EXCEDE_SALDO`. */
export interface DetalleExcesoSaldo {
  por_entregar_usd: number;
  monto_usd: number;
  exceso_usd: number;
}

/** Renglón de los items del pre-cierre `socios_por_entregar` /
    `socios_adelantados` (máx. 50). `socio` como objeto o texto. */
export interface PreCierreSocioCuenta {
  socio: SocioRef | string | null;
  /** Saldo del socio (positivo = por entregar; negativo = adelantado). */
  por_entregar_usd?: number | null;
  /** Tolerado: el adelanto como positivo. */
  adelantado_usd?: number | null;
}
