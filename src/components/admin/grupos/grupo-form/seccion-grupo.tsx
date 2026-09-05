"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SeccionGrupoId =
  | "revision"
  | "grupo"
  | "ruta"
  | "cargos"
  | "tuas"
  | "aviones"
  | "consolidado"
  | "notas";

/**
 * Card-sección colapsable del wizard de grupo — mismo patrón visual y de
 * accesibilidad que `SeccionCotizador` del cotizador de un avión (encabezado
 * clickeable con resumen cuando está plegada, badge ámbar de aviso siempre
 * visible, cuerpo escondido con `hidden` para no desmontar los inputs).
 */
export function SeccionGrupo({
  id,
  titulo,
  resumen,
  aviso,
  abierta,
  onToggle,
  children,
}: {
  id: SeccionGrupoId;
  titulo: string;
  /** Resumen compacto; visible solo con la sección plegada. */
  resumen?: ReactNode;
  /** Aviso activo: badge ámbar SIEMPRE visible — un warning no se esconde. */
  aviso?: string | null;
  abierta: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="border-t-2 border-t-brand-600/60">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={`seccion-grupo-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 text-left"
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-2 font-heading text-base font-medium leading-snug">
            {titulo}
            {aviso && (
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/15 text-[10px] text-amber-600 dark:text-amber-400"
              >
                {aviso}
              </Badge>
            )}
          </span>
          {!abierta && resumen && (
            <span className="block truncate text-xs text-muted-foreground">{resumen}</span>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            abierta && "rotate-180",
          )}
        />
      </button>
      <div id={`seccion-grupo-${id}`} hidden={!abierta} className="px-4">
        <div className="space-y-4">{children}</div>
      </div>
    </Card>
  );
}

/**
 * Valor LEGIBLE de un campo en modo lectura (página única del grupo,
 * 5-sep-2026): misma etiqueta que el campo editable, el valor como texto —
 * nunca un input gris deshabilitado.
 */
export function DatoLectura({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-[11px] uppercase tracking-wider text-foreground/70">{label}</p>
      <div className="text-sm font-medium">{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
