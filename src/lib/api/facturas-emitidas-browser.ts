"use client";

import { apiBrowser } from "./browser";
import { isApiError } from "./errors";
import { mensajeErrorFactura } from "@/lib/admin/facturas-emitidas";
import type {
  ConteoPorFacturar,
  FacturaEmitida,
  FacturaEmitidaDatos,
  LecturaArchivoFactura,
  ResultadoComprobanteCobro,
  ResultadoGuardarFactura,
  VueloCandidatoFactura,
} from "@/types/facturas-emitidas";

/**
 * FACTURAS EMITIDAS y COMPROBANTE DEL COBRO — llamadas del NAVEGADOR DIRECTO
 * al API (24-sep-2026).
 *
 * Por qué directo (medido el 24-sep con la factura del servicio, ver
 * AGENTS.md «Factura del servicio: FOLIO y subida que no miente»): TODA
 * petición que entra a una función de Vercel —server action o `app/api/**`—
 * tiene un tope DURO de 4.5 MB de cuerpo (413 `FUNCTION_PAYLOAD_TOO_LARGE`
 * antes de que Next la vea), muy por debajo de los 10 MB de un PDF de
 * factura. Un 413 así hace que una server action LANCE en el cliente sin
 * ningún aviso. Aquí el archivo va a Railway con el JWT de la sesión de
 * Supabase que el navegador ya tiene (`apiBrowser`); el CORS del API ya lo
 * permite.
 *
 * Reglas:
 *  - NUNCA lanza: `{ ok: true, data }` o `{ ok: false, error, code, details }`
 *    con un texto es-MX que dice qué pasó (y, en las escrituras, que NO se
 *    guardó).
 *  - Multipart EXACTO del contrato: alta/edición = UN campo de texto `datos`
 *    (JSON) + `pdf` + `xml`; leer = `pdf` y/o `xml`; comprobante = `file`. El
 *    API corre con `forbidNonWhitelisted`: cualquier otro campo es un 400.
 *  - Sin `Content-Type` a mano (lo pone `fetch` con su boundary).
 *  - Espera máxima de 150 s en las subidas; se cancela y se dice.
 */

/** Espera máxima de una subida antes de cancelarla y decirlo. */
export const TIEMPO_MAX_SUBIDA_MS = 150_000;
/** Espera máxima de la lectura del archivo (el API espera 30 s a pyservices). */
export const TIEMPO_MAX_LECTURA_MS = 90_000;

export type ResultadoApi<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; details?: unknown; status?: number };

/** ¿El error es la cancelación de la espera (AbortController)? */
export function esAbort(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "AbortError"
  );
}

const NO_SE_GUARDO_FACTURA = "La factura NO se guardó.";
const NO_SE_GUARDO_COMPROBANTE = "El comprobante NO se guardó.";

function fallo<T>(err: unknown, sufijo?: string): ResultadoApi<T> {
  const con = (m: string) => (sufijo ? `${m.replace(/\.?$/, ".")} ${sufijo}` : m);
  if (isApiError(err)) {
    return {
      ok: false,
      error: con(mensajeErrorFactura(err.code, err.message, err.status)),
      code: err.code,
      details: err.details,
      status: err.status,
    };
  }
  if (esAbort(err)) {
    return {
      ok: false,
      error: con(mensajeErrorFactura("TIEMPO_AGOTADO", null)),
      code: "TIEMPO_AGOTADO",
    };
  }
  return {
    ok: false,
    error: con(mensajeErrorFactura("SIN_CONEXION", null)),
    code: "SIN_CONEXION",
  };
}

async function conEspera<T>(
  tiempoMaxMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), tiempoMaxMs);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(reloj);
  }
}

export interface OpcionesLlamada {
  /** Para pruebas: espera distinta. */
  tiempoMaxMs?: number;
}

/**
 * Lee un PDF y/o XML SIN guardar (`POST /v1/facturas-emitidas/leer-archivo`):
 * campos prellenables, «ya registrada», cliente sugerido y avisos. El API
 * nunca responde 500 por una lectura fallida (devuelve campos vacíos + aviso).
 */
export async function leerArchivoFactura(
  archivos: { pdf?: File | null; xml?: File | null },
  opts: OpcionesLlamada = {},
): Promise<ResultadoApi<LecturaArchivoFactura>> {
  if (!archivos.pdf && !archivos.xml) {
    return { ok: false, error: "Elige el PDF (o el XML) de la factura.", code: "SIN_ARCHIVO" };
  }
  const fd = new FormData();
  if (archivos.pdf) fd.append("pdf", archivos.pdf, archivos.pdf.name);
  if (archivos.xml) fd.append("xml", archivos.xml, archivos.xml.name);
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_LECTURA_MS, (signal) =>
      apiBrowser<LecturaArchivoFactura>("/v1/facturas-emitidas/leer-archivo", {
        method: "POST",
        body: fd,
        signal,
      }),
    );
    return { ok: true, data };
  } catch (err) {
    return fallo(err);
  }
}

