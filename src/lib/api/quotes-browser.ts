"use client";

import { apiBrowser } from "./browser";
import type { CalculateQuoteRequest, QuoteBreakdown } from "@/types/quote";

export function calculateQuote(payload: CalculateQuoteRequest) {
  return apiBrowser<QuoteBreakdown>("/v1/quotes/calculate", {
    method: "POST",
    body: payload,
  });
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
