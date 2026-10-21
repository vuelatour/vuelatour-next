"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import { listCompras } from "@/lib/api/compras-server";
import type {
  CompraConGastoRegistrado,
  CompraCreateInput,
  CompraDetalle,
  CompraListItem,
  CompraRol,
  CompraUpdateInput,
  EntradaDesdeGastoInput,
  EntradaDesdeGastoResultado,
  GastosCandidatosQuery,
  GastosCandidatosResponse,
  RegistrarGastoCompraInput,
} from "@/types/compras";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** HTTP del API cuando falló (aditivo, 21-oct-2026). */
  status?: number;
  /** `code` ESTABLE del API (p. ej. COMPRA_GASTO_YA_REGISTRADO): la UI decide por él, nunca por el texto. */
  code?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message, status: err.status, code: err.code };
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

/** Alta de compra («Registrar compra»: pedida, sin recibir; o a partir de la factura de mercancía = gasto). */
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

/** «Vincular gasto ya registrado»: liga un gasto existente como pago de la compra con su rol. */
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
 * «Registrar gasto» (21-oct-2026, API 0.0.102, invariante 101 del API): el
 * API crea UN gasto de Refacción por el total de la factura de mercancía
 * (líneas + cargos impresos) en la moneda de la compra, ligado a ella. El
 * T.C. es obligatorio (lo valida el API: 15–25). 409
 * `COMPRA_GASTO_YA_REGISTRADO` si ya lo tenía.
 */
export async function registrarGastoCompraAction(
  id: string,
  input: RegistrarGastoCompraInput,
): Promise<ActionResult<CompraConGastoRegistrado>> {
  try {
    const data = await apiServer<CompraConGastoRegistrado>(`/v1/compras/${id}/registrar-gasto`, {
      method: "POST",
      body: input,
    });
    revalidateCompra(id);
    revalidatePath("/admin/caja-chica", "layout");
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

/** Solo ABIERTA (sin entradas en bodega): los pagos vuelven a ser gastos sueltos. */
export async function deleteCompraAction(id: string): Promise<ActionResult> {
  try {
    await apiServer(`/v1/compras/${id}`, { method: "DELETE" });
    revalidateCompra(id);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Entrada de inventario VINCULADA a un gasto ya registrado (21-oct-2026,
 * invariante 101): el API arma la compra de una línea con ese gasto como
 * mercancía (costo = monto ÷ unidades) y la recibe. `recibida: false` = la
 * compra quedó abierta con el gasto ligado (los avisos dicen por qué).
 */
export async function entradaDesdeGastoAction(
  input: EntradaDesdeGastoInput,
): Promise<ActionResult<EntradaDesdeGastoResultado>> {
  try {
    const data = await apiServer<EntradaDesdeGastoResultado>("/v1/compras/entrada-desde-gasto", {
      method: "POST",
      body: input,
    });
    revalidateCompra(data.compra.id);
    revalidatePath(`/admin/inventory/${input.item_id}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ===== Lecturas para selectores (diálogos del panel; NO revalidan) =====

/** Compras ABIERTAS para "Agregar a una compra abierta". */
export async function listComprasAbiertasAction(): Promise<ActionResult<CompraListItem[]>> {
  try {
    const res = await listCompras({ estado: "ABIERTA", limit: 100 });
    return { ok: true, data: res.data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Gastos SIN compra que pueden ser pago de una (selector «Vincular gasto ya
 * registrado»): los filtra el API (`GET /v1/compras/gastos-candidatos`) por
 * ventana de fechas, búsqueda libre, proveedor y, si se pide, solo los que
 * pueden ser la factura de mercancía.
 */
export async function listGastosCandidatosCompraAction(
  query: GastosCandidatosQuery = {},
): Promise<ActionResult<GastosCandidatosResponse>> {
  try {
    const data = await apiServer<GastosCandidatosResponse>("/v1/compras/gastos-candidatos", {
      searchParams: query as Record<string, string | number | boolean | undefined>,
      cache: "no-store",
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