/**
 * Registra (sin `id`) o edita (con `id`) una factura emitida en UNA llamada
 * multipart: `datos` (JSON) + `pdf` + `xml` opcionales. Solo se celebra si el
 * API respondió con la factura.
 */
export async function guardarFacturaEmitida(
  p: {
    id?: string | null;
    datos: FacturaEmitidaDatos;
    pdf?: File | null;
    xml?: File | null;
  },
  opts: OpcionesLlamada = {},
): Promise<ResultadoApi<ResultadoGuardarFactura>> {
  const fd = new FormData();
  fd.append("datos", JSON.stringify(p.datos));
  if (p.pdf) fd.append("pdf", p.pdf, p.pdf.name);
  if (p.xml) fd.append("xml", p.xml, p.xml.name);
  const path = p.id ? `/v1/facturas-emitidas/${p.id}` : "/v1/facturas-emitidas";
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_MS, (signal) =>
      apiBrowser<ResultadoGuardarFactura>(path, {
        method: p.id ? "PATCH" : "POST",
        body: fd,
        signal,
      }),
    );
    if (!data || typeof data !== "object" || !data.factura) {
      return {
        ok: false,
        error: `El servidor no confirmó la factura. ${NO_SE_GUARDO_FACTURA} Vuelve a intentarlo.`,
        code: "SIN_CONFIRMACION",
      };
    }
    return { ok: true, data: { factura: data.factura, avisos: data.avisos ?? [] } };
  } catch (err) {
    return fallo(err, NO_SE_GUARDO_FACTURA);
  }
}

/** Reemplaza (o agrega) el PDF y/o XML de una factura ya registrada. */
export async function reemplazarArchivoFactura(
  id: string,
  archivos: { pdf?: File | null; xml?: File | null },
  opts: OpcionesLlamada = {},
): Promise<ResultadoApi<FacturaEmitida>> {
  if (!archivos.pdf && !archivos.xml) {
    return { ok: false, error: "Elige el archivo a subir.", code: "SIN_ARCHIVO" };
  }
  const fd = new FormData();
  if (archivos.pdf) fd.append("pdf", archivos.pdf, archivos.pdf.name);
  if (archivos.xml) fd.append("xml", archivos.xml, archivos.xml.name);
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_MS, (signal) =>
      apiBrowser<FacturaEmitida>(`/v1/facturas-emitidas/${id}/archivo`, {
        method: "POST",
        body: fd,
        signal,
      }),
    );
    return { ok: true, data };
  } catch (err) {
    return fallo(err, "El archivo NO se guardó.");
  }
}

/** Buscador del selector de vuelos (#folio, día, cliente) + hidratar ids/grupo. */
export async function buscarVuelosCandidatos(
  q: string,
  opts: { ids?: string[]; grupo_id?: string | null; signal?: AbortSignal } = {},
): Promise<ResultadoApi<VueloCandidatoFactura[]>> {
  try {
    const data = await apiBrowser<VueloCandidatoFactura[]>(
      "/v1/facturas-emitidas/vuelos-candidatos",
      {
        searchParams: {
          q: q.trim() || undefined,
          ids: opts.ids && opts.ids.length > 0 ? opts.ids.slice(0, 50).join(",") : undefined,
          grupo_id: opts.grupo_id || undefined,
        },
        signal: opts.signal,
      },
    );
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (err) {
    return fallo(err);
  }
}

/** Conteo barato del badge del menú (una pista, no un dato: el error se calla). */
export async function conteoPorFacturar(): Promise<ResultadoApi<ConteoPorFacturar>> {
  try {
    const data = await apiBrowser<ConteoPorFacturar>(
      "/v1/facturas-emitidas/por-facturar/conteo",
    );
    return { ok: true, data };
  } catch (err) {
    return fallo(err);
  }
}

/**
 * Adjunta (o reemplaza) el COMPROBANTE de un cobro YA registrado
 * (`POST /v1/flights/cobros/:cobroId/comprobante`, campo `file`). No toca
 * dinero ni lo bloquea el candado de la cotización con cobros; el archivo
 * anterior se conserva en el bucket (lo decide el API).
 */
export async function adjuntarComprobanteCobro(
  cobroId: string,
  file: File,
  opts: OpcionesLlamada = {},
): Promise<ResultadoApi<ResultadoComprobanteCobro>> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  try {
    const data = await conEspera(opts.tiempoMaxMs ?? TIEMPO_MAX_SUBIDA_MS, (signal) =>
      apiBrowser<ResultadoComprobanteCobro>(`/v1/flights/cobros/${cobroId}/comprobante`, {
        method: "POST",
        body: fd,
        signal,
      }),
    );
    if (!data || typeof data !== "object" || !data.foto_voucher_url) {
      return {
        ok: false,
        error: `El servidor no confirmó el comprobante. ${NO_SE_GUARDO_COMPROBANTE}`,
        code: "SIN_CONFIRMACION",
      };
    }
    return { ok: true, data };
  } catch (err) {
    return fallo(err, NO_SE_GUARDO_COMPROBANTE);
  }
}
