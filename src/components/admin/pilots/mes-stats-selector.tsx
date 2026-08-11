"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Selector del MES de las estadísticas del expediente del piloto: empuja
 * ?mes=YYYY-MM a la URL (el server component recarga las stats de ese mes).
 * Sin valor = mes corriente.
 */
export function MesStatsSelector({ mes }: { mes: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Estadísticas del mes
      </Label>
      <Input
        key={mes}
        type="month"
        defaultValue={mes}
        className="w-40 h-8 text-sm"
        onChange={(e) => {
          const v = e.target.value;
          const sp = new URLSearchParams(params.toString());
          if (v) sp.set("mes", v);
          else sp.delete("mes");
          const qs = sp.toString();
          startTransition(() => {
            router.replace(qs ? `${pathname}?${qs}` : pathname);
          });
        }}
      />
    </div>
  );
}
