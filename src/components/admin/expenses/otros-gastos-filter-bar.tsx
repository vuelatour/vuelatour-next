"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Filtro de MES de Otros gastos (eje fecha_gasto, hora Cancún). Va por
 * querystring: el server component recarga con el periodo aplicado y el
 * resumen (total/asignado/empresa) siempre corresponde al mes elegido.
 */
export function OtrosGastosFilterBar({ mes }: { mes: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const setMes = useCallback(
    (valor: string) => {
      const sp = new URLSearchParams(params.toString());
      if (valor) sp.set("mes", valor);
      else sp.delete("mes");
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Mes</p>
        {/* key = valor: si la URL cambia por otro lado, el input se re-monta
            con el mes vigente (defaultValue no se re-aplica solo). */}
        <Input
          key={mes}
          type="month"
          defaultValue={mes}
          onChange={(e) => setMes(e.target.value)}
        />
      </div>
    </div>
  );
}
