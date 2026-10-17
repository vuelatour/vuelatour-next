"use client";

import { useId } from "react";
import { AYUDA_PAGO_AFAC, ETIQUETA_PAGO_AFAC } from "@/lib/admin/pago-afac";

/**
 * Casilla «Es pago de AFAC (lo paga VuelaTour; no le resta al avión)»
 * (16-oct-2026, API 0.0.89, invariante 90). La MISMA en el alta y en
 * «Verificar / editar»; quien la monta decide si se ve (Permiso + rol de
 * oficina + `config.afac_real`, `casillaPagoAfacVisible`) y qué viaja
 * (`pagoAfacParaAlta` / `pagoAfacParaPatch`). Textos en `lib/admin/pago-afac.ts`.
 */
export function CasillaPagoAfac({
  marcado,
  onCambio,
  disabled = false,
}: {
  marcado: boolean;
  onCambio: (marcado: boolean) => void;
  disabled?: boolean;
}) {
  const ayudaId = useId();
  return (
    <div className="rounded-lg border border-border px-3 py-2" data-casilla-pago-afac="">
      <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={marcado}
          disabled={disabled}
          onChange={(e) => onCambio(e.target.checked)}
          aria-describedby={ayudaId}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
        />
        <span>{ETIQUETA_PAGO_AFAC}</span>
      </label>
      <p id={ayudaId} className="mt-1 pl-6 text-xs text-muted-foreground">
        {AYUDA_PAGO_AFAC}
      </p>
    </div>
  );
}
