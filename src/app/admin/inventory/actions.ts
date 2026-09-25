"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  EditarCostoSchema,
  EmpaqueFormSchema,
  EmpaqueUpdateSchema,
  ItemFormSchema,
  MotivoEliminacionSchema,
  MovimientoFormSchema,
  normalizarCodigo,
} from "./schema";
import type {
  CodigoLookup,
  CompraExtraida,
  EliminacionMovimientoPreview,
  EliminarMovimientoResultado,
  ImportarItemsResultado,
  InventarioEmpaque,
  InventarioItem,
  InventarioMovimiento,
  InventarioUbicacion,
  MoverUbicacionResultado,
} from "@/types/inventory";
import {
  NOMBRE_UBICACION_MAX,
  NOMBRE_UBICACION_MIN,
  TOPE_MOVER_UBICACION,
} from "@/lib/admin/inventario-ubicacion";
import { esUuid } from "@/lib/admin/url-params";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** HTTP del API cuando falló (404 = no existe, 409 = conflicto…). */
  status?: number;
  /**
   * `code` ESTABLE del API cuando falló (MOVIMIENTO_DE_COMPRA,
   * STOCK_NEGATIVO, MIGRACION_PENDIENTE…): la UI decide por el código, nunca
   * por el texto del mensaje. Aditivo.
   */
  code?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) {
    return { ok: false, error: err.message, status: err.status, code: err.code };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined) continue;
    out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/**
 * Campos de texto que al EDITAR deben poder VACIARSE: el "" se descarta en
 * stripEmpty (no borraría nada), así que se manda null explícito. Sin esto un
 * ítem con `unidad` mal capturada (caso real "1") era irreparable desde el
 * panel: vaciar el campo devolvía "Ítem actualizado" sin cambiar nada.
 * `ubicacion` (texto) NO va aquí: con un API previo es NOT NULL en BD y
 * mandar null era un 500 — vacío = se conserva la actual (el form lo avisa).
 * Con el catálogo (25-sep-2026) «Sin ubicación» viaja como `ubicacion_id:
 * null` explícito, que `stripEmpty` deja pasar (solo tira "" y undefined).
 */
const BORRABLES = [
  "unidad",
  "numero_parte",
  "codigo",
  "notas",
  "marca",
  "descripcion",
  // Numérico-como-texto en el form: vaciar el precio de venta = quitarlo
  // (el API limpia también su moneda; las salidas vuelven a costo FIFO).
  "precio_venta",
] as const;

function conBorrados(
  raw: Record<string, unknown>,
  limpio: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...limpio };
  for (const k of BORRABLES) {
    if (typeof raw[k] === "string" && raw[k].trim() === "") out[k] = null;
  }
  return out;
}

