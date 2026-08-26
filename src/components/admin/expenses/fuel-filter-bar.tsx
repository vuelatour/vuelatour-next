"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

/**
 * Filtros de Combustibles: MES (eje fecha_gasto, igual que el reparto) +
 * aeronave. Van por querystring: el server component recarga con el periodo
 * aplicado y el resumen por avión siempre corresponde al mes elegido.
 */
export function FuelFilterBar({
  mes,
  aeronaveId,
  aircraft,
}: {
  /** Mes vigente YYYY-MM (default: mes corriente en hora Cancún). */
  mes: string;
  aeronaveId: string;
  aircraft: { id: string; matricula: string; modelo: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = useCallback(
    (cambios: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
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
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Mes</p>
        {/* key = valor: si la URL cambia por otro lado, el input se re-monta
            con el mes vigente (defaultValue no se re-aplica solo). */}
        <Input
          key={mes}
          type="month"
          defaultValue={mes}
          onChange={(e) => set({ mes: e.target.value })}
        />
      </div>
      <div className="w-52">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Aeronave
        </p>
        <SearchableSelect
          options={[
            { value: "", label: "Todas" },
            ...aircraft.map((a) => ({
              value: a.id,
              label: a.matricula,
              description: a.modelo,
            })),
          ]}
          value={aeronaveId}
          onChange={(v) => set({ aeronave_id: v })}
          placeholder="Todas"
          searchPlaceholder="Buscar matrícula…"
        />
      </div>
    </div>
  );
}
