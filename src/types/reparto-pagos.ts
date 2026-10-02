/**
 * PAGOS A SOCIOS del reparto de utilidades (1-oct-2026, API 0.0.49 · tabla
 * `reparto_pago`, migración `20261001000001_reparto_pago.sql`).
 *
 * Pedido del cliente (captura de /admin/profit-sharing): «cada socio debe
 * recibir los pagos de lo que generó el avión en el mes … un apartado donde
 * siga algo como: Mauricio Roque, %, Monto de utilidad, estatus de si ya se
 * pagó o aún no, con cuánto se le pagó, cuándo y quién se lo entregó, para
 * llevar una relación de esos pagos y no se nos escape ninguno».
 *
 * Solo la FORMA del contrato (1:1 con `/v1/profit-sharing/pagos`). Textos,
 * colores, reglas de pintado, validación del formulario y tolerancia al API
 * previo viven en `lib/admin/reparto-pagos.ts`. El DINERO (utilidad, pagado,
 * pendiente, exceso, estado, monto en USD de un pago en pesos) lo calcula el
 * API: el panel nunca lo recalcula.
 */

export type MonedaPagoSocio = "USD" | "MXN";

export type MetodoPagoSocio = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "OTRO";

/** String a propósito en la unión: un estado nuevo del API no rompe el tipado. */
export type EstadoPagoSocio = "PENDIENTE" | "PARCIAL" | "PAGADO" | "SIN_UTILIDAD";

/** Un pago registrado a un socio (las bajas nunca llegan: soft delete). */
export interface PagoSocio {
  id: string;
  aeronave_id: string;
  socio_id: string;
  /** Mes que se paga, primer día (`YYYY-MM-01`). */
  periodo: string;
  /** Lo que se entregó, en su moneda. */
  monto: number;
  moneda: MonedaPagoSocio | (string & {});
  /** Solo con MXN (6 decimales). */
  tc_usd_mxn: number | null;
  /** Lo que descuenta de la utilidad (USD = monto; MXN = monto ÷ T.C.). Lo
      calcula el API. */
  monto_usd: number;
  /** Utilidad del socio en ese mes al momento de registrar el pago. */
  utilidad_snapshot_usd: number;
  /** Día del pago (`YYYY-MM-DD`, día Cancún). */
  fecha_pago: string;
  metodo: MetodoPagoSocio | (string & {});
  referencia: string | null;
  /** Usuario que entregó el dinero. */
  entregado_por: string;
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
}

export interface AeronaveRef {
  id: string;
  matricula: string;
  modelo: string;
}

export interface SocioRef {
  id: string;
  nombre: string;
}

/** Un renglón (aeronave × socio) del mes. */
export interface FilaPagoSocio {
  aeronave: AeronaveRef;
  socio: SocioRef;
  porcentaje: number;
  /** Utilidad del socio en el mes, calculada HOY con el reparto del mes. */
  utilidad_usd: number;
  pagado_usd: number;
  pendiente_usd: number;
  /** Pagado de más (> $1.00 USD de tolerancia); 0 si no hay exceso. */
  exceso_usd: number;
  estado: EstadoPagoSocio | (string & {});
  /** Utilidad que tenía el socio al registrar el ÚLTIMO pago (o null). */
  utilidad_al_pagar_usd: number | null;
  /** true = la utilidad de hoy difiere (> $1.00) de la del último pago. */
  utilidad_difiere: boolean;
  /** ADITIVO tolerado: false cuando el socio ya no es vigente en el avión
      pero tiene pagos del mes (el API manda utilidad 0 y aviso). */
  vigente?: boolean;
  /** ADITIVO tolerado: aviso en texto que mande el API para el renglón. */
  aviso?: string | null;
  pagos: PagoSocio[];
}

/** Consolidado por socio (todas sus aeronaves). */
export interface ResumenPagoSocio {
  socio: SocioRef;
  utilidad_usd: number;
  pagado_usd: number;
  pendiente_usd: number;
  estado: EstadoPagoSocio | (string & {});
  /** Cuántas aeronaves suma el renglón. */
  aviones: number;
}

export interface TotalesPagosSocios {
  utilidad_usd: number;
  pagado_usd: number;
  pendiente_usd: number;
  /** Socios con pago pendiente o parcial. */
  socios_pendientes: number;
}

/** `GET /v1/profit-sharing/pagos?mes=YYYY-MM[&aeronave_id]`. */
export interface RepartoPagosRespuesta {
  /** false = el servidor aún no tiene la tabla (listas vacías). */
  disponible: boolean;
  mes: string;
  desde: string;
  hasta: string;
  filas: FilaPagoSocio[];
  por_socio: ResumenPagoSocio[];
  totales: TotalesPagosSocios;
}

/** `POST /v1/profit-sharing/pagos`. */
export interface CrearPagoSocioPayload {
  aeronave_id: string;
  socio_id: string;
  /** `YYYY-MM`. */
  mes: string;
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
  /** Registrar aunque el pago supere la utilidad (tras confirmar). */
  aceptar_exceso?: boolean;
  /** Idempotencia: el MISMO id en el reintento ⇒ el API no duplica. */
  client_request_id?: string;
}

/** `PATCH /v1/profit-sharing/pagos/:id` (al menos un campo). No cambia
    aeronave, socio ni mes. */
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
  aceptar_exceso?: boolean;
}

/** Respuesta de alta (201, o 200 con `idempotente`) y de edición. `fila`
    llega null cuando el socio ya no está en el reparto y no le quedan pagos
    vivos (1:1 con el API: `fila: FilaPagoSocio | null`). */
export interface ResultadoPagoSocio {
  pago: PagoSocio;
  fila: FilaPagoSocio | null;
  idempotente?: boolean;
}

/** Respuesta de la baja (soft delete). `fila` null: el socio ya no está en
    el reparto y era su único pago vivo. */
export interface ResultadoBajaPagoSocio {
  deleted: true;
  fila: FilaPagoSocio | null;
}

/** Respuesta de la subida del comprobante. */
export interface ResultadoComprobantePagoSocio {
  pago: PagoSocio;
}

/** `details` del 409 `PAGO_EXCEDE_UTILIDAD`. */
export interface DetalleExcesoPago {
  utilidad_usd: number;
  pagado_usd: number;
  monto_usd: number;
  exceso_usd: number;
}

/** Renglón del pre-cierre `pagos_socios_pendientes` (máx. 50). El API puede
    mandar `socio`/`aeronave` como objeto o como texto: se toleran ambos. */
export interface PreCierreSocioPendiente {
  socio: SocioRef | string | null;
  aeronave: (Partial<AeronaveRef> & { id?: string }) | string | null;
  pendiente_usd: number;
  estado: EstadoPagoSocio | (string & {});
}
