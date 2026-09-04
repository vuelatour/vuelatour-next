"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type {
  ArmadoGrupo,
  ArmarGrupoInput,
  CreateCobroGrupoInput,
  CreateGrupoInput,
  EliminacionCobroGrupo,
  GrupoActionResult,
  GrupoDetalle,
  PrevisualizacionCobro,
  ReemplazarAvionInput,
  RegistroCobroGrupo,
  RepartoCobroGrupo,
  ReviseGrupoInput,
} from "@/types/grupos";

/**
 * Server actions de la cotización de GRUPO — TODAS las escrituras de
 * `/v1/grupos`. Nunca lanzan: devuelven `{ ok: true, data }` o
 * `{ ok: false, error: GrupoApiError }` con el código estructurado del API
 * (CAPACIDAD_EXCEDIDA, PAX_NO_CUADRAN, PILOTO_DUPLICADO, HIJOS_CONGELADOS,
 * REVISION_A_MEDIAS…) y sus `details`, para que la UI reaccione sin regex
 * sobre el mensaje (texto es-MX: `mensajeErrorGrupo` de
 * `@/lib/admin/grupos-ui`). El PDF va por el route handler
 * `/api/grupos/[id]/pdf` (binario; no cabe en una action).
 *
 * `apiServer` ya serializa el body: pasar objetos, NUNCA JSON.stringify.
 */

const RUTA_LISTA = "/admin/quotes/grupo";

function fallo<T>(err: unknown): GrupoActionResult<T> {
  if (isApiError(err)) {
    return {
      ok: false,
      error: { message: err.message, error: err.code, details: err.details, status: err.status },
    };
  }
  return {
    ok: false,
    error: {
      message: err instanceof Error ? err.message : "Error desconocido",
      error: "ERROR_DESCONOCIDO",
      status: 0,
    },
  };
}

/** Rechazo local antes de llamar al API (mismo shape que un 400). */
function invalido<T>(message: string): GrupoActionResult<T> {
  return { ok: false, error: { message, error: "VALIDACION", status: 400 } };
}

/**
 * Revalida la lista y el detalle del grupo, la lista de cotizaciones y —
 * porque cada hijo es un vuelo real — la lista de vuelos y el detalle de
 * cada hijo (badge de grupo, precio, estado).
 */
function revalidarGrupo(id: string | null, detalle?: GrupoDetalle | null) {
  revalidatePath("/admin/quotes");
  revalidatePath(RUTA_LISTA);
  revalidatePath("/admin/flights");
  if (id) revalidatePath(`${RUTA_LISTA}/${id}`);
  for (const a of detalle?.aviones ?? []) {
    revalidatePath(`/admin/quotes/${a.vuelo_id}`);
    revalidatePath(`/admin/flights/${a.vuelo_id}`);
  }
}

/**
 * Tras tocar un SOBRE: el grupo, sus listas y cada vuelo hijo que recibió o
 * perdió una parte (su card de cobros, saldo y semáforo cambian), más la
 * conciliación (el banco enlaza al sobre).
 */
function revalidarSobre(grupoId: string | null, vueloIds: Iterable<string>) {
  revalidarGrupo(grupoId);
  revalidatePath("/admin/conciliacion");
  for (const v of new Set(vueloIds)) {
    revalidatePath(`/admin/quotes/${v}`);
    revalidatePath(`/admin/flights/${v}`);
  }
}

/** Validación local mínima del sobre (mismo shape que un 400 del API). */
function validarSobre<T>(payload: CreateCobroGrupoInput): GrupoActionResult<T> | null {
  if (!Number.isFinite(payload.monto) || payload.monto === 0) {
    return invalido("Captura el monto del cobro (distinto de 0).");
  }
  if (!payload.moneda) return invalido("Elige la moneda.");
  if (!payload.metodo_cobro) return invalido("Elige el método de cobro.");
  if (payload.modo === "MANUAL" && !(payload.particion_manual?.length)) {
    return invalido("Captura al menos una parte por avión para partir a mano.");
  }
  return null;
}

/**
 * PREVIEW (POST /v1/grupos/armar): no escribe. Sin `aviones` el server
 * propone flota; devuelve N cálculos + consolidado + capacidad + pilotos.
 * No revalida nada.
 */
export async function armarGrupoAction(
  payload: ArmarGrupoInput,
): Promise<GrupoActionResult<ArmadoGrupo>> {
  if (!payload.cliente_id) return invalido("Elige el cliente.");
  if (!payload.fecha_vuelo) return invalido("Captura la fecha de salida del grupo.");
  if (!(payload.pasajeros_total >= 1)) return invalido("Captura cuántos pasajeros son.");
  if (!payload.escalas_plantilla?.length) return invalido("Captura la ruta del grupo.");
  try {
    const data = await apiServer<ArmadoGrupo>("/v1/grupos/armar", {
      method: "POST",
      body: payload,
    });
    return { ok: true, data };
  } catch (err) {
    return fallo(err);
  }
}

