"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ESTADO_GRUPO_LABEL, ESTADOS_GRUPO } from "@/lib/admin/grupos-ui";

interface GruposFilterBarProps {
  clients: { id: string; nombre: string }[];
  initial: {
    estado: string;
    cliente_id: string;
    desde: string;
    hasta: string;
    q: string;
  };
}

/**
 * Filtros de la lista de grupos (mismo patrón que Cotizaciones/Vuelos): los
 * valores viven en la URL y el server vuelve a consultar. `desde`/`hasta`
 * son días Cancún (YYYY-MM-DD) por fecha de salida del grupo.
 */
export function GruposFilterBar({ clients, initial }: GruposFilterBarProps) {
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
    initial.cliente_id ||
    initial.desde ||
    initial.hasta ||
    initial.q
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_200px_200px_150px_150px] items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Buscar</Label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              defaultValue={initial.q}
              placeholder="Nombre del grupo o folio (G-12)…"
              className="pl-9"
              onChange={(e) => pushQuery({ q: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estado</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos los estados" },
              ...ESTADOS_GRUPO.map((e) => ({ value: e, label: ESTADO_GRUPO_LABEL[e] })),
            ]}
            value={initial.estado}
            onChange={(v) => pushQuery({ estado: v })}
            placeholder="Todos los estados"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cliente</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos los clientes" },
              ...clients.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
            value={initial.cliente_id}
            onChange={(v) => pushQuery({ cliente_id: v })}
            placeholder="Todos los clientes"
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
                  pushQuery({ estado: "", cliente_id: "", desde: "", hasta: "", q: "" })
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
