"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Fecha + hora SIN el popup nativo de la hora (26-ago, queja del cliente:
 * "el calendario está bien pero la hora se me complica"). La fecha usa el
 * calendario nativo (type="date") y la hora es TEXTO LIBRE tolerante:
 * "8pm", "8:30 pm", "20:00", "0830", "8.30" — se normaliza al salir.
 *
 * Emite el MISMO string de datetime-local ("YYYY-MM-DDTHH:mm", pared
 * Cancún) que emitía el input nativo: el pipeline cancunInputToIso /
 * isoToCancunInput del repo no cambia. Emite solo con fecha Y hora válidas;
 * borrar la fecha limpia todo.
 */

/** "8pm" | "8:30 pm" | "20:00" | "0830" | "8.30" → "HH:mm" (24h) o null. */
export function parseHoraLibre(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/[.\s]/g, "");
  if (t === "") return null;
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const suf = m[3];
  if (min > 59) return null;
  if (suf === "pm" || suf === "p") {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + 12;
  } else if (suf === "am" || suf === "a") {
    if (h < 1 || h > 12) return null;
    h = h % 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "HH:mm" → "8:30 p.m." (es-MX, como el resto del panel). */
function horaBonita(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

export function FechaHoraCampo({
  value,
  onChange,
  className,
}: {
  /** String datetime-local ("YYYY-MM-DDTHH:mm") o "". */
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [fecha, setFecha] = useState("");
  const [horaTxt, setHoraTxt] = useState("");
  const [horaInvalida, setHoraInvalida] = useState(false);

  // Hidrata desde el valor externo (revise, plantillas, reset del form).
  useEffect(() => {
    if (!value) {
      setFecha("");
      setHoraTxt("");
      setHoraInvalida(false);
      return;
    }
    const [f, h] = value.split("T");
    setFecha(f ?? "");
    if (h) setHoraTxt(horaBonita(h.slice(0, 5)));
    setHoraInvalida(false);
    // Solo cuando cambia el valor EXTERNO: no pelear con el tecleo local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitir = (f: string, hhmm: string | null) => {
    if (f && hhmm) onChange(`${f}T${hhmm}`);
    else if (!f) onChange("");
  };

  const confirmarHora = (raw: string) => {
    const hhmm = parseHoraLibre(raw);
    if (hhmm) {
      setHoraTxt(horaBonita(hhmm));
      setHoraInvalida(false);
      emitir(fecha, hhmm);
    } else {
      setHoraInvalida(raw.trim() !== "");
      if (raw.trim() === "" && !fecha) onChange("");
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Input
          type="date"
          value={fecha}
          onChange={(e) => {
            const f = e.target.value;
            setFecha(f);
            emitir(f, parseHoraLibre(horaTxt));
          }}
        />
        <Input
          type="text"
          inputMode="text"
          placeholder="8:00 pm"
          aria-label="Hora (texto libre)"
          value={horaTxt}
          onChange={(e) => {
            setHoraTxt(e.target.value);
            setHoraInvalida(false);
          }}
          onBlur={(e) => confirmarHora(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmarHora((e.target as HTMLInputElement).value);
            }
          }}
          className={cn(horaInvalida && "border-destructive")}
        />
      </div>
      {horaInvalida ? (
        <p className="text-xs text-destructive">
          No entendí la hora. Ejemplos: 8:00 pm · 20:00 · 0830
        </p>
      ) : fecha && parseHoraLibre(horaTxt) == null ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Escribe la hora para completar la fecha (ej. 8:00 pm).
        </p>
      ) : null}
    </div>
  );
}
