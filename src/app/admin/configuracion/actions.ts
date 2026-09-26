"use server";

import { revalidatePath } from "next/cache";
import { apiServer } from "@/lib/api/server";
import { isApiError } from "@/lib/api/errors";
import type { ConfiguracionFlag } from "@/lib/api/configuracion-server";
import type { IaSaldoCheckpoint } from "@/lib/api/ia-uso-server";
import type { ResponsablesFacturacion } from "@/types/facturas-emitidas";
import type { EditoresCotizacionCobrada } from "@/lib/admin/cotizacion-cobrada";

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Código estructurado del API (p. ej. `LISTA_VACIA`). */
  code?: string;
}

function fail<T>(err: unknown): ActionResult<T> {
  if (isApiError(err)) return { ok: false, error: err.message, code: err.code };
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Error desconocido",
  };
}

export async function updateConfiguracionAction(
  clave: string,
  // Banderas booleanas mandan { activa }; las numéricas { valor_numerico }.
  // apiServer ya serializa el body: objeto tal cual, sin JSON.stringify.
  cambio: { activa?: boolean; valor_numerico?: number },
): Promise<ActionResult<ConfiguracionFlag>> {
  try {
    const data = await apiServer<ConfiguracionFlag>(`/v1/config/${clave}`, {
      method: "PATCH",
      body: cambio,
    });
    revalidatePath("/admin/configuracion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Captura un checkpoint de saldo de créditos de IA (el monto que el admin lee
 * en console.anthropic.com). No es destructivo: cada captura es un registro
 * nuevo y la estimación se recalcula a partir del más reciente.
 */
export async function capturarIaSaldoAction(input: {
  saldo_usd: number;
  notas?: string;
}): Promise<ActionResult<IaSaldoCheckpoint>> {
  try {
    const data = await apiServer<IaSaldoCheckpoint>("/v1/config/ia-saldo", {
      method: "POST",
      body: input,
    });
    revalidatePath("/admin/configuracion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * RESPONSABLES DE FACTURACIÓN (24-sep-2026): quién recibe el aviso «Factura
 * pedida» cuando alguien marca «Necesito factura». Reemplaza la lista
 * completa (`[]` = nadie elegido ⇒ el API cae al rol FACTURACION y luego a
 * los ADMIN). Sin la migración de facturas emitidas el API responde 503 y
 * el mensaje se pinta tal cual.
 */
export async function setResponsablesFacturacionAction(
  usuarioIds: string[],
): Promise<ActionResult<ResponsablesFacturacion>> {
  try {
    const data = await apiServer<ResponsablesFacturacion>(
      "/v1/config/responsables-facturacion",
      { method: "PUT", body: { usuario_ids: [...new Set(usuarioIds)].slice(0, 20) } },
    );
    revalidatePath("/admin/configuracion");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

/**
 * EDITAN COTIZACIONES COBRADAS (26-sep-2026, API 0.0.37): reemplaza la lista
 * completa. El API decide y responde: 403 `SOLO_EDITORES_COTIZACION_COBRADA`
 * (quien guarda no está en la lista), 400 `LISTA_VACIA`, 400
 * `USUARIOS_INVALIDOS` (alguien no es de oficina o no está activo). El
 * permiso de cada quien se refleja en `/me` en el siguiente render.
 */
export async function setEditoresCotizacionCobradaAction(
  usuarioIds: string[],
): Promise<ActionResult<EditoresCotizacionCobrada>> {
  const ids = [...new Set(usuarioIds)];
  if (ids.length === 0) {
    return { ok: false, code: "LISTA_VACIA", error: "La lista no puede quedar vacía." };
  }
  try {
    const data = await apiServer<EditoresCotizacionCobrada>(
      "/v1/config/editores-cotizacion-cobrada",
      { method: "PUT", body: { usuario_ids: ids } },
    );
    revalidatePath("/admin/configuracion");
    // El permiso cambia la pantalla de la cotización (candado y razón).
    revalidatePath("/admin/quotes", "layout");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
