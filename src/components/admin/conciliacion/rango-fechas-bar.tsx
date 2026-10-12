"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hayRango,
  hrefConciliacion,
  periodosRapidosConciliacion,
  rangoVistaConciliacion,
  textoRangoVista,
} from "@/lib/admin/conciliacion-vista";
import { cn } from "@/lib/utils";

const TITULO_FECHA = "Fecha del movimiento en el estado de cuenta (día de Cancún)";

/**
 * Filtro de FECHAS de la vista de Conciliación (12-oct-2026): «Desde» /
 * «Hasta» + periodos rápidos + «Limpiar». El rango vive en la URL
 * (`?desde`/`?hasta`) y se LEE con `useSearchParams` — nunca
 * `useState(propDelServer)`: al volver del detalle Next reusa el payload viejo
 * de la página (regla de las tablas, 24-sep-2026). Conserva `?f` y `?cuenta`.
 * Quien APLICA el rango es la página (lista, tarjetas por cuenta, pestañas
 * «sin banco»); «Cruzar pendientes», la IA, el reporte Excel y la auditoría
 * Paywise lo heredan de la misma URL.
 */
export function RangoFechasConciliacion({ hoy }: { hoy: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const rango = rangoVistaConciliacion(sp.get("desde"), sp.get("hasta"), hoy);
  const ir = (desde: string | null | undefined, hasta: string | null | undefined) =>
    router.push(hrefConciliacion({ f: sp.get("f"), cuenta: sp.get("cuenta"), desde, hasta }));
  const texto = textoRangoVista(rango);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="conc-desde" className="mb-1 text-[11px] text-muted-foreground">
            Desde
          </Label>
          <Input
            id="conc-desde"
            type="date"
            value={rango.desde ?? ""}
            max={hoy}
            onChange={(e) => ir(e.target.value || null, rango.hasta)}
            className="h-9 w-36 cursor-pointer"
            title={TITULO_FECHA}
          />
        </div>
        <div>
          <Label htmlFor="conc-hasta" className="mb-1 text-[11px] text-muted-foreground">
            Hasta
          </Label>
          <Input
            id="conc-hasta"
            type="date"
            value={rango.hasta ?? ""}
            max={hoy}
            onChange={(e) => ir(rango.desde, e.target.value || null)}
            className="h-9 w-36 cursor-pointer"
            title={TITULO_FECHA}
          />
        </div>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {periodosRapidosConciliacion(hoy).map((p) => {
            const activo = p.desde === rango.desde && p.hasta === rango.hasta;
            return (
              <button
                key={p.clave}
                type="button"
                onClick={() => ir(p.desde, p.hasta)}
                aria-pressed={activo}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
                  activo
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {p.etiqueta}
              </button>
            );
          })}
        </div>
        {hayRango(rango) && (
          <button
            type="button"
            onClick={() => ir(null, null)}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {texto
          ? `Mostrando movimientos ${texto}: tarjetas, lista y pestañas «sin banco». «Cruzar pendientes», la IA y el reporte usan el mismo periodo.`
          : "Sin periodo: se muestran los movimientos más recientes de todas las fechas (en «sin banco», los últimos 90 días)."}
      </p>
    </div>
  );
}
