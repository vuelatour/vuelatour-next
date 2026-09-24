"use client";

import { apiBrowser } from "./browser";
import { isApiError } from "./errors";
import {
  AVISO_FOLIO_NO_DISPONIBLE,
  confirmarSubida,
  mensajeFalloSubidaFactura,
  motivoArchivoInvalido,
  type ResultadoSubidaFactura,
} from "@/lib/admin/factura-cliente";
import type { FacturaClienteBloque } from "@/types/flights";

/**
 * SUBIDA de la factura del servicio, del NAVEGADOR DIRECTO AL API
 * (24-sep-2026). Camino elegido con evidencia, no por gusto:
 *
 *  - El tope de 1 MB de las server actions NO era la causa: `next.config.ts`
 *    ya lo sube a 12 MB y Next 16.2.6 lo lee de
 *    `nextConfig.experimental.serverActions` (`build/templates/app-page.js`
 *    → `server/app-render/action-handler.js`).
 *  - El panel vive en Vercel, y TODA petición que entra a una función de
 *    Vercel (server action o `app/api/**`) tiene un tope DURO de 4.5 MB de
 *    cuerpo: responde 413 `FUNCTION_PAYLOAD_TOO_LARGE` antes de que Next la
 *    vea. Un proxy en `app/api/**` tampoco llega a los 10 MB del contrato.
 *  - Ese 413 no es una respuesta RSC, así que la server action LANZA en el
 *    cliente («An unexpected response was received from the server»,
 *    `server-action-reducer.js`); `subir()` tenía `try/finally` sin `catch`
 *    ⇒ ningún aviso y el botón volvía a «Subir factura». Defecto LATENTE
 *    para archivos > 4.5 MB. OJO: NO fue lo del #297 — los logs de Supabase
 *    muestran que ese PDF (50 KB) SÍ se subió (23-sep 14:28 Cancún) y que a
 *    las 14:37 alguien lo QUITÓ con «Quitar archivo» (ver AGENTS.md).
 *
 * Por eso el archivo va directo a Railway con `apiBrowser` (el JWT de la
 * sesión de Supabase que el navegador YA tiene — el mismo mecanismo de
 * `descargarDelApi`, las notificaciones y `lib/api/invoices.ts`; el CORS del
 * API ya lo permite). El API responde con sus errores estructurados (413
 * `ARCHIVO_MUY_GRANDE` con el peso, 400 `CAMPO_ARCHIVO_INVALIDO`…) y aquí se
 * traducen SIEMPRE a «la factura NO se guardó» cuando algo falla.
 *
 * El multipart lleva SOLO `file` y, si aplica, `folio`: el API corre con
 * `forbidNonWhitelisted` y cualquier otro campo es un 400.
 */

/** Espera máxima de la subida antes de cancelarla y decirlo. */
export const TIEMPO_MAX_SUBIDA_MS = 150_000;

export interface OpcionesSubidaFactura {
  /** Folio a mandar (ya decidido con `folioAEnviar`); null = no mandar. */
  folio?: string | null;
  /** Para pruebas: tiempo de espera distinto. */
  tiempoMaxMs?: number;
}

function formulario(file: File, folio: string | null): FormData {
  const fd = new FormData();
  fd.append("file", file, file.name);
  if (folio) fd.append("folio", folio);
  return fd;
}

async function enviar(
  flightId: string,
  file: File,
  folio: string | null,
  tiempoMaxMs: number,
): Promise<FacturaClienteBloque> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), tiempoMaxMs);
  try {
    return await apiBrowser<FacturaClienteBloque>(
      `/v1/flights/${flightId}/factura-cliente/archivo`,
      { method: "POST", body: formulario(file, folio), signal: ctrl.signal },
    );
  } finally {
    clearTimeout(reloj);
  }
}

function esAbort(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Sube (o reemplaza) el archivo. NUNCA lanza: devuelve
 * `{ok:true, bloque, avisoFolio?}` solo si el API respondió 200 con
 * `archivo`, o `{ok:false, error}` con un texto que dice que NO se guardó.
 */
export async function subirFacturaClienteDirecto(
  flightId: string,
  file: File,
  opts: OpcionesSubidaFactura = {},
): Promise<ResultadoSubidaFactura<FacturaClienteBloque>> {
  const motivo = motivoArchivoInvalido(file);
  if (motivo) return { ok: false, error: motivo, code: "ARCHIVO_INVALIDO" };
  const tiempoMaxMs = opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_MS;
  const folio = opts.folio ?? null;

  try {
    return confirmarSubida(await enviar(flightId, file, folio, tiempoMaxMs));
  } catch (err) {
    // Folio tecleado con la migración del folio sin aplicar: el API responde
    // 409 ANTES de subir nada. El archivo es lo importante: se reintenta SIN
    // folio y se AVISA que el folio queda pendiente (nunca se pierde en
    // silencio).
    if (folio && isApiError(err) && err.code === "FACTURA_FOLIO_NO_DISPONIBLE") {
      try {
        const res = confirmarSubida(await enviar(flightId, file, null, tiempoMaxMs));
        return res.ok ? { ...res, avisoFolio: AVISO_FOLIO_NO_DISPONIBLE } : res;
      } catch (err2) {
        return falloDe(err2, file.size);
      }
    }
    return falloDe(err, file.size);
  }
}

function falloDe(err: unknown, bytes: number): { ok: false; error: string; code?: string } {
  if (isApiError(err)) {
    return {
      ok: false,
      error: mensajeFalloSubidaFactura(
        { status: err.status, code: err.code, message: err.message },
        bytes,
      ),
      code: err.code,
    };
  }
  if (esAbort(err)) {
    return {
      ok: false,
      error: mensajeFalloSubidaFactura({ tiempoAgotado: true }),
      code: "TIEMPO_AGOTADO",
    };
  }
  return {
    ok: false,
    error: mensajeFalloSubidaFactura({ red: true }),
    code: "SIN_CONEXION",
  };
}

/** Lee un archivo XML (para prellenar el folio). `null` si no se pudo. */
export async function leerBytes(file: File): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}
