"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const ESTADOS_OPERATIVOS: { value: EstadoVuelo | ""; label: string }[] = [
  { value: "", label: "Todos los activos" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EN_VUELO", label: "En vuelo" },
  { value: "COMPLETADO", label: "Completado" },
  { value: "CANCELADO", label: "Cancelado" },
];

interface FlightsFilterBarProps {
  aircraft: { id: string; label: string }[];
  pilots: { id: string; nombre: string }[];
  initial: {
    estado: string;
    piloto_id: string;
    aeronave_id: string;
    desde: string;
    hasta: string;
  };
}

export function FlightsFilterBar({
  aircraft,
  pilots,
  initial,
}: FlightsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const pushQuery = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  const hasFilters = !!(
    initial.estado ||
    initial.piloto_id ||
    initial.aeronave_id ||
    initial.desde ||
    initial.hasta
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-5 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estado</Label>
          <SearchableSelect
            options={ESTADOS_OPERATIVOS.map((e) => ({ value: e.value, label: e.label }))}
            value={initial.estado}
            onChange={(v) => pushQuery({ estado: v })}
            placeholder="Todos los activos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Aeronave</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              ...aircraft.map((a) => ({ value: a.id, label: a.label })),
            ]}
            value={initial.aeronave_id}
            onChange={(v) => pushQuery({ aeronave_id: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Piloto</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...pilots.map((p) => ({ value: p.id, label: p.nombre })),
            ]}
            value={initial.piloto_id}
            onChange={(v) => pushQuery({ piloto_id: v })}
            placeholder="Todos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Desde</Label>
          <Input
            type="date"
            defaultValue={initial.desde}
            onChange={(e) => pushQuery({ desde: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Hasta</Label>
            {hasFilters && (
              <button
                type="button"
                onClick={() =>
                  pushQuery({
                    estado: "",
                    piloto_id: "",
                    aeronave_id: "",
                    desde: "",
                    hasta: "",
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
          <Input
            type="date"
            defaultValue={initial.hasta}
            onChange={(e) => pushQuery({ hasta: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
