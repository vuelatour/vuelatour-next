"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ESTADO_OPTIONS } from "@/app/admin/expirations/schema";
import { AMBITO_OPTIONS } from "@/app/admin/document-types/schema";

interface Props {
  aircraft: { id: string; matricula: string }[];
  pilots: { id: string; nombre: string }[];
  initial: {
    ambito: string;
    estado: string;
    aeronave_id: string;
    piloto_id: string;
  };
}

export function ExpirationsFilterBar({ aircraft, pilots, initial }: Props) {
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
    initial.ambito ||
    initial.estado ||
    initial.aeronave_id ||
    initial.piloto_id
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estado</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...ESTADO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={initial.estado}
            onChange={(v) => pushQuery({ estado: v })}
            placeholder="Todos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Ámbito</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...AMBITO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={initial.ambito}
            onChange={(v) => pushQuery({ ambito: v })}
            placeholder="Todos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Aeronave</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
            ]}
            value={initial.aeronave_id}
            onChange={(v) => pushQuery({ aeronave_id: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Piloto</Label>
            {hasFilters && (
              <button
                type="button"
                onClick={() =>
                  pushQuery({ ambito: "", estado: "", aeronave_id: "", piloto_id: "" })
                }
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
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
      </CardContent>
    </Card>
  );
}
