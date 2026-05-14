"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const ESTADOS: { value: EstadoVuelo | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "SOLICITUD", label: "Solicitud" },
  { value: "COTIZADO", label: "Cotizado" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EN_VUELO", label: "En vuelo" },
  { value: "COMPLETADO", label: "Completado" },
  { value: "CANCELADO", label: "Cancelado" },
];

interface QuotesFilterBarProps {
  clients: { id: string; nombre: string }[];
  initial: { estado: string; cliente_id: string; q: string };
}

export function QuotesFilterBar({ clients, initial }: QuotesFilterBarProps) {
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

  const hasFilters = !!(initial.estado || initial.cliente_id || initial.q);

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-[1fr_220px_220px_auto] items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Buscar</Label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              defaultValue={initial.q}
              placeholder="Folio, ruta IATA…"
              className="pl-9"
              onChange={(e) => pushQuery({ q: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estado</Label>
          <SearchableSelect
            options={ESTADOS.map((e) => ({ value: e.value, label: e.label }))}
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
        {hasFilters && (
          <button
            type="button"
            onClick={() => pushQuery({ estado: "", cliente_id: "", q: "" })}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
            Limpiar
          </button>
        )}
      </CardContent>
    </Card>
  );
}
