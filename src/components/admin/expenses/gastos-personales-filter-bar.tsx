"use client";

import { useCallback, useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryCambioDeMes } from "@/lib/admin/url-params";
import { useInicioOficial } from "@/components/admin/inicio-oficial-provider";
import { mesInicio } from "@/lib/admin/inicio-oficial";

/**
 * Filtro de MES (eje fecha_gasto, hora Cancún). Va por querystring: el server
 * component recarga con el periodo aplicado y el resumen por moneda/medio
 * siempre corresponde al mes elegido.
 *
 * GENÉRICO: navega a la ruta ACTUAL (`usePathname`) con `?mes=YYYY-MM` y
 * conserva los demás parámetros salvo `tp` (la página de la tabla: otro mes
 * arranca en la 1; la búsqueda `tq` se conserva, como en la barra de Gastos).
 * Esa regla es `queryCambioDeMes` (`lib/admin/url-params.ts`), la MISMA de
 * los enlaces «‹ mes» / «mes ›» de Nómina: cambiar de mes con el campo o con
 * un enlace deja igual la búsqueda.
 * Lo usan Gastos personales y, desde el 15-oct-2026, Nómina (`/admin/nomina`,
 * entre sus enlaces «‹ mes» y «mes ›»): un cambio aquí cambia las dos
 * pantallas. Al reutilizarlo se le ligó la etiqueta «Mes» al campo
 * (`Label` con `htmlFor`/`id`: antes el campo no tenía nombre accesible) y
 * se le puso la manita (la etiqueta ligada la trae; el selector, aquí).
 * Ancho `w-52` (208 px): en teléfono el campo va a 16 px y con `w-44` el
 * ícono del calendario tapaba el año de «septiembre/noviembre/diciembre de
 * 2026» (QA del 15-oct-2026).
 */
export function GastosPersonalesFilterBar({ mes }: { mes: string }) {
  const router = useRouter();
  // Inicio oficial (16-oct-2026): el mes no baja del inicio. Sin él, libre.
  const inicio = useInicioOficial();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const idMes = useId();

  const setMes = useCallback(
    (valor: string) => {
      const qs = queryCambioDeMes(params.toString(), valor);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-52">
        <Label htmlFor={idMes} className="mb-1 text-[11px] leading-normal text-muted-foreground">
          Mes
        </Label>
        {/* key = valor: si la URL cambia por otro lado, el input se re-monta
            con el mes vigente (defaultValue no se re-aplica solo). */}
        <Input
          key={mes}
          id={idMes}
          type="month"
          min={mesInicio(inicio)}
          defaultValue={mes}
          onChange={(e) => setMes(e.target.value)}
          className="cursor-pointer"
        />
      </div>
    </div>
  );
}
