"use client";

import { useId } from "react";
import { AYUDA_PAGO_OPERADOR, etiquetaPagoOperador } from "@/lib/admin/pago-operador-externo";

/**
 * Casilla «Es el pago al operador externo (Simon Herrera)» (27-oct-2026, API
 * 0.0.110, invariante 110). La MISMA en el alta y en «Verificar / editar»;
 * quien la monta decide si se ve (vuelo externo + categoría del vuelo + rol
 * de oficina, `casillaPagoOperadorVisible`), si nace marcada
 * (`pagoOperadorPorDefecto`) y qué viaja (`pagoOperadorParaAlta` /
 * `pagoOperadorParaPatch`). Textos en `lib/admin/pago-operador-externo.ts`.
 */
export function CasillaPagoOperador({
  marcado,
  onCambio,
  operador,
  disabled = false,
}: {
  marcado: boolean;
  onCambio: (marcado: boolean) => void;
  operador: string | null;
  disabled?: boolean;
}) {
  const ayudaId = useId();
  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2"
      data-casilla-pago-operador=""
    >
      <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={marcado}
          disabled={disabled}
          onChange={(e) => onCambio(e.target.checked)}
          aria-describedby={ayudaId}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
        />
        <span>{etiquetaPagoOperador(operador)}</span>
      </label>
      <p id={ayudaId} className="mt-1 pl-6 text-xs text-muted-foreground">
        {AYUDA_PAGO_OPERADOR}
      </p>
    </div>
  );
}
