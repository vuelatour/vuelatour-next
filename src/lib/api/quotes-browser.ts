"use client";

import { apiBrowser } from "./browser";
import { rutaPdfCotizacion } from "@/lib/admin/pdf-urls";
import type { CalculateQuoteRequest, QuoteBreakdown } from "@/types/quote";

/**
 * Motor de cotización (única fuente de dinero del panel). `signal` permite
 * ABORTAR la petición anterior cuando el operador sigue tecleando (F0.5):
 * la respuesta vieja ni siquiera llega, en vez de solo descartarse.
 */
export function calculateQuote(
  payload: CalculateQuoteRequest,
  signal?: AbortSignal,
) {
  return apiBrowser<QuoteBreakdown>("/v1/quotes/calculate", {
    method: "POST",
    body: payload,
    signal,
  });
}

/**
 * PDF REAL del cliente: abre el proxy `/api/quotes/:id/pdf` en una pestaña
 * nueva (fuente única con el botón «PDF» de la barra de acciones y «Ver PDF
 * real» de la hoja).
 *
 * 11-sep-2026 — por qué NO se usa un blob: antes se hacía
 * `URL.createObjectURL(await res.blob())` + `window.open`; el visor de Chrome
 * pintaba el PDF en una URL `blob:` y al pulsar «Descargar» volvía a pedir
 * ese blob, fallando con «Check internet connection». Con la URL del proxy
 * (inline + Content-Length) el visor descarga bien, y el botón «Descargar»
 * del panel usa la misma ruta con `?descargar=1` (attachment).
 *
 * Lanza si el navegador bloqueó la pestaña (el caller pinta el toast).
 */
export async function abrirPdfCotizacion(quoteId: string): Promise<void> {
  abrirPdfEnPestana(rutaPdfCotizacion(quoteId));
}

/**
 * Abre una URL de PDF del panel en pestaña nueva. `noopener` por seguridad;
 * si el navegador la bloquea se lanza con un mensaje accionable.
 */
export function abrirPdfEnPestana(url: string): void {
  const w = window.open(url, "_blank", "noopener");
  if (!w) {
    throw new Error(
      "El navegador bloqueó la pestaña del PDF: permite las ventanas emergentes de este sitio.",
    );
  }
}

export interface AirportDistance {
  millas_nauticas: number | null;
  origen: string;
  destino: string;
  falta_coords: boolean;
}

/** Millas náuticas great-circle entre dos IATA (cálculo local en el API). */
export function getAirportDistance(origen: string, destino: string) {
  return apiBrowser<AirportDistance>("/v1/airports/distance", {
    searchParams: { origen, destino },
  });
}
