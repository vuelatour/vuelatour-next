"use client";

import { apiBrowser } from "./browser";
import { isApiError } from "./errors";
import { mensajeErrorIngreso } from "@/lib/admin/ingresos-ui";
import type {
  DatosEdicionIngreso,
  DatosIngreso,
  RespuestaEditarIngreso,
  RespuestaRegistrarIngreso,
} from "@/lib/admin/ingresos-ui";

/**
 * INGRESOS — alta y edición CON comprobante, del NAVEGADOR DIRECTO al API
 * (24-sep-2026). Mismo camino que las facturas emitidas
 * (`facturas-emitidas-browser.ts`): TODA petición que entra a una función de
 * Vercel —server action o `app/api/**`— se corta en 4.5 MB de cuerpo, muy por
 * debajo de los 10 MB del comprobante; un 413 así hace que una server action
 * LANCE sin aviso. Aquí el archivo va a Railway con el JWT de la sesión.
 *
 * Reglas:
 *  - NUNCA lanza: `{ ok: true, data }` o `{ ok: false, error, code, details,
 *    status }` con un texto es-MX que dice qué pasó y, si no se guardó, lo dice.
 *  - Multipart EXACTO del contrato: UN campo de texto `datos` (JSON) + `archivo`
 *    opcional. El API corre con `forbidNonWhitelisted`: otro campo es un 400.
 *  - Sin `Content-Type` a mano (lo pone `fetch` con su boundary).
 *  - Espera máxima de 150 s; se cancela y se dice.
 *  - Solo se celebra si el API respondió con el ingreso.
 */

export const TIEMPO_MAX_SUBIDA_INGRESO_MS = 150_000;

export type ResultadoIngresoApi<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; details?: unknown; status?: number };

const NO_SE_GUARDO = "El ingreso NO se guardó.";

function esAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

function fallo<T>(err: unknown, sufijo: string): ResultadoIngresoApi<T> {
  const con = (m: string) => `${m.replace(/\.?$/, ".")} ${sufijo}`;
  if (isApiError(err)) {
    return {
      ok: false,
      // Los 409 del alta desde un abono (ABONO_TIENE_COBRO_CANDIDATO,
      // ABONO_POSIBLE_DUPLICADO) los resuelve el diálogo con su `details`:
      // el mensaje igual dice que no se guardó.
      error: con(mensajeErrorIngreso(err.code, err.message, err.status)),
      code: err.code,
      details: err.details,
      status: err.status,
    };
  }
  if (esAbort(err)) {
    return {
      ok: false,
      error: con(mensajeErrorIngreso("TIEMPO_AGOTADO", null)),
      code: "TIEMPO_AGOTADO",
    };
  }
  return {
    ok: false,
    error: con(mensajeErrorIngreso("SIN_CONEXION", null)),
    code: "SIN_CONEXION",
  };
}

async function conEspera<T>(tiempoMaxMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), tiempoMaxMs);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(reloj);
  }
}

export interface OpcionesLlamadaIngreso {
  /** Para pruebas: espera distinta. */
  tiempoMaxMs?: number;
}

function multipart(datos: unknown, archivo?: File | null): FormData {
  const fd = new FormData();
  fd.append("datos", JSON.stringify(datos));
  if (archivo) fd.append("archivo", archivo, archivo.name);
  return fd;
}

/**
 * Registra un ingreso (`POST /v1/ingresos`). Con `movimiento_bancario_id` el
 * API además lo concilia con ese abono («Registrar y conciliar»).
 */
export async function registrarIngreso(
  datos: DatosIngreso,
  archivo?: File | null,
  opts: OpcionesLlamadaIngreso = {},
): Promise<ResultadoIngresoApi<RespuestaRegistrarIngreso>> {
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_INGRESO_MS, (signal) =>
      apiBrowser<RespuestaRegistrarIngreso>("/v1/ingresos", {
        method: "POST",
        body: multipart(datos, archivo),
        signal,
      }),
    );
    if (!data || typeof data !== "object" || !data.ingreso) {
      return {
        ok: false,
        error: `El servidor no confirmó el ingreso. ${NO_SE_GUARDO} Revisa la lista antes de reintentar.`,
        code: "SIN_CONFIRMACION",
      };
    }
    return {
      ok: true,
      data: {
        ingreso: data.ingreso,
        movimiento_id: data.movimiento_id ?? null,
        avisos: Array.isArray(data.avisos) ? data.avisos : [],
        ...(data.idempotente ? { idempotente: true as const } : {}),
      },
    };
  } catch (err) {
    return fallo(err, NO_SE_GUARDO);
  }
}

/** Edita un ingreso (`PATCH /v1/ingresos/:id`): solo lo que cambió + CAS. */
export async function editarIngreso(
  id: string,
  datos: DatosEdicionIngreso,
  archivo?: File | null,
  opts: OpcionesLlamadaIngreso = {},
): Promise<ResultadoIngresoApi<RespuestaEditarIngreso>> {
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_INGRESO_MS, (signal) =>
      apiBrowser<RespuestaEditarIngreso>(`/v1/ingresos/${id}`, {
        method: "PATCH",
        body: multipart(datos, archivo),
        signal,
      }),
    );
    if (!data || typeof data !== "object" || !data.ingreso) {
      return {
        ok: false,
        error: "El servidor no confirmó los cambios. Los cambios NO se guardaron.",
        code: "SIN_CONFIRMACION",
      };
    }
    return {
      ok: true,
      data: { ingreso: data.ingreso, avisos: Array.isArray(data.avisos) ? data.avisos : [] },
    };
  } catch (err) {
    return fallo(err, "Los cambios NO se guardaron.");
  }
}

/** Tope del comprobante (espejo del bucket `ingresos`: 10 MB). */
export const LIMITE_COMPROBANTE_INGRESO_BYTES = 10 * 1024 * 1024;
export const TIPOS_COMPROBANTE_INGRESO = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Motivo por el que un archivo NO se puede subir (null = se puede). */
export function motivoComprobanteIngresoInvalido(f: { name: string; size: number; type: string }): string | null {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  const tipoOk =
    TIPOS_COMPROBANTE_INGRESO.includes(f.type) || ["jpg", "jpeg", "png", "webp", "pdf"].includes(ext);
  if (!tipoOk) return "Sube una foto (JPG, PNG, WEBP) o un PDF.";
  if (f.size > LIMITE_COMPROBANTE_INGRESO_BYTES) {
    return `El archivo pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo son 10 MB.`;
  }
  return null;
}
