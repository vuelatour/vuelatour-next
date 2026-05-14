"use client";

import { apiBrowser } from "./browser";
import type { CalculateQuoteRequest, QuoteBreakdown } from "@/types/quote";

export function calculateQuote(payload: CalculateQuoteRequest) {
  return apiBrowser<QuoteBreakdown>("/v1/quotes/calculate", {
    method: "POST",
    body: payload,
  });
}