/** Crea cabecera + N hijos (compensación total si falla uno). */
export async function createGrupoAction(
  payload: CreateGrupoInput,
): Promise<GrupoActionResult<GrupoDetalle>> {
  if (!payload.cliente_id) return invalido("Elige el cliente.");
  if (!payload.nombre || payload.nombre.trim().length < 2) {
    return invalido("Ponle un nombre al grupo (mínimo 2 caracteres).");
  }
  if (!payload.aviones?.length) return invalido("Agrega al menos un avión al grupo.");
  try {
    const data = await apiServer<GrupoDetalle>("/v1/grupos", {
      method: "POST",
      body: payload,
    });
    revalidarGrupo(data.id, data);
    return { ok: true, data };
  } catch (err) {
    return fallo(err);
  }
}

/**
 * Revisión del grupo (cabecera + aviones). Ante 409 REVISION_A_MEDIAS el
 * reintento debe mandar `error.details.creados[]` con su `vuelo_id` en
 * `aviones[]` para no cancelar/recrear los hijos que sí se crearon.
 */
export async function reviseGrupoAction(
  id: string,
  payload: ReviseGrupoInput,
): Promise<GrupoActionResult<GrupoDetalle>> {
  if (!payload.motivo || payload.motivo.trim().length < 3) {
    return invalido("Escribe el motivo de la revisión (mínimo 3 caracteres).");
  }
  try {
    const data = await apiServer<GrupoDetalle>(`/v1/grupos/${id}/revise`, {
      method: "POST",
      body: payload,
    });
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    // A medias: la cabecera y parte de los hijos SÍ cambiaron.
    revalidarGrupo(id);
    return fallo(err);
  }
}

