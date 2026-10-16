"use client";

import { useState } from "react";
import { DocumentArrowUpIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import { GastoFacturasDialog } from "@/components/admin/expenses/gasto-facturas-dialog";
import {
  ariaChipFacturas,
  nFacturasDeFila,
  textoChipFacturas,
  tituloChipFacturas,
} from "@/lib/admin/facturas-gasto";
import type { Gasto } from "@/types/expenses";

/**
 * «Subir factura» de UN gasto, desde su propia fila (22-sep-2026) — desde el
 * 16-oct-2026 (API 0.0.86) son VARIAS: ASA entrega 5 CFDI por carga.
 *
 * Pedido original del cliente: «en los registros de gastos, además de la
 * opción facturada (a un lado), agregar la opción para subir la factura
 * correspondiente de dicho gasto». Basta con el PDF o el XML de cada
 * factura (hay proveedores que solo mandan el PDF). Al amarrar, el trigger
 * del API pone el gasto en 🟢 FACTURADA: el panel NO toca el semáforo.
 *
 * El ícono: ⬆ sin facturas; 📎 con una; 📎 + número con varias (junto al
 * semáforo se lee «● Facturada 📎 5»). Clic = el diálogo con la lista (Ver,
 * Quitar de este gasto) y el selector para subir más
 * (`gasto-facturas-dialog.tsx`).
 */
export function GastoFacturaButton({ gasto }: { gasto: Gasto }) {
  const [open, setOpen] = useState(false);
  const n = nFacturasDeFila(gasto);
  const chip = textoChipFacturas(n);
  return (
    <>
      <button
        type="button"
        className="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center gap-0.5 rounded-md px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-brand-600 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(true)}
        title={tituloChipFacturas(n)}
        aria-label={ariaChipFacturas(n)}
        data-facturas-n={n}
      >
        {n > 0 ? (
          <PaperClipIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <DocumentArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {chip && <span className="text-[10px] font-semibold tabular-nums">{chip}</span>}
      </button>
      <GastoFacturasDialog gasto={gasto} open={open} onOpenChange={setOpen} />
    </>
  );
}
