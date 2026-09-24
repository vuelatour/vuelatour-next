"use client";

import { useId } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface SolicitudFacturaAltaValor {
  pide: boolean;
  pagaContraFactura: boolean;
}

/**
 * «El cliente pide factura» en el ALTA de la cotización (24-sep-2026, pedido
 * de Itzi: «en el momento en el que yo creo la cotización … que haya algo que
 * yo marque así como de necesito factura»). Solo guarda la intención: al
 * crear la cotización, el cotizador llama a «Necesito factura» sobre el
 * vuelo nuevo y, si ese segundo paso falla, lo DICE (nada silencioso).
 *
 * Va fuera del papel (no se imprime) y justo debajo de la barra del total.
 */
export function SolicitudFacturaAlta({
  valor,
  onCambio,
  disabled = false,
}: {
  valor: SolicitudFacturaAltaValor;
  onCambio: (v: SolicitudFacturaAltaValor) => void;
  disabled?: boolean;
}) {
  const idPide = useId();
  const idPaga = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <DocumentTextIcon className="h-4 w-4" />
        Factura
      </span>
      <div className="flex items-center gap-2">
        <Switch
          id={idPide}
          checked={valor.pide}
          onCheckedChange={(v) =>
            onCambio({ pide: v === true, pagaContraFactura: v === true ? valor.pagaContraFactura : false })
          }
          disabled={disabled}
        />
        <Label htmlFor={idPide} className="text-sm font-normal">
          El cliente pide factura
        </Label>
      </div>
      {valor.pide && (
        <div className="flex items-center gap-2">
          <Switch
            id={idPaga}
            checked={valor.pagaContraFactura}
            onCheckedChange={(v) => onCambio({ ...valor, pagaContraFactura: v === true })}
            disabled={disabled}
          />
          <Label htmlFor={idPaga} className="text-sm font-normal">
            El cliente paga hasta recibir la factura
          </Label>
        </div>
      )}
      {valor.pide && (
        <p className="basis-full text-[11px] text-muted-foreground">
          Al crear la cotización se le avisa a facturación y el vuelo aparece en Facturas emitidas
          → Por facturar.
        </p>
      )}
    </div>
  );
}
