/**
 * CORREOS AL CLIENTE (9-nov-2026, API 0.0.133).
 *
 * Pedido de la oficina: «que se cancele el envío automático a los clientes;
 * que solo se mande cuando ellos le den en enviar de forma manual, solo si se
 * requiere, y saber si se mandó o no y con qué contenido». Hasta ese día el
 * API mandaba SOLO un «Vuelo confirmado» al confirmar la cotización; desde el
 * 0.0.133 no manda nada por su cuenta y cada envío (bueno o fallido) queda
 * registrado con el contenido EXACTO que salió.
 *
 * Tipos 1:1 con el contrato del API (`/v1/quotes/:id/correos`,
 * `/v1/quotes/:id/correo-confirmacion`, `/v1/quotes/correos`). Textos y reglas
 * de pantalla: `lib/admin/correo-cliente.ts` (fuente única, pura).
 */

/** Hoy solo existe la confirmación del vuelo; el API puede sumar tipos. */
export type TipoCorreoCliente = "CONFIRMACION_VUELO";

export type EstadoCorreoCliente = "ENVIADO" | "FALLIDO";

/** Un correo que se le mandó (o se intentó mandar) al cliente. */
export interface CorreoCliente {
  id: string;
  vuelo_id: string;
  folio: number | null;
  tipo: TipoCorreoCliente;
  cliente_nombre: string | null;
  /** Correo del cliente al que se mandó. */
  destinatario: string;
  /** «VuelaTour <notificaciones@…>»: desde qué correo salió. */
  remitente: string | null;
  asunto: string;
  /** Contenido EXACTO que se mandó (se pinta SOLO en un iframe aislado). */
  html: string;
  /** Versión en texto plano. */
  texto: string | null;
  estado: EstadoCorreoCliente;
  /** Motivo cuando el estado es FALLIDO. */
  error: string | null;
  /** uuid de quien pulsó «Enviar» (nunca se pinta). */
  enviado_por: string | null;
  enviado_por_nombre: string | null;
  /** ISO. */
  created_at: string;
}

/** `GET /v1/quotes/:id/correos` (más reciente primero). */
export interface CorreosDeVueloResponse {
  correos: CorreoCliente[];
}

/** Por qué el API no deja enviar (el texto legible llega en `motivo`). */
export type CodigoCorreoNoEnviable =
  | "SIN_CLIENTE"
  | "SIN_EMAIL"
  | "ESTADO_NO_CONFIRMADO"
  | "CORREO_APAGADO";

export interface UltimoEnvioCorreo {
  created_at: string;
  enviado_por_nombre: string | null;
  destinatario: string;
}

/**
 * `GET /v1/quotes/:id/correo-confirmacion`: lo que se MANDARÍA (no envía
 * nada). Con `puede_enviar: false` el API dice por qué (`codigo` + `motivo`).
 */
export interface VistaPreviaCorreoConfirmacion {
  puede_enviar: boolean;
  codigo: CodigoCorreoNoEnviable | null;
  /** Texto es-MX listo para pintar cuando no se puede enviar. */
  motivo: string | null;
  destinatario: string | null;
  remitente: string | null;
  cliente_nombre: string | null;
  asunto: string;
  html: string;
  texto: string;
  /** Cuántos ENVIADO lleva este vuelo. */
  enviados: number;
  ultimo_envio: UltimoEnvioCorreo | null;
}

/**
 * `POST /v1/quotes/:id/correo-confirmacion` (200). `enviado: false` = el
 * proveedor falló: quedó registrado como FALLIDO y `correo.error` dice por qué.
 */
export interface EnvioCorreoConfirmacion {
  enviado: boolean;
  mensaje: string;
  correo: CorreoCliente | null;
}

/** `GET /v1/quotes/correos?desde&hasta&limite` (default: últimos 90 días, hora Cancún). */
export interface CorreosEnviadosResponse {
  correos: CorreoCliente[];
  /** Hay más correos en el periodo que los que caben en `limite`. */
  truncado: boolean;
  /** Rango EFECTIVO que aplicó el API (`YYYY-MM-DD`). */
  desde: string;
  hasta: string;
}

/**
 * Resultado de LEER los correos (historial de un vuelo o la lista general).
 * Cuatro estados a propósito — jamás «no se ha enviado nada» cuando la
 * lectura falló:
 *  - `ok`: la lectura buena (la lista puede ir vacía).
 *  - `no-disponible`: el API todavía no tiene la ruta (sin desplegar).
 *  - `sin-acceso`: el rol no puede verlos (401/403): recargar no lo arregla.
 *  - `error`: cualquier otra falla (502 del deploy, red, 500).
 */
export type CargaCorreos<T> =
  | { estado: "ok"; datos: T }
  | { estado: "no-disponible" }
  | { estado: "sin-acceso" }
  | { estado: "error" };

export type CargaCorreosDeVuelo = CargaCorreos<CorreoCliente[]>;
export type CargaCorreosEnviados = CargaCorreos<CorreosEnviadosResponse>;
