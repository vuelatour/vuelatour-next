"use client";

import { cn } from "@/lib/utils";

/**
 * Select compacto de moneda (USD/MXN) con el estilo de los inputs. Fuente
 * única para los renglones con moneda propia (TUAS por aeropuerto, extras).
 */
export function MonedaSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: "USD" | "MXN";
  onChange: (m: "USD" | "MXN") => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(ev) => onChange(ev.target.value === "MXN" ? "MXN" : "USD")}
      aria-label="Moneda"
      className={cn(
        // `cursor-pointer`: pedido del cliente (22-sep-2026) — se pulsa, así
        // que lo dice. Vive FUERA del papel (costo del operador externo), o
        // sea fuera del alcance de la regla CSS de la hoja.
        "h-8 cursor-pointer rounded-lg border border-input bg-transparent px-2 text-xs font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        className,
      )}
    >
      <option value="USD">USD</option>
      <option value="MXN">MXN</option>
    </select>
  );
}
