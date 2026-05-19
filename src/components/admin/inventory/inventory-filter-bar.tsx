"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Props {
  categorias: string[];
  initial: {
    q: string;
    categoria: string;
    bajo_stock: string;
  };
}

export function InventoryFilterBar({ categorias, initial }: Props) {
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

  const hasFilters = !!(initial.q || initial.categoria || initial.bajo_stock);

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Buscar</Label>
          <Input
            placeholder="Nombre o número de parte"
            defaultValue={initial.q}
            onChange={(e) => pushQuery({ q: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Categoría</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              ...categorias.map((c) => ({ value: c, label: c })),
            ]}
            value={initial.categoria}
            onChange={(v) => pushQuery({ categoria: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Stock</Label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => pushQuery({ q: "", categoria: "", bajo_stock: "" })}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
          <SearchableSelect
            options={[
              { value: "", label: "Todo el inventario" },
              { value: "1", label: "Solo stock bajo / agotado" },
            ]}
            value={initial.bajo_stock}
            onChange={(v) => pushQuery({ bajo_stock: v })}
            placeholder="Todo el inventario"
          />
        </div>
      </CardContent>
    </Card>
  );
}
