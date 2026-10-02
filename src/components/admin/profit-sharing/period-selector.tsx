"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayCancun } from "@/lib/datetime";
import { etiquetaMes, mesAnterior, rangoMesPasado } from "@/lib/admin/reparto-pagos";
import { MesReporteSelect } from "./mes-reporte-select";

interface Props {
  initial: { desde: string; hasta: string };
  /** Selector de MES + atajo «Mes pasado» (1-oct-2026: el cliente cierra
   *  septiembre en octubre y los pagos a socios se registran por MES
   *  COMPLETO; elegir un mes empuja `desde`/`hasta` en UNA sola navegación). */
  atajoMesPasado?: boolean;
  /** Hoy en Cancún desde el servidor (evita que el atajo difiera al hidratar). */
  hoy?: string;
}

export function PeriodSelector({ initial, atajoMesPasado = false, hoy: hoyServidor }: Props) {
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

  // «Hoy» se fija UNA vez: el del servidor o, sin él, el del navegador.
  const [hoy] = useState(() => hoyServidor ?? todayCancun());
  const mesPasado = atajoMesPasado ? rangoMesPasado(hoy) : null;
  const mesPasadoNombre = atajoMesPasado ? mesAnterior(hoy) : null;
  const enMesPasado =
    mesPasado !== null && initial.desde === mesPasado.desde && initial.hasta === mesPasado.hasta;

  return (
    <Card>
      <CardContent className="p-4 grid gap-3 sm:grid-cols-2 max-w-md">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Periodo desde</Label>
          {/* key = valor: si otro control (p. ej. el selector de mes del
              cierre) cambia el periodo en la URL, el input se re-monta y
              muestra la fecha vigente (defaultValue no se re-aplica solo). */}
          {/* Rango invertido = ambas fechas al valor nuevo (arrastra la otra):
              antes el 400 del API tumbaba la página con el selector adentro. */}
          <Input
            key={initial.desde}
            type="date"
            max={initial.hasta}
            defaultValue={initial.desde}
            onChange={(e) => {
              const v = e.target.value;
              pushQuery(
                v && v > initial.hasta ? { desde: v, hasta: v } : { desde: v },
              );
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Periodo hasta</Label>
          <Input
            key={initial.hasta}
            type="date"
            min={initial.desde}
            defaultValue={initial.hasta}
            onChange={(e) => {
              const v = e.target.value;
              pushQuery(
                v && v < initial.desde ? { desde: v, hasta: v } : { hasta: v },
              );
            }}
          />
        </div>
        {atajoMesPasado && (
          <MesReporteSelect
            className="sm:col-span-2"
            desde={initial.desde}
            hasta={initial.hasta}
            etiqueta="Mes"
          />
        )}
        {mesPasado && mesPasadoNombre && (
          <div className="sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant={enMesPasado ? "secondary" : "outline"}
              className="cursor-pointer gap-1.5"
              aria-pressed={enMesPasado}
              data-atajo="mes-pasado"
              title={`Del ${mesPasado.desde.split("-").reverse().join("/")} al ${mesPasado.hasta
                .split("-")
                .reverse()
                .join("/")}`}
              onClick={() => pushQuery({ desde: mesPasado.desde, hasta: mesPasado.hasta })}
            >
              <CalendarDaysIcon className="h-4 w-4" aria-hidden />
              Mes pasado · {etiquetaMes(mesPasadoNombre)}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
