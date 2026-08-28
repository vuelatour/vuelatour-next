"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { ItemFormSchema, MovimientoFormSchema } from "./schema";
import type {
  CompraExtraida,
  InventarioItem,
  InventarioMovimiento,
} from "@/types/inventory";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
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
 */
const BORRABLES = ["unidad", "numero_parte", "codigo", "notas"] as const;

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
    const updated = await apiServer<InventarioItem>(`/v1/inventory/items/${id}`, {
      method: "PATCH",
      // Vaciar un campo borrable manda null (stripEmpty se come el "").
      body: conBorrados(
        parsed.data as Record<string, unknown>,
        stripEmpty(parsed.data),
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
