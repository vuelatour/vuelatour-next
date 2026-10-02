"use client";

import { useId, useMemo, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { destinoFiltroMeses, opcionesFiltroMeses } from "@/lib/admin/reparto-pagos";

/**
 * Filtro «Desde / Hasta» (meses) del estado de cuenta. Empuja `?desde=` y
 * `?hasta=` (YYYY-MM) SIEMPRE juntos en UNA navegación
 * (`destinoFiltroMeses`: nunca un rango invertido ni un `hasta` suelto);
 * «Toda la cuenta» los quita (el API usa del arranque de la cuenta al mes en
 * curso). Las opciones arrancan en el mes más viejo entre el arranque, el
 * `desde` que se ve y `mesMinimo` (`opcionesFiltroMeses`): una entrega
 * anterior al arranque siempre se alcanza desde aquí.
 */
export function FiltroMesesCuenta({
  desde,
  hasta,
  cuentaDesdeMes,
  mesActual,
  mesMinimo = null,
  filtrado,
}: {
  /** Lo que muestra hoy el estado de cuenta (`YYYY-MM`). */
  desde: string;
  hasta: string;
  cuentaDesdeMes: string;
  mesActual: string;
  /** Mes de la entrega más antigua fechada antes del arranque (si la hay). */
  mesMinimo?: string | null;
  /** true = la URL trae filtro (se ofrece «Toda la cuenta»). */
  filtrado: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, empezar] = useTransition();
  const idDesde = useId();
  const idHasta = useId();
  const opciones = useMemo(
    () => opcionesFiltroMeses({ cuentaDesdeMes, desde, mesActual, mesMinimo }),
    [cuentaDesdeMes, desde, mesActual, mesMinimo],
  );

  const ir = (filtro: { desde: string; hasta: string } | null) => {
    const qs = new URLSearchParams();
    if (filtro) {
      qs.set("desde", filtro.desde);
      qs.set("hasta", filtro.hasta);
    }
    const q = qs.toString();
    empezar(() => router.replace(q ? `${pathname}?${q}` : pathname));
  };

  return (
    <div className="flex flex-wrap items-end gap-3" data-filtro-meses-cuenta>
      <div className="min-w-44 space-y-1.5">
        <Label htmlFor={idDesde} className="text-xs font-medium">
          Desde
        </Label>
        <SearchableSelect
          id={idDesde}
          options={opciones}
          value={desde}
          onChange={(v) => ir(destinoFiltroMeses("desde", v, desde, hasta))}
          placeholder="Mes"
          searchPlaceholder="Buscar mes…"
          disabled={pendiente}
        />
      </div>
      <div className="min-w-44 space-y-1.5">
        <Label htmlFor={idHasta} className="text-xs font-medium">
          Hasta
        </Label>
        <SearchableSelect
          id={idHasta}
          options={opciones}
          value={hasta}
          onChange={(v) => ir(destinoFiltroMeses("hasta", v, desde, hasta))}
          placeholder="Mes"
          searchPlaceholder="Buscar mes…"
          disabled={pendiente}
        />
      </div>
      {filtrado && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          disabled={pendiente}
          onClick={() => ir(null)}
        >
          Toda la cuenta
        </Button>
      )}
    </div>
  );
}
