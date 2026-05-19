"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  CATEGORIA_OPTIONS,
  ESTATUS_COMPROBANTE_OPTIONS,
  MEDIO_PAGO_OPTIONS,
} from "@/app/admin/expenses/schema";

const SIN_ASIGNAR = "__none__";

interface Props {
  aircraft: { id: string; matricula: string }[];
  initial: {
    categoria: string;
    medio_pago: string;
    estatus_comprobante: string;
    aeronave_id: string;
    sin_aeronave: string;
    desde: string;
    hasta: string;
  };
}

export function ExpensesFilterBar({ aircraft, initial }: Props) {
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

  const aeronaveValue = initial.sin_aeronave
    ? SIN_ASIGNAR
    : initial.aeronave_id;

  const onAeronaveChange = (v: string) => {
    if (v === SIN_ASIGNAR) pushQuery({ sin_aeronave: "1", aeronave_id: "" });
    else pushQuery({ aeronave_id: v, sin_aeronave: "" });
  };

  const hasFilters = !!(
    initial.categoria ||
    initial.medio_pago ||
    initial.estatus_comprobante ||
    initial.aeronave_id ||
    initial.sin_aeronave ||
    initial.desde ||
    initial.hasta
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Categoría</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              ...CATEGORIA_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={initial.categoria}
            onChange={(v) => pushQuery({ categoria: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Medio de pago</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...MEDIO_PAGO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={initial.medio_pago}
            onChange={(v) => pushQuery({ medio_pago: v })}
            placeholder="Todos"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Aeronave</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              { value: SIN_ASIGNAR, label: "Sin asignar (pendientes)" },
              ...aircraft.map((a) => ({ value: a.id, label: a.matricula })),
            ]}
            value={aeronaveValue}
            onChange={onAeronaveChange}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Comprobante</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              ...ESTATUS_COMPROBANTE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
            value={initial.estatus_comprobante}
            onChange={(v) => pushQuery({ estatus_comprobante: v })}
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
                    categoria: "",
                    medio_pago: "",
                    estatus_comprobante: "",
                    aeronave_id: "",
                    sin_aeronave: "",
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
