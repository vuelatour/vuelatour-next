"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayCancun } from "@/lib/datetime";
import { etiquetaMes, mesAnterior, rangoMesPasado } from "@/lib/admin/reparto-pagos";
import {
  ESPERA_APLICAR_MS,
  periodoAlCambiar,
  periodoCambia,
  queryDePeriodo,
  type Periodo,
} from "@/lib/admin/periodo-selector";
import { MesReporteSelect } from "./mes-reporte-select";

interface Props {
  initial: { desde: string; hasta: string };
  /** Selector de MES + atajo «Mes pasado» (1-oct-2026: el cliente cierra
   *  septiembre en octubre; elegir un mes empuja `desde`/`hasta` en UNA sola
   *  navegación). */
  atajoMesPasado?: boolean;
  /** Hoy en Cancún desde el servidor (evita que el atajo difiera al hidratar). */
  hoy?: string;
}

/**
 * Desde / Hasta del periodo (12-oct-2026, «se traba el calendario»): los
 * inputs guardan un BORRADOR mientras se escribe y solo navegan con una
 * fecha COMPLETA, tras una pausa (`ESPERA_APLICAR_MS`) o al salir del campo
 * / Enter. Nunca se re-montan a media edición: el valor de la URL solo
 * vuelve a mandar cuando el borrador ya se aplicó (o se descartó por
 * incompleto al salir). Reglas puras en `lib/admin/periodo-selector.ts`.
 */
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

  // Borrador de lo que se está tecleando, guardado contra QUÉ periodo de la
  // URL se escribió (patrón de `CierreRepartoSection`): en cuanto la URL
  // cambia (la navegación llegó, o el selector de mes movió el periodo) la
  // base deja de coincidir y vuelve a mandar la URL — sin efectos ni estados
  // que sincronizar.
  const [borrador, setBorrador] = useState<{ base: Periodo; periodo: Periodo } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarEspera = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);
  useEffect(() => cancelarEspera, [cancelarEspera]);

  const vigente =
    borrador && borrador.base.desde === initial.desde && borrador.base.hasta === initial.hasta
      ? borrador.periodo
      : null;
  const visible = vigente ?? initial;
  const guardarBorrador = useCallback(
    (periodo: Periodo | null) =>
      setBorrador(periodo ? { base: { desde: initial.desde, hasta: initial.hasta }, periodo } : null),
    [initial.desde, initial.hasta],
  );

  const aplicar = useCallback(
    (periodo: Periodo) => {
      cancelarEspera();
      if (!periodoCambia(initial, periodo)) {
        guardarBorrador(null);
        return;
      }
      guardarBorrador(periodo);
      pushQuery(queryDePeriodo(periodo));
    },
    [cancelarEspera, guardarBorrador, initial, pushQuery],
  );

  const onCambio = (campo: keyof Periodo, valor: string) => {
    cancelarEspera();
    const completo = periodoAlCambiar(visible, campo, valor);
    if (!completo) {
      // A medio teclear: se conserva lo escrito y no se navega nada.
      guardarBorrador({ ...visible, [campo]: valor });
      return;
    }
    guardarBorrador(completo);
    temporizador.current = setTimeout(() => aplicar(completo), ESPERA_APLICAR_MS);
  };

  const onSalir = (campo: keyof Periodo) => {
    const completo = periodoAlCambiar(visible, campo, visible[campo]);
    if (completo) aplicar(completo);
    else guardarBorrador(null); // incompleto al salir: vuelve lo que está en la URL
  };

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
          <Label className="text-xs font-medium" htmlFor="periodo-desde">
            Periodo desde
          </Label>
          <Input
            id="periodo-desde"
            type="date"
            value={visible.desde}
            onChange={(e) => onCambio("desde", e.target.value)}
            onBlur={() => onSalir("desde")}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSalir("desde");
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium" htmlFor="periodo-hasta">
            Periodo hasta
          </Label>
          <Input
            id="periodo-hasta"
            type="date"
            value={visible.hasta}
            onChange={(e) => onCambio("hasta", e.target.value)}
            onBlur={() => onSalir("hasta")}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSalir("hasta");
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
              onClick={() => aplicar({ desde: mesPasado.desde, hasta: mesPasado.hasta })}
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
