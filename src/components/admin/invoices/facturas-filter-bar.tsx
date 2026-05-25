"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface FacturasFilterBarProps {
  clients: { id: string; nombre: string }[];
  emisoras: { id: string; label: string }[];
  initial: { desde: string; hasta: string; cliente_id: string; emisora_id: string };
}

export function FacturasFilterBar({ clients, emisoras, initial }: FacturasFilterBarProps) {
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
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const hasFilters = !!(initial.desde || initial.hasta || initial.cliente_id || initial.emisora_id);

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cliente</Label>
          <SearchableSelect
            options={[{ value: "", label: "Todos" }, ...clients.map((c) => ({ value: c.id, label: c.nombre }))]}
            value={initial.cliente_id}
            onChange={(v) => pushQuery({ cliente_id: v })}
            placeholder="Todos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Entidad emisora (facturas)</Label>
          <SearchableSelect
            options={[{ value: "", label: "Todas" }, ...emisoras.map((e) => ({ value: e.id, label: e.label }))]}
            value={initial.emisora_id}
            onChange={(v) => pushQuery({ emisora_id: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Desde</Label>
          <Input type="date" defaultValue={initial.desde} onChange={(e) => pushQuery({ desde: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Hasta</Label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => pushQuery({ desde: "", hasta: "", cliente_id: "", emisora_id: "" })}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
          <Input type="date" defaultValue={initial.hasta} onChange={(e) => pushQuery({ hasta: e.target.value })} />
        </div>
      </CardContent>
    </Card>
  );
}
