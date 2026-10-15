"use client";

import { useCallback, useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Filtro de MES (eje fecha_gasto, hora Cancún). Va por querystring: el server
 * component recarga con el periodo aplicado y el resumen por moneda/medio
 * siempre corresponde al mes elegido.
 *
 * GENÉRICO: navega a la ruta ACTUAL (`usePathname`) con `?mes=YYYY-MM` y
 * conserva los demás parámetros salvo `tp` (la página de la tabla: otro mes
 * arranca en la 1; la búsqueda `tq` se conserva, como en la barra de Gastos).
 * Lo usan Gastos personales y, desde el 15-oct-2026, Nómina (`/admin/nomina`,
 * entre sus enlaces «‹ mes» y «mes ›»): un cambio aquí cambia las dos
 * pantallas. Al reutilizarlo se le ligó la etiqueta «Mes» al campo
 * (`Label` con `htmlFor`/`id`: antes el campo no tenía nombre accesible) y
 * se le puso la manita (la etiqueta ligada la trae; el selector, aquí).
 */
export function GastosPersonalesFilterBar({ mes }: { mes: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const idMes = useId();

  const setMes = useCallback(
    (valor: string) => {
      const sp = new URLSearchParams(params.toString());
      if (valor) sp.set("mes", valor);
      else sp.delete("mes");
      sp.delete("tp");
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
        <Label htmlFor={idMes} className="mb-1 text-[11px] leading-normal text-muted-foreground">
          Mes
        </Label>
        {/* key = valor: si la URL cambia por otro lado, el input se re-monta
            con el mes vigente (defaultValue no se re-aplica solo). */}
        <Input
          key={mes}
          id={idMes}
          type="month"
          defaultValue={mes}
          onChange={(e) => setMes(e.target.value)}
          className="cursor-pointer"
        />
      </div>
    </div>
  );
}
