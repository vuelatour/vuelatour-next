/**
 * SEGUIMIENTO DE LA COTIZACIÓN (29-sep-2026, API 0.0.43 · tabla
 * `vuelo_seguimiento`). Pedido del cliente con la captura del vuelo #358:
 * «Pablo ya terminó el vuelito de hoy y los pax pidieron un transporte el
 * cual no está incluido en la cotización pero se necesita cobrar». La oficina
 * anota el ajuste en el detalle del vuelo y le da SEGUIMIENTO (PENDIENTE →
 * RESUELTA) hasta reflejarlo en la cotización.
 *
 * Solo la FORMA del contrato (1:1 con `GET /v1/flights/:id/seguimiento`).
 * Textos, orden, roles y tolerancia al API previo viven en
 * `lib/admin/seguimiento.ts`.
 */

/** String a propósito en la unión: un estado nuevo del API no rompe el tipado. */
export type EstadoSeguimiento = "PENDIENTE" | "RESUELTA";

/** Usuario resuelto por el API (quién anotó / quién resolvió). Usuario
    borrado ⇒ `{ id: null, nombre: null }` (jamás un uuid como nombre). */
export interface SeguimientoUsuario {
  id: string | null;
  nombre: string | null;
}

/** Una nota de seguimiento del vuelo (las borradas nunca llegan). */
export interface SeguimientoNota {
  id: string;
  vuelo_id?: string;
  texto: string;
  /** true = hay que reflejarla en la cotización (entra al banner y al pre-cierre). */
  afecta_cotizacion: boolean;
  estado: EstadoSeguimiento | (string & {});
  created_at: string;
  updated_at?: string | null;
  creado_por: SeguimientoUsuario | null;
  resuelta_at: string | null;
  resuelta_por: SeguimientoUsuario | null;
  /** «¿Cómo se resolvió?» (opcional, ≤500). */
  resolucion: string | null;
}

/** `POST /v1/flights/:id/seguimiento`. */
export interface CrearSeguimientoPayload {
  texto: string;
  afecta_cotizacion?: boolean;
}

/** `PATCH /v1/flights/seguimiento/:notaId` (RESUELTA sella quién/cuándo; PENDIENTE los limpia). */
export interface PatchSeguimientoPayload {
  estado?: EstadoSeguimiento;
  resolucion?: string | null;
  texto?: string;
  afecta_cotizacion?: boolean;
}

/**
 * Pendiente que viaja en la vista de la cotización
 * (`seguimiento_pendientes_detalle`): solo las que afectan la cotización,
 * máx. 20.
 */
export interface SeguimientoPendienteDetalle {
  id: string;
  texto: string;
  created_at: string;
  creado_por_nombre: string | null;
}

/**
 * Contadores ADITIVOS (detalle del vuelo, snapshot y vista de la
 * cotización). AUSENTES = API previo al 0.0.43: el panel se comporta como
 * antes (sin badge ni banner). Nunca se deducen en el panel.
 */
export interface SeguimientoContadores {
  /** Notas PENDIENTE no borradas. */
  seguimiento_pendientes?: number | null;
  /** Las PENDIENTE con `afecta_cotizacion`. */
  seguimiento_cotizacion_pendientes?: number | null;
}