/** RESERVA → COTIZADO → confirma TODOS los hijos vivos. */
export async function confirmGrupoAction(id: string): Promise<GrupoActionResult<GrupoDetalle>> {
  try {
    const data = await apiServer<GrupoDetalle>(`/v1/grupos/${id}/confirm`, {
      method: "POST",
    });
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}

/** Cancela el grupo: N × cancel de hijos + cabecera. Destructivo: la UI
 *  confirma antes (type-to-confirm con el folio). */
export async function cancelGrupoAction(
  id: string,
  motivo: string,
): Promise<GrupoActionResult<GrupoDetalle>> {
  if (!motivo || motivo.trim().length < 3) {
    return invalido("Escribe el motivo de la cancelación (mínimo 3 caracteres).");
  }
  try {
    const data = await apiServer<GrupoDetalle>(`/v1/grupos/${id}/cancel`, {
      method: "POST",
      body: { motivo: motivo.trim() },
    });
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}

/** Reagenda el grupo (ISO; cada hijo conserva su desfase escalonado). */
export async function fechaGrupoAction(
  id: string,
  fecha_vuelo: string,
): Promise<GrupoActionResult<GrupoDetalle>> {
  if (!fecha_vuelo) return invalido("Captura la nueva fecha de salida.");
  try {
    const data = await apiServer<GrupoDetalle>(`/v1/grupos/${id}/fecha`, {
      method: "PATCH",
      body: { fecha_vuelo },
    });
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}

/** Quita un avión del grupo (cancela el hijo y re-reparte extras/ajuste). */
export async function quitarAvionAction(
  id: string,
  vueloId: string,
  motivo?: string,
): Promise<GrupoActionResult<GrupoDetalle>> {
  try {
    const data = await apiServer<GrupoDetalle>(`/v1/grupos/${id}/aviones/${vueloId}`, {
      method: "DELETE",
      // Siempre un objeto: el DTO es opcional pero el body no debe faltar.
      body: motivo?.trim() ? { motivo: motivo.trim() } : {},
    });
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}

/** Cambia el avión de un hijo (SIMPLE o ULTIMO_MINUTO, recotizar opcional). */
export async function reemplazarAvionAction(
  id: string,
  vueloId: string,
  payload: ReemplazarAvionInput,
): Promise<GrupoActionResult<GrupoDetalle>> {
  if (!payload.aeronave_id) return invalido("Elige el avión nuevo.");
  try {
    const data = await apiServer<GrupoDetalle>(
      `/v1/grupos/${id}/aviones/${vueloId}/reemplazar`,
      { method: "POST", body: payload },
    );
    revalidarGrupo(id, data);
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}


// =====================================================================
// SOBRE de cobro del grupo (Fase 2, 4-sep-2026)
// =====================================================================

/**
 * VISTA PREVIA de la partición (POST /v1/grupos/:id/cobros/previsualizar):
 * no escribe. Devuelve modo detectado, partes por avión con saldo
 * antes/después, verificación Σ y avisos (sobrepago…). No revalida nada.
 * Los 400/409 de partición (SIN_TC, REEMBOLSO_EXCEDE, PARTICION_NO_CUADRA,
 * HIJO_INVALIDO, COMISION_INVALIDA) llegan tipados en `error.error`.
 */
export async function previsualizarCobroGrupoAction(
  id: string,
  payload: CreateCobroGrupoInput,
): Promise<GrupoActionResult<PrevisualizacionCobro>> {
  const inv = validarSobre<PrevisualizacionCobro>(payload);
  if (inv) return inv;
  try {
    // La llave de idempotencia no aplica a una vista previa.
    const { client_request_id: _crid, ...body } = payload;
    void _crid;
    const data = await apiServer<PrevisualizacionCobro>(
      `/v1/grupos/${id}/cobros/previsualizar`,
      { method: "POST", body },
    );
    return { ok: true, data };
  } catch (err) {
    return fallo(err);
  }
}

/**
 * REGISTRA el sobre y lo parte en N cobro_vuelo (POST /v1/grupos/:id/cobros).
 * Mandar SIEMPRE `client_request_id` (uuid generado al abrir el diálogo):
 * un reintento devuelve el sobre ya registrado con `idempotente: true`
 * (200) sin duplicar dinero. Si falla una parte, el API compensa y responde
 * 409 con texto claro; ante ese caso también se revalida (por si quedó a
 * medias: findOne lo avisa).
 */
export async function registrarCobroGrupoAction(
  id: string,
  payload: CreateCobroGrupoInput,
): Promise<GrupoActionResult<RegistroCobroGrupo>> {
  const inv = validarSobre<RegistroCobroGrupo>(payload);
  if (inv) return inv;
  try {
    const data = await apiServer<RegistroCobroGrupo>(`/v1/grupos/${id}/cobros`, {
      method: "POST",
      body: payload,
    });
    revalidarSobre(id, data.sobre.partes.map((p) => p.vuelo_id));
    return { ok: true, data };
  } catch (err) {
    revalidarGrupo(id);
    return fallo(err);
  }
}

/**
 * ELIMINA el sobre y sus N partes (DELETE /v1/grupos/cobros/:cobroGrupoId).
 * Destructivo: la UI confirma antes. 409 COBRO_CONCILIADO si el banco lo
 * enlaza (desvincular primero); 409 MES_CERRADO si una parte está en un
 * hijo de mes cerrado. `grupoId` solo se usa para revalidar el detalle.
 */
export async function eliminarCobroGrupoAction(
  cobroGrupoId: string,
  grupoId?: string | null,
): Promise<GrupoActionResult<EliminacionCobroGrupo>> {
  if (!cobroGrupoId) return invalido("Cobro del grupo inválido.");
  try {
    const data = await apiServer<EliminacionCobroGrupo>(`/v1/grupos/cobros/${cobroGrupoId}`, {
      method: "DELETE",
    });
    revalidarSobre(data.grupo_id ?? grupoId ?? null, data.vuelos ?? []);
    return { ok: true, data };
  } catch (err) {
    if (grupoId) revalidarGrupo(grupoId);
    return fallo(err);
  }
}

/**
 * RE-PARTE el sobre SOLO entre los aviones vivos con la regla AUTO
 * (POST /v1/grupos/cobros/:cobroGrupoId/repartir): tras quitar o
 * reemplazar un avión. La conciliación no se toca (el banco enlaza al
 * sobre). Un sobre MANUAL pasa a la regla AUTO (el API lo avisa).
 * `vueloIdsPrevios` = hijos que HOY tienen parte (para revalidar a los que
 * la pierdan, p. ej. cancelados).
 */
export async function repartirCobroGrupoAction(
  cobroGrupoId: string,
  grupoId?: string | null,
  vueloIdsPrevios: string[] = [],
): Promise<GrupoActionResult<RepartoCobroGrupo>> {
  if (!cobroGrupoId) return invalido("Cobro del grupo inválido.");
  try {
    const data = await apiServer<RepartoCobroGrupo>(
      `/v1/grupos/cobros/${cobroGrupoId}/repartir`,
      { method: "POST" },
    );
    revalidarSobre(data.sobre.grupo_id ?? grupoId ?? null, [
      ...vueloIdsPrevios,
      ...data.sobre.partes.map((p) => p.vuelo_id),
    ]);
    return { ok: true, data };
  } catch (err) {
    if (grupoId) revalidarGrupo(grupoId);
    return fallo(err);
  }
}