export async function createItemAction(raw: unknown): Promise<ActionResult<InventarioItem>> {
  const parsed = ItemFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<InventarioItem>("/v1/inventory/items", {
      method: "POST",
      body: stripEmpty(parsed.data),
    });
    revalidatePath("/admin/inventory");
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateItemAction(
  id: string,
  raw: unknown,
): Promise<ActionResult<InventarioItem>> {
  const parsed = ItemFormSchema.partial().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    // Los empaques NO viajan en el PATCH: al editar se administran uno por
    // uno con los endpoints de empaques (create/update/deleteEmpaqueAction).
    const { empaques: _empaques, ...sinEmpaques } = parsed.data;
    void _empaques;
    const updated = await apiServer<InventarioItem>(`/v1/inventory/items/${id}`, {
      method: "PATCH",
      // Vaciar un campo borrable manda null (stripEmpty se come el "").
      body: conBorrados(
        sinEmpaques as Record<string, unknown>,
        stripEmpty(sinEmpaques),
      ),
    });
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteItemAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/inventory/items/${id}`, { method: "DELETE" });
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function extraerCompraAction(
  pdfBase64: string,
): Promise<ActionResult<CompraExtraida>> {
  try {
    const data = await apiServer<CompraExtraida>("/v1/inventory/compras/extraer", {
      method: "POST",
      body: { pdf_base64: pdfBase64 },
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export interface ImportarLinea {
  nombre: string;
  numero_parte?: string;
  categoria: string;
  cantidad: number;
  costo_unitario_usd: number;
}

export interface ImportarCompraResultado {
  items_creados: number;
  entradas: number;
  /** Compra creada a partir del PDF (si el API la registra): el diálogo
   *  ofrece "Ver compra". Opcional por skew de deploy. */
  compra_id?: string | null;
}

export async function importarCompraAction(payload: {
  proveedor_id?: string;
  fecha_orden?: string;
  referencia?: string;
  /** Moneda de los costos de las líneas (MXN default operativo); con MXN, tc obligatorio. */
  moneda?: "MXN" | "USD";
  tc_usd_mxn?: number;
  lineas: ImportarLinea[];
}): Promise<ActionResult<ImportarCompraResultado>> {
  try {
    const data = await apiServer<ImportarCompraResultado>(
      "/v1/inventory/compras/importar",
      { method: "POST", body: payload },
    );
    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/compras");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function createMovimientoAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult<InventarioMovimiento>> {
  const parsed = MovimientoFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<InventarioMovimiento>(
      `/v1/inventory/items/${itemId}/movimientos`,
      { method: "POST", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Corrige el COSTO de una ENTRADA de cardex (carga masiva a $0). El API
 * valida los candados (nace de compra / capa FIFO ya consumida) y sus 409 ya
 * explican el porqué: el mensaje viaja tal cual al toast.
 */
export async function updateMovimientoCostoAction(
  itemId: string,
  movId: string,
  raw: unknown,
): Promise<ActionResult<InventarioMovimiento>> {
  const parsed = EditarCostoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const updated = await apiServer<InventarioMovimiento>(
      `/v1/inventory/items/${itemId}/movimientos/${movId}`,
      { method: "PATCH", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

// ───────────────── Baja de un movimiento de cardex ─────────────────

/**
 * VISTA PREVIA de la baja (ADMIN, solo lee): qué se eliminaría, cómo queda la
 * existencia y qué gastos de bodega se van con el movimiento — o por qué NO
 * se puede. El diálogo la pide al abrirse: nunca se enseña un botón de
 * eliminar sin haber preguntado antes al API.
 */
export async function previewEliminarMovimientoAction(
  itemId: string,
  movId: string,
): Promise<ActionResult<EliminacionMovimientoPreview>> {
  try {
    const data = await apiServer<EliminacionMovimientoPreview>(
      `/v1/inventory/items/${itemId}/movimientos/${movId}/eliminacion`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Baja del movimiento con JUSTIFICACIÓN (SOLO ADMIN). El API re-evalúa TODOS
 * los candados y borra en UNA transacción de BD (movimiento + sus gastos de
 * bodega + la fila de auditoría): sus 409 con `code` estable y su 503
 * (migración pendiente) llegan al diálogo tal cual para decidir por CÓDIGO.
 * Se revalidan también los gastos: la baja borra gastos REFACCION/BODEGA.
 */
export async function eliminarMovimientoAction(
  itemId: string,
  movId: string,
  motivoRaw: unknown,
): Promise<ActionResult<EliminarMovimientoResultado>> {
  const parsed = MotivoEliminacionSchema.safeParse({ motivo: motivoRaw });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const data = await apiServer<EliminarMovimientoResultado>(
      `/v1/inventory/items/${itemId}/movimientos/${movId}`,
      { method: "DELETE", body: { motivo: parsed.data.motivo } },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    // El movimiento pudo generar gastos del avión (SALIDA a BODEGA): al
    // borrarlos, las pantallas de dinero también cambian.
    revalidatePath("/admin/expenses");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ───────────────── Código de barras ─────────────────

/**
 * Busca a qué corresponde un código de barras (unidad de un ítem o empaque
 * de un ítem). 404 → `status: 404` con "Código no registrado" para que la UI
 * ofrezca dar de alta con ese código.
 */
export async function buscarPorCodigoAction(
  codigoRaw: string,
): Promise<ActionResult<CodigoLookup>> {
  const codigo = normalizarCodigo(codigoRaw);
  if (!codigo) return { ok: false, error: "Escribe o escanea un código" };
  try {
    const data = await apiServer<CodigoLookup>(
      `/v1/inventory/codigo/${encodeURIComponent(codigo)}`,
      { cache: "no-store" },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ───────────────── Empaques (cajas) ─────────────────

export async function createEmpaqueAction(
  itemId: string,
  raw: unknown,
): Promise<ActionResult<InventarioEmpaque>> {
  const parsed = EmpaqueFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const created = await apiServer<InventarioEmpaque>(
      `/v1/inventory/items/${itemId}/empaques`,
      { method: "POST", body: stripEmpty(parsed.data) },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true, data: created };
  } catch (err) {
    return fail(err);
  }
}

export async function updateEmpaqueAction(
  itemId: string,
  empaqueId: string,
  raw: unknown,
): Promise<ActionResult<InventarioEmpaque>> {
  const parsed = EmpaqueUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const body: Record<string, unknown> = stripEmpty(parsed.data);
    // Vaciar el código del empaque = quitarlo (stripEmpty se come el "").
    if (typeof (raw as { codigo?: unknown })?.codigo === "string" && parsed.data.codigo === "") {
      body.codigo = null;
    }
    const updated = await apiServer<InventarioEmpaque>(
      `/v1/inventory/items/${itemId}/empaques/${empaqueId}`,
      { method: "PATCH", body },
    );
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true, data: updated };
  } catch (err) {
    return fail(err);
  }
}

/** 409 del API = el empaque ya tiene movimientos: hay que desactivarlo en vez de borrarlo. */
export async function deleteEmpaqueAction(
  itemId: string,
  empaqueId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/inventory/items/${itemId}/empaques/${empaqueId}`, {
      method: "DELETE",
    });
    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${itemId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ───────────────── Ubicaciones de bodega (25-sep-2026) ─────────────────

/**
 * Alta de una ubicación del catálogo (ADMIN/MECANICO). El API valida el
 * nombre (2–50, recortado) y los duplicados sin acentos ni mayúsculas (409
 * `UBICACION_DUPLICADA`, con su mensaje en es-MX que se pinta tal cual).
 */
export async function crearUbicacionAction(
  nombre: string,
): Promise<ActionResult<InventarioUbicacion>> {
  const limpio = (nombre ?? "").trim().replace(/\s+/g, " ");
  if (limpio.length < NOMBRE_UBICACION_MIN || limpio.length > NOMBRE_UBICACION_MAX) {
    return {
      ok: false,
      error: `El nombre va de ${NOMBRE_UBICACION_MIN} a ${NOMBRE_UBICACION_MAX} caracteres.`,
    };
  }
  try {
    const data = await apiServer<InventarioUbicacion>("/v1/inventory/ubicaciones", {
      method: "POST",
      body: { nombre: limpio },
    });
    revalidatePath("/admin/inventory");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Renombrar / reordenar / activar-desactivar una ubicación. Renombrar
 * propaga el texto a sus productos (trigger de la BD). Desactivar con
 * productos activos responde 409 `UBICACION_EN_USO` (el diálogo ya lo
 * impide; el API es el candado real).
 */
export async function actualizarUbicacionAction(
  id: string,
  cambios: { nombre?: string; orden?: number; activo?: boolean },
): Promise<ActionResult<InventarioUbicacion>> {
  if (!esUuid(id)) return { ok: false, error: "La ubicación ya no existe." };
  const body: Record<string, unknown> = {};
  if (cambios.nombre !== undefined) {
    const limpio = cambios.nombre.trim().replace(/\s+/g, " ");
    if (limpio.length < NOMBRE_UBICACION_MIN || limpio.length > NOMBRE_UBICACION_MAX) {
      return {
        ok: false,
        error: `El nombre va de ${NOMBRE_UBICACION_MIN} a ${NOMBRE_UBICACION_MAX} caracteres.`,
      };
    }
    body.nombre = limpio;
  }
  if (cambios.orden !== undefined) {
    if (!Number.isInteger(cambios.orden) || cambios.orden < 0 || cambios.orden > 999) {
      return { ok: false, error: "El orden va de 0 a 999." };
    }
    body.orden = cambios.orden;
  }
  if (cambios.activo !== undefined) body.activo = cambios.activo;
  if (Object.keys(body).length === 0) return { ok: false, error: "No hay cambios que guardar." };
  try {
    const data = await apiServer<InventarioUbicacion>(`/v1/inventory/ubicaciones/${id}`, {
      method: "PATCH",
      body,
    });
    revalidatePath("/admin/inventory");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Mover productos en lote a una ubicación (ADMIN/MECANICO): UN solo update
 * en el API. No mueve stock ni dinero. Ids que ya no aplican (dados de baja,
 * inexistentes) NO son error: vienen en `no_encontrados`/`inactivos`.
 */
export async function moverUbicacionAction(
  itemIds: string[],
  ubicacionId: string,
): Promise<ActionResult<MoverUbicacionResultado>> {
  const ids = [...new Set((itemIds ?? []).filter((x) => esUuid(x)))];
  if (!esUuid(ubicacionId)) return { ok: false, error: "Elige a qué ubicación moverlos." };
  if (ids.length === 0) return { ok: false, error: "No hay productos que mover." };
  if (ids.length > TOPE_MOVER_UBICACION) {
    return {
      ok: false,
      error: `Se pueden mover hasta ${TOPE_MOVER_UBICACION} productos a la vez; acota la lista con el buscador o el filtro.`,
    };
  }
  try {
    const data = await apiServer<MoverUbicacionResultado>(
      "/v1/inventory/items/mover-ubicacion",
      { method: "POST", body: { item_ids: ids, ubicacion_id: ubicacionId } },
    );
    revalidatePath("/admin/inventory");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ───────────────── Alta masiva (Excel) ─────────────────

/**
 * Alta masiva de ítems desde la plantilla: con `confirmar=false` el API solo
 * valida (preview fila por fila); con `confirmar=true` crea SOLO las filas OK
 * (ítem + empaque + entrada inicial) de forma idempotente — un reintento
 * marca DUPLICADO lo que ya existe, no lo duplica.
 */
export async function importarItemsAction(input: {
  archivo_base64: string;
  filename: string;
  confirmar: boolean;
}): Promise<ActionResult<ImportarItemsResultado>> {
  try {
    const data = await apiServer<ImportarItemsResultado>("/v1/inventory/items/importar", {
      method: "POST",
      body: input,
    });
    if (input.confirmar) revalidatePath("/admin/inventory");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
