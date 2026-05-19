"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Props {
  bankAccounts: { id: string; alias: string }[];
  initial: {
    cuenta_bancaria_id: string;
    conciliado: string;
    desde: string;
    hasta: string;
  };
}

export function TreasuryFilterBar({ bankAccounts, initial }: Props) {
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
    initial.cuenta_bancaria_id ||
    initial.conciliado ||
    initial.desde ||
    initial.hasta
  );

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cuenta</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todas" },
              ...bankAccounts.map((b) => ({ value: b.id, label: b.alias })),
            ]}
            value={initial.cuenta_bancaria_id}
            onChange={(v) => pushQuery({ cuenta_bancaria_id: v })}
            placeholder="Todas"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Conciliación</Label>
          <SearchableSelect
            options={[
              { value: "", label: "Todos" },
              { value: "false", label: "Pendientes de conciliar" },
              { value: "true", label: "Conciliados" },
            ]}
            value={initial.conciliado}
            onChange={(v) => pushQuery({ conciliado: v })}
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
                    cuenta_bancaria_id: "",
                    conciliado: "",
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
