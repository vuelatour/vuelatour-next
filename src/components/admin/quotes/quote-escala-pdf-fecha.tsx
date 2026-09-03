"use client";

import { useEffect, useRef, useTransition } from "react";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { setEscalaPdfFechaAction } from "@/app/admin/quotes/actions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Fecha por tramo para el PDF del cliente (detalle de la cotización, 3-sep):
 * escribe DIRECTO en la escala viva (PATCH pdf-visibilidad, mismo patrón que
 * el toggle de visibilidad — useTransition + toasts, sin estado optimista:
 * la revalidación trae la fecha final y el `key` remonta el input).
 *
 * Presentación pura: SOLO se imprime en el PDF; no toca la ruta operativa
 * ni las fechas de vuelo (fecha_salida_plan / fecha_vuelo) y no versiona.
 * El valor es SIEMPRE un string 'YYYY-MM-DD' de PARED (o null para quitar):
 * jamás new Date() ni helpers de datetime-local — moverían el día.
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Espera tras el último cambio antes de guardar lo capturado con onChange.
 * Chrome dispara change en CADA tecla que deja una fecha completa (al teclear
 * "15" en el día de una fecha existente ya emite "…-01"): guardar de
 * inmediato bloquearía el campo (pending) a media captura y dejaría el día
 * equivocado en el PDF. Salir del campo o Enter guardan al instante.
 */
const DEBOUNCE_MS = 800;

/**
 * Fecha completa y con año razonable. Chrome dispara onChange mientras se
 * teclea el año ("0002-09-05" ya es válido para el input): sin este filtro
 * cada dígito del año provocaría un guardado.
 */
function fechaCapturable(v: string): boolean {
  if (!RE_FECHA.test(v)) return false;
  const anio = Number(v.slice(0, 4));
  return anio >= 2000 && anio <= 2100;
}

export function QuoteEscalaPdfFecha({
  quoteId,
  escalaId,
  fecha,
  oculto,
}: {
  quoteId: string;
  escalaId: string;
  /** 'YYYY-MM-DD' de pared o null (sin fecha en el PDF). */
  fecha: string | null;
  /** Tramo oculto del PDF: la fecha no se imprime; el campo se bloquea. */
  oculto: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Último valor que aceptó el API (o el que viene del servidor): evita
  // re-guardar lo mismo (onChange + onBlur) y sirve para restaurar el campo
  // si el guardado falla. Se marca ANTES de llamar al API para que dos
  // disparos seguidos con el mismo valor no manden dos PATCH.
  const guardadoRef = useRef<string | null>(fecha);
  useEffect(() => {
    guardadoRef.current = fecha;
  }, [fecha]);
  const timerRef = useRef<number | null>(null);

  const cancelarProgramado = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => {
    // Al desmontar el componente (salir del detalle) no debe quedar un
    // guardado programado colgando.
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const restaurar = () => {
    if (inputRef.current) inputRef.current.value = guardadoRef.current ?? "";
  };

  const guardar = (valor: string | null) => {
    cancelarProgramado();
    if (valor === guardadoRef.current) return;
    const previo = guardadoRef.current;
    guardadoRef.current = valor;
    startTransition(async () => {
      const res = await setEscalaPdfFechaAction(quoteId, escalaId, valor);
      if (!res.ok) {
        guardadoRef.current = previo;
        restaurar();
        toast.error(res.error ?? "No se pudo guardar la fecha del PDF");
        return;
      }
      toast.success(
        valor
          ? "Fecha del PDF guardada (solo se imprime en el PDF del cliente)"
          : "Fecha del PDF quitada",
      );
    });
  };

  // Commit inmediato (salir del campo / Enter): fecha completa → guardar;
  // incompleta o vacía → volver al último valor guardado. Vaciar el campo NO
  // borra (un segmento borrado ya deja value ""); quitar es la × explícita.
  const confirmarCaptura = (v: string) => {
    cancelarProgramado();
    if (pending) return;
    if (v === (guardadoRef.current ?? "")) return;
    if (fechaCapturable(v)) guardar(v);
    else restaurar();
  };

  const bloqueado = oculto || pending;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        oculto && "opacity-60",
      )}
      title={
        oculto
          ? "Oculto en el PDF: la fecha no aparece"
          : "Fecha que verá el cliente en el PDF para este tramo (solo fecha, sin hora). No cambia la ruta operativa ni las fechas de vuelo."
      }
    >
      {pending ? (
        <ArrowPathIcon className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <Input
        key={fecha ?? ""}
        ref={inputRef}
        type="date"
        defaultValue={fecha ?? ""}
        min="2000-01-01"
        max="2100-12-31"
        disabled={bloqueado}
        aria-label="Fecha del tramo en el PDF"
        className="h-6 w-[8.75rem] px-1.5 py-0 font-mono text-[11px] md:text-[11px]"
        onChange={(e) => {
          // Elegir del calendario o completar la fecha a mano: se guarda
          // tras una pausa corta (ver DEBOUNCE_MS) para no interrumpir la
          // captura; un valor incompleto solo cancela lo programado.
          cancelarProgramado();
          const v = e.target.value;
          if (!fechaCapturable(v)) return;
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            guardar(v);
          }, DEBOUNCE_MS);
        }}
        onBlur={(e) => confirmarCaptura(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmarCaptura(e.currentTarget.value);
          }
        }}
      />
      {fecha && !oculto && (
        <button
          type="button"
          onClick={() => guardar(null)}
          disabled={pending}
          aria-label="Quitar la fecha del PDF"
          title="Quitar la fecha del PDF"
          className="inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
