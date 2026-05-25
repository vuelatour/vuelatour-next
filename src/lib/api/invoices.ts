"use client";

import { apiBrowser } from "./browser";
import type { Factura } from "@/types/invoices";

export function emitirFactura(vueloId: string, entidadFiscalEmisoraId: string): Promise<Factura> {
  return apiBrowser<Factura>("/v1/invoices/emitir", {
    method: "POST",
    body: { vuelo_id: vueloId, entidad_fiscal_emisora_id: entidadFiscalEmisoraId },
  });
}
