"use client";

import { apiBrowser } from "./browser";
import { isApiError } from "./errors";
import { esAbort, TIEMPO_MAX_SUBIDA_MS, type ResultadoApi } from "./facturas-emitidas-browser";
import { mensajeErrorPagoSocio, normalizarPago } from "@/lib/admin/reparto-pagos";
import { motivoComprobanteInvalido } from "@/lib/admin/facturas-emitidas";
import type { ResultadoComprobantePagoSocio } from "@/types/reparto-pagos";

/**
 * COMPROBANTE de un pago a socio (1-oct-2026, API 0.0.49): del NAVEGADOR
 * DIRECTO al API (`POST /v1/profit-sharing/pagos/:id/comprobante`, campo
 * `file`, imagen o PDF ≤ 10 MB). Por qué directo: toda petición que entra a
 * una función de Vercel tiene un tope DURO de 4.5 MB (AGENTS.md «Server
 * actions: un archivo en base64…»). Patrón de `facturas-emitidas-browser.ts`.
 *
 * NUNCA lanza: `{ ok: true, data }` o `{ ok: false, error, code }` con un
 * texto es-MX que dice que el comprobante NO se guardó.
 */

const NO_SE_GUARDO = "El comprobante NO se guardó.";

export async function adjuntarComprobantePagoSocio(
  pagoId: string,
  file: File,
  opts: { tiempoMaxMs?: number } = {},
): Promise<ResultadoApi<ResultadoComprobantePagoSocio>> {
  const motivo = motivoComprobanteInvalido(file);
  if (motivo) return { ok: false, error: motivo, code: "ARCHIVO_INVALIDO" };
  const fd = new FormData();
  fd.append("file", file, file.name);
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_MS);
  try {
    const raw = await apiBrowser<unknown>(`/v1/profit-sharing/pagos/${pagoId}/comprobante`, {
      method: "POST",
      body: fd,
      signal: ctrl.signal,
    });
    const pago = normalizarPago((raw as { pago?: unknown } | null)?.pago);
    if (!pago || !pago.comprobante_path) {
      return {
        ok: false,
        error: `El servidor no confirmó el comprobante. ${NO_SE_GUARDO}`,
        code: "SIN_CONFIRMACION",
      };
    }
    return { ok: true, data: { pago } };
  } catch (err) {
    const sufijo = (m: string) => `${m.replace(/\.?$/, ".")} ${NO_SE_GUARDO}`;
    if (isApiError(err)) {
      return {
        ok: false,
        error: sufijo(mensajeErrorPagoSocio(err.code, err.message, err.status)),
        code: err.code,
        details: err.details,
        status: err.status,
      };
    }
    if (esAbort(err)) {
      return {
        ok: false,
        error: sufijo(mensajeErrorPagoSocio("TIEMPO_AGOTADO", null)),
        code: "TIEMPO_AGOTADO",
      };
    }
    return {
      ok: false,
      error: sufijo(mensajeErrorPagoSocio("SIN_CONEXION", null)),
      code: "SIN_CONEXION",
    };
  } finally {
    clearTimeout(reloj);
  }
}
