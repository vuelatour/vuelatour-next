"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initial: { desde: string; hasta: string };
}

export function PeriodSelector({ initial }: Props) {
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

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 sm:grid-cols-2 max-w-md">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Periodo desde</Label>
          {/* key = valor: si otro control (p. ej. el selector de mes del
              cierre) cambia el periodo en la URL, el input se re-monta y
              muestra la fecha vigente (defaultValue no se re-aplica solo). */}
          <Input
            key={initial.desde}
            type="date"
            defaultValue={initial.desde}
            onChange={(e) => pushQuery({ desde: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Periodo hasta</Label>
          <Input
            key={initial.hasta}
            type="date"
            defaultValue={initial.hasta}
            onChange={(e) => pushQuery({ hasta: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
