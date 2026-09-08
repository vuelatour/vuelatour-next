"use client";

import { apiBrowser } from "./browser";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";
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
 * PDF REAL del cliente (`POST /v1/quotes/:id/pdf`, binario): lo descarga
 * con el JWT de la sesión y lo abre en una pestaña nueva. Fuente única del
 * botón «PDF» de la barra de acciones y de «Ver PDF real» de la vista
 * previa (F1). Lanza si el API falla (el caller pinta el toast).
 */
export async function abrirPdfCotizacion(quoteId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${env.API_URL}/v1/quotes/${quoteId}/pdf`, {
    method: "POST",
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudo generar el PDF");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
