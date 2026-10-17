/**
 * AFAC por vuelo (16-oct-2026, API 0.0.89, invariante 90 del API).
 *
 * Respuesta de `PUT /v1/flights/:id/afac-real` (capturar el costo real AFAC
 * del vuelo, en pesos) y de `DELETE /v1/flights/:id/afac-real` («quitar» =
 * el vuelo vuelve a «sin capturar»; el API nunca borra la fila, la deja en
 * null y su bitácora registra QUITADO). Roles: ADMIN, FACTURACION y
 * COORDINADOR (`ROLES_AFAC_REAL`). Candado 409 `MES_CERRADO` por el mes
 * CONTABLE del vuelo. Se lee SIEMPRE con `lib/admin/libro-afac.ts`.
 */
export interface RespuestaAfacReal {
  vuelo_id: string;
  folio: number | null;
  /** null = sin capturar. PostgREST puede mandar el numeric como texto. */
  costo_real_mxn: number | string | null;
  notas: string | null;
  capturado_por: { id: string; nombre: string | null } | null;
  capturado_at: string | null;
  updated_at: string | null;
  /** «AAAA-MM» contable del vuelo. */
  mes_contable: string | null;
  /** true = ya estaba así: el API no escribió (idempotente). */
  sin_cambios: boolean;
}
