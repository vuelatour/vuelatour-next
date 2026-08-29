"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import {
  EditarCostoSchema,
  EmpaqueFormSchema,
  EmpaqueUpdateSchema,
  ItemFormSchema,
  MovimientoFormSchema,
  normalizarCodigo,
} from "./schema";
import type {
  CodigoLookup,
  CompraExtraida,
  ImportarItemsResultado,
  InventarioEmpaque,
  InventarioItem,
  InventarioMovimiento,
} from "@/types/inventory";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** HTTP del API cuando falló (404 = no existe, 409 = conflicto…). */
  status?: number;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message, status: err.status };
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
 * `ubicacion` NO va aquí: es NOT NULL en BD (default 'Bodega Cancún') y
 * mandar null era un 500 — vacío = se conserva la actual (el form lo avisa).
 */
const BORRABLES = [
  "unidad",
  "numero_parte",
  "codigo",
  "notas",
  "marca",
  "descripcion",
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
