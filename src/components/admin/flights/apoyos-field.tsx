"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

export interface ApoyoOption {
  id: string;
  nombre: string;
  email?: string | null;
}

/** Chip que NO se edita aquí (p. ej. apoyo de todo el vuelo en el editor del tramo). */
export interface ApoyoFijo {
  id: string;
  nombre: string;
  /** Sufijo discreto, p. ej. " (del vuelo)". */
  sufijo?: string;
  title?: string;
}

interface ApoyosFieldProps {
  /** Ids seleccionados (los que se editan aquí). */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Candidatos (todos los usuarios activos; el nombre ya trae el rol). */
  candidatos: ApoyoOption[];
  /** Ids que NO se ofrecen: piloto/copiloto efectivos, apoyos ya del vuelo… */
  excluir?: (string | null | undefined)[];
  /** Ids ya GUARDADOS: quitarlos pide confirmación (regla del cliente). */
  persistidos?: string[];
  /** Nombres de respaldo para ids que ya no están en candidatos (usuario dado de baja). */
  nombres?: Record<string, string>;
  /** Chips fijos que se muestran pero no se quitan aquí. */
  fijos?: ApoyoFijo[];
  /** Ids seleccionados que chocan con piloto/copiloto (se pintan en rojo). */
  conflictos?: string[];
  /** Texto de la confirmación al quitar (contexto: vuelo o tramo). */
  confirmDescripcion: string;
  emptyText?: string;
  disabled?: boolean;
}

/** Igualdad de listas de ids sin importar el orden (para no mandar la lista si no cambió). */
export function mismoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((id) => s.has(id));
}

/**
 * Apoyos en tierra 0..N: chips + «Agregar apoyo» (29-ago-2026). Misma pieza en
 * la tripulación del vuelo y en la asignación por tramo. Quitar un apoyo que
 * YA estaba guardado pide confirmación; el cambio real se aplica al Guardar
 * del formulario que lo contiene.
 */
export function ApoyosField({
  value,
  onChange,
  candidatos,
  excluir = [],
  persistidos = [],
  nombres = {},
  fijos = [],
  conflictos = [],
  confirmDescripcion,
  emptyText = "Sin apoyo",
  disabled,
}: ApoyosFieldProps) {
  const [toRemove, setToRemove] = useState<{ id: string; nombre: string } | null>(null);

  const nombreDe = (id: string) =>
    candidatos.find((c) => c.id === id)?.nombre ?? nombres[id] ?? "Usuario";

  const noOfrecer = new Set<string>([
    ...value,
    ...excluir.filter((x): x is string => !!x),
  ]);
  const opciones = candidatos
    .filter((c) => !noOfrecer.has(c.id))
    .map((c) => ({ value: c.id, label: c.nombre, description: c.email ?? undefined }));

  const quitar = (id: string) => onChange(value.filter((x) => x !== id));

  const pedirQuitar = (id: string) => {
    // Solo lo ya guardado se confirma; lo recién agregado se quita directo.
    if (persistidos.includes(id)) setToRemove({ id, nombre: nombreDe(id) });
    else quitar(id);
  };

  return (
    <div className="space-y-2">
      {fijos.length > 0 || value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {fijos.map((f) => (
            <Badge
              key={`fijo-${f.id}`}
              variant="outline"
              className="h-6 gap-1 text-xs text-muted-foreground"
              title={f.title}
            >
              {f.nombre}
              {f.sufijo && <span className="opacity-80">{f.sufijo}</span>}
            </Badge>
          ))}
          {value.map((id) => {
            const nombre = nombreDe(id);
            const conflicto = conflictos.includes(id);
            return (
              <Badge
                key={id}
                variant="outline"
                className={cn(
                  "h-6 gap-1 pr-1 text-xs",
                  conflicto && "border-destructive/50 text-destructive",
                )}
                title={conflicto ? "Es el piloto o el copiloto: no puede ser apoyo." : undefined}
              >
                {nombre}
                <button
                  type="button"
                  onClick={() => pedirQuitar(id)}
                  disabled={disabled}
                  className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
                  aria-label={`Quitar a ${nombre}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
      {/* Siempre vacío: al elegir se agrega a la lista y vuelve al placeholder. */}
      <SearchableSelect
        options={opciones}
        value=""
        onChange={(id) => {
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
        placeholder="+ Agregar apoyo"
        emptyText="Sin usuarios disponibles"
        disabled={disabled}
      />

      <Dialog open={toRemove !== null} onOpenChange={(o) => !o && setToRemove(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Quitar a {toRemove?.nombre} del apoyo?</DialogTitle>
            <DialogDescription>{confirmDescripcion}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToRemove(null)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (toRemove) quitar(toRemove.id);
                setToRemove(null);
              }}
            >
              Sí, quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
