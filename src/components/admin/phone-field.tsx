"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Campo de teléfono UNIFICADO (regla del cliente): lada seleccionable aparte
 * + número de EXACTAMENTE 10 dígitos. Se guarda como "+<lada> <10 dígitos>"
 * en el mismo campo `telefono` de siempre (sin migraciones).
 */
export const LADAS = [
  { code: "52", label: "🇲🇽 +52" },
  { code: "1", label: "🇺🇸 +1" },
  { code: "501", label: "🇧🇿 +501" },
  { code: "502", label: "🇬🇹 +502" },
];

/** Regex que valida el formato guardado: +lada espacio 10 dígitos. */
export const PHONE_RE = /^\+\d{1,3} \d{10}$/;

/**
 * Interpreta valores guardados y LEGADOS: "+52 9981234567" → lada+número;
 * cualquier otra cosa → solo dígitos (últimos 10) con lada MX por default.
 */
export function parsePhone(value: string | null | undefined): {
  lada: string;
  digits: string;
} {
  const v = (value ?? "").trim();
  const m = v.match(/^\+(\d{1,3})\s*(\d{1,10})$/);
  if (m && LADAS.some((l) => l.code === m[1])) return { lada: m[1], digits: m[2] };
  const digits = v.replace(/\D/g, "");
  return { lada: "52", digits: digits.slice(-10) };
}

export function PhoneField({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const parsed = parsePhone(value);
  // Con número capturado la lada vive en el value; vacío, se recuerda local
  // (para poder elegir lada antes de teclear).
  const [ladaLocal, setLadaLocal] = useState(parsed.lada);
  const lada = parsed.digits ? parsed.lada : ladaLocal;

  const emit = (l: string, d: string) => onChange(d ? `+${l} ${d}` : "");

  return (
    <div className="flex gap-2">
      <select
        value={lada}
        disabled={disabled}
        onChange={(e) => {
          setLadaLocal(e.target.value);
          emit(e.target.value, parsed.digits);
        }}
        className="h-9 w-28 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      >
        {LADAS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <Input
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder="10 dígitos"
        disabled={disabled}
        value={parsed.digits}
        onChange={(e) => emit(lada, e.target.value.replace(/\D/g, "").slice(0, 10))}
      />
    </div>
  );
}
