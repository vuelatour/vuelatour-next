"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { listGastos } from "@/lib/api/expenses-server";
import { listCompras } from "@/lib/api/compras-server";
import { todayCancun } from "@/lib/datetime";
import {
  esCategoriaCompra,
  type CompraCreateInput,
  type CompraDetalle,
  type CompraListItem,
  type CompraRol,
  type CompraUpdateInput,
} from "@/types/compras";
import type { Gasto } from "@/types/expenses";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : "Error desconocido" };
}

/**
 * Todo lo que toca una compra se refleja en: su detalle, la lista de
 * compras, la bandeja de gastos (fila-grupo) y el inventario (entradas al
 * recibir). Se revalida todo junto para no dejar vistas viejas.
 */
function revalidateCompra(id?: string) {
  revalidatePath("/admin/inventory/compras");
  if (id) revalidatePath(`/admin/inventory/compras/${id}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/flights", "layout");
}

/** Alta de compra (vacía, o a partir de la factura de mercancía = gasto). */
export async function createCompraAction(
  input: CompraCreateInput = {},
): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>("/v1/compras", {
      method: "POST",
      body: input,
    });
    revalidateCompra(data.id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Une varios gastos sueltos en UNA compra: el elegido es la factura de
 * mercancía; el resto los clasifica el API (envío/impuestos/otro).
 */
export async function unirGastosEnCompraAction(input: {
  gasto_ids: string[];
  mercancia_gasto_id: string;
}): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>("/v1/compras/unir", {
      method: "POST",
      body: input,
    });
    revalidateCompra(data.id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Cabecera, cargos de la factura y líneas (líneas solo mientras ABIERTA). */
export async function updateCompraAction(
  id: string,
  input: CompraUpdateInput,
): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>(`/v1/compras/${id}`, {
      method: "PATCH",
      body: input,
    });
    revalidateCompra(id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Liga un gasto existente como pago de la compra con su rol. */
export async function addPagoCompraAction(
  id: string,
  input: { gasto_id: string; rol: CompraRol },
): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>(`/v1/compras/${id}/pagos`, {
      method: "POST",
      body: input,
    });
    revalidateCompra(id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Cambia el rol de un pago YA ligado (mercancía ↔ envío ↔ impuestos ↔ otro)
 * en una sola llamada atómica: si falla, el pago sigue ligado con su rol
 * anterior (antes era DELETE + POST y un POST fallido lo dejaba desligado).
 */
export async function updatePagoRolAction(
  id: string,
  gastoId: string,
  rol: CompraRol,
): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>(`/v1/compras/${id}/pagos/${gastoId}`, {
      method: "PATCH",
      body: { rol },
    });
    revalidateCompra(id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Desliga un pago (el gasto sigue existiendo, solo deja de pertenecer). */
export async function removePagoCompraAction(
  id: string,
  gastoId: string,
): Promise<ActionResult> {
  try {
    await apiServer(`/v1/compras/${id}/pagos/${gastoId}`, { method: "DELETE" });
    revalidateCompra(id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Recibir en bodega: genera la ENTRADA de cada línea con el costo final
 * (factura + cargos prorrateados). Sobre una compra ya RECIBIDA vuelve a
 * calcular los costos (cargos agregados después).
 */
export async function recibirCompraAction(
  id: string,
  /** true = recibir aunque haya cargos sin tipo de cambio (el API lo bloquea
   *  por default: el costo en bodega quedaría incompleto). */
  forzar = false,
): Promise<ActionResult<CompraDetalle>> {
  try {
    const data = await apiServer<CompraDetalle>(
      `/v1/compras/${id}/recibir${forzar ? "?forzar=true" : ""}`,
      {
        method: "POST",
        body: { forzar },
      },
    );
    revalidateCompra(id);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/** Solo ABIERTA: los pagos vuelven a ser gastos sueltos. */
export async function deleteCompraAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/compras/${id}`, { method: "DELETE" });
    revalidateCompra(id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ===== Lecturas para selectores (diálogos del panel) =====

/** Compras ABIERTAS para "Agregar a una compra abierta". */
export async function listComprasAbiertasAction(): Promise<ActionResult<CompraListItem[]>> {
  try {
    const res = await listCompras({ estado: "ABIERTA", limit: 100 });
    return { ok: true, data: res.data };
  } catch (err) {
    return fail(err);
  }
}

export interface GastoCandidato {
  id: string;
  fecha_gasto: string | null;
  categoria: string;
  monto: string;
  moneda: "MXN" | "USD";
  proveedor: string | null;
  descripcion: string | null;
  medio_pago: string;
}

/**
 * Gastos SIN compra de los últimos 60 días (candidatos a pago de una
 * compra). Se filtra aquí `compra_id` nulo: el API filtra por compra_id
 * concreto, no por ausencia. Solo categorías de compra (fuente única
 * `esCategoriaCompra`): GAS, VISITA, PERSONAL_DUENO… no son pagos de compra.
 */
export async function listGastosSinCompraAction(): Promise<ActionResult<GastoCandidato[]>> {
  try {
    const hasta = todayCancun();
    const desde = new Date(`${hasta}T12:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - 60);
    const res = await listGastos({
      desde: desde.toISOString().slice(0, 10),
      hasta,
      limit: 200,
    });
    const data = res.data
      .filter((g: Gasto) => !g.compra_id && esCategoriaCompra(g.categoria))
      .map((g) => ({
        id: g.id,
        fecha_gasto: g.fecha_gasto,
        categoria: g.categoria,
        monto: g.monto,
        moneda: g.moneda,
        proveedor: g.proveedor?.nombre ?? null,
        descripcion: (g.notas ?? "").split("\n")[0].trim() || null,
        medio_pago: g.medio_pago,
      }));
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
