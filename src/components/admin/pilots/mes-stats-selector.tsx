"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInicioOficial } from "@/components/admin/inicio-oficial-provider";
import { mesInicio, pisoMes } from "@/lib/admin/inicio-oficial";

/**
 * Selector del MES de las estadísticas del expediente del piloto: empuja
 * ?mes=YYYY-MM a la URL (el server component recarga las stats de ese mes).
 * Sin valor = mes corriente. Inicio oficial (auditoría 16-oct-2026): no
 * ofrece meses anteriores al del inicio (`min`) y un mes tecleado antes sube
 * al del inicio; sin inicio, libre como siempre.
 */
export function MesStatsSelector({ mes }: { mes: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const inicio = useInicioOficial();

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Estadísticas del mes
      </Label>
      <Input
        key={mes}
        type="month"
        defaultValue={mes}
        min={mesInicio(inicio)}
        className="w-40 h-8 text-sm"
        onChange={(e) => {
          const v = pisoMes(e.target.value, inicio);
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
