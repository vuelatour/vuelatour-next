"use client";

import { useEffect, useMemo } from "react";
import { PlusIcon, TrashIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { fmtDecimal } from "@/lib/format";
import type { EscalaInput } from "@/types/quote";

interface RouteOption {
  id: string;
  origen_iata: string;
  destino_iata: string;
  millas_nauticas: number;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

/**
 * Editor de tramos para vuelos MULTIESCALA. El primer origen lo decide el usuario
 * (normalmente CUN). Cada tramo nuevo prellena el origen con el destino del
 * anterior (continuidad obligatoria — el backend valida lo mismo). Las millas
 * náuticas se autocompletan si existe una ruta predefinida CUN-HOL, etc.
 */
export function QuoteLegsEditor({
  value,
  onChange,
  routes,
  airports,
  defaultOrigin = "CUN",
}: {
  value: EscalaInput[];
  onChange: (legs: EscalaInput[]) => void;
  routes?: RouteOption[];
  airports: AirportOption[];
  defaultOrigin?: string;
}) {
  // Inicializa con un tramo si está vacío.
  useEffect(() => {
    if (value.length === 0) {
      onChange([{ origen_iata: defaultOrigin, destino_iata: "", millas_nauticas: 0 }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const airportOptions = useMemo(
    () =>
      airports.map((a) => ({
        value: a.iata,
        label: a.iata,
        description: a.nombre,
      })),
    [airports],
  );

  const lookupNm = (origen: string, destino: string): number | null => {
    if (!origen || !destino || !routes) return null;
    const r = routes.find(
      (r) =>
        r.origen_iata.toUpperCase() === origen.toUpperCase() &&
        r.destino_iata.toUpperCase() === destino.toUpperCase(),
    );
    return r ? r.millas_nauticas : null;
  };

  const updateLeg = (idx: number, patch: Partial<EscalaInput>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    // Si cambiamos destino, propaga al origen del siguiente tramo (continuidad).
    if (patch.destino_iata !== undefined && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], origen_iata: patch.destino_iata };
    }
    // Autocompleta NM si tenemos ambos extremos y una ruta predefinida coincide.
    if (patch.destino_iata !== undefined || patch.origen_iata !== undefined) {
      const o = next[idx].origen_iata;
      const d = next[idx].destino_iata;
      const nm = lookupNm(o, d);
      if (nm !== null) next[idx].millas_nauticas = nm;
    }
    onChange(next);
  };

  const addLeg = () => {
    const last = value[value.length - 1];
    const newLeg: EscalaInput = {
      origen_iata: last?.destino_iata ?? defaultOrigin,
      destino_iata: "",
      millas_nauticas: 0,
    };
    onChange([...value, newLeg]);
  };

  const removeLeg = (idx: number) => {
    if (value.length <= 1) return;
    const next = value.filter((_, i) => i !== idx);
    // Restaurar continuidad: origen del nuevo siguiente = destino del nuevo previo.
    if (idx > 0 && idx <= next.length - 1) {
      next[idx] = { ...next[idx], origen_iata: next[idx - 1].destino_iata };
    }
    onChange(next);
  };

  const nmTotal = value.reduce((acc, l) => acc + (Number(l.millas_nauticas) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((leg, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === value.length - 1;
          const originLocked = !isFirst; // los origenes intermedios vienen del tramo previo
          return (
            <div
              key={idx}
              className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Tramo {idx + 1}
                  {isFirst && " · salida"}
                  {isLast && value.length > 1 && " · llegada"}
                </span>
                {value.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLeg(idx)}
                    className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Origen
                  </Label>
                  <SearchableSelect
                    options={airportOptions}
                    value={leg.origen_iata}
                    onChange={(v) => updateLeg(idx, { origen_iata: v })}
                    placeholder="IATA"
                    disabled={originLocked}
                  />
                </div>
                <ArrowRightIcon className="h-4 w-4 text-muted-foreground mb-2" />
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Destino
                  </Label>
                  <SearchableSelect
                    options={airportOptions}
                    value={leg.destino_iata}
                    onChange={(v) => updateLeg(idx, { destino_iata: v })}
                    placeholder="IATA"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Millas náuticas
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={leg.millas_nauticas || ""}
                  onChange={(e) =>
                    updateLeg(idx, {
                      millas_nauticas: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="0.00"
                  className={cn(
                    leg.millas_nauticas > 0 ? "" : "border-amber-500/40",
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLeg}
          className="gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Agregar tramo
        </Button>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{fmtDecimal(nmTotal)}</span> NM totales ·{" "}
          {value.length} {value.length === 1 ? "tramo" : "tramos"}
        </p>
      </div>
    </div>
  );
}
