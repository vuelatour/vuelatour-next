"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Fecha + hora SIN el popup nativo de la hora (26-ago, queja del cliente:
 * "el calendario está bien pero la hora se me complica"). v2 (28-ago,
 * pedido del cliente): la hora ya no es texto libre — son TRES selects
 * (hora · minutos · a.m./p.m.) con default 6:00 a.m., sin estados
 * inválidos posibles. El campo completo sigue siendo OPCIONAL: sin fecha
 * no se guarda nada; al elegir fecha la hora sale lista con el default.
 *
 * Emite el MISMO string de datetime-local ("YYYY-MM-DDTHH:mm", pared
 * Cancún) de siempre: el pipeline cancunInputToIso / isoToCancunInput del
 * repo no cambia. Borrar la fecha limpia todo.
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

/** Mismo look de los Input del panel para los <select> nativos. */
const SELECT_CLS =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs " +
  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 " +
  "focus-visible:ring-[3px] dark:bg-input/30";

const HORAS_12 = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
const MINUTOS = ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

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
  // Defaults pedidos por el cliente (28-ago): 6 · 00 · a.m.
  const [hora12, setHora12] = useState("6");
  const [minuto, setMinuto] = useState("0");
  const [ampm, setAmpm] = useState<"am" | "pm">("am");

  // Hidrata desde el valor externo (revise, plantillas, reset del form).
  useEffect(() => {
    if (!value) {
      setFecha("");
      setHora12("6");
      setMinuto("0");
      setAmpm("am");
      return;
    }
    const [f, h] = value.split("T");
    setFecha(f ?? "");
    if (h) {
      const [hh, mm] = h.slice(0, 5).split(":").map(Number);
      setHora12(String(((hh + 11) % 12) + 1));
      setMinuto(String(mm));
      setAmpm(hh < 12 ? "am" : "pm");
    }
    // Solo cuando cambia el valor EXTERNO: no pelear con la edición local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitir = (f: string, h12: string, min: string, sufijo: "am" | "pm") => {
    if (!f) {
      onChange("");
      return;
    }
    const base = Number(h12) % 12;
    const hh = sufijo === "pm" ? base + 12 : base;
    onChange(
      `${f}T${String(hh).padStart(2, "0")}:${String(Number(min)).padStart(2, "0")}`,
    );
  };

  // Un valor externo con minutos fuera del paso de 5 (ej. 10:37) se
  // conserva tal cual en el select — nunca se redondea en silencio.
  const minutos = MINUTOS.includes(minuto)
    ? MINUTOS
    : [minuto, ...MINUTOS].sort((a, b) => Number(a) - Number(b));

  return (
    <div className={cn("space-y-1", className)}>
      {/* flex-wrap: en columnas angostas (tramos del sheet) los selects
          bajan a su propia línea en vez de reventar el ancho. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="min-w-[150px] flex-1 basis-[150px]"
          value={fecha}
          onChange={(e) => {
            const f = e.target.value;
            setFecha(f);
            emitir(f, hora12, minuto, ampm);
          }}
        />
        <div className="flex gap-2">
        <select
          aria-label="Hora"
          className={cn(SELECT_CLS, "w-[64px]")}
          value={hora12}
          onChange={(e) => {
            setHora12(e.target.value);
            emitir(fecha, e.target.value, minuto, ampm);
          }}
        >
          {HORAS_12.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          aria-label="Minutos"
          className={cn(SELECT_CLS, "w-[68px]")}
          value={minuto}
          onChange={(e) => {
            setMinuto(e.target.value);
            emitir(fecha, hora12, e.target.value, ampm);
          }}
        >
          {minutos.map((m) => (
            <option key={m} value={m}>
              :{String(Number(m)).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          aria-label="a.m. o p.m."
          className={cn(SELECT_CLS, "w-[76px]")}
          value={ampm}
          onChange={(e) => {
            const suf = e.target.value === "pm" ? "pm" : "am";
            setAmpm(suf);
            emitir(fecha, hora12, minuto, suf);
          }}
        >
          <option value="am">a.m.</option>
          <option value="pm">p.m.</option>
        </select>
        </div>
      </div>
    </div>
  );
}
