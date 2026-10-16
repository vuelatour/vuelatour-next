"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRangoBorrador, type CambiosUrl } from "@/hooks/use-rango-borrador";
import {
  consultaBaseParaNavegar,
  pendienteVigente,
  type CampoRangoLista,
  type ConsultaPendiente,
} from "@/lib/admin/quote-navegacion";
import {
  ETIQUETA_PERIODO_HISTORIAL,
  TEXTO_LIMPIAR_PERIODO,
  TITULO_FECHA_HISTORIAL,
  TITULO_LIMPIAR_PERIODO,
  hayRangoHistorial,
  rangoHistorialCaja,
} from "@/lib/admin/caja-chica-madre";
import { CLASE_FILTRO_ACTIVO, TEXTO_ACTUALIZANDO } from "@/lib/admin/gastos-vista";

/**
 * Filtro Desde/Hasta del HISTORIAL de una caja (15-oct-2026, pedido del
 * cliente: «y le agregas un filtro de fecha de desde hasta»). Va en la URL
 * (`?desde=&hasta=`, días `AAAA-MM-DD` validados con `rangoHistorialCaja`)
 * con el MISMO borrador de fechas de Cotizaciones/Gastos
 * (`useRangoBorrador`: nada navega a media tecla). La página filtra las
 * FILAS sobre el libro completo: el saldo de cada fila y las tarjetas no
 * cambian.
 */
export function HistorialPeriodoFiltro() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const rango = rangoHistorialCaja(sp.get("desde"), sp.get("hasta"));
  const [actualizando, startTransition] = useTransition();
  // La última consulta PEDIDA (patrón de Gastos): caduca cuando la URL se mueve.
  const pendiente = useRef<ConsultaPendiente | null>(null);
  useEffect(() => {
    pendiente.current = pendienteVigente(sp.toString(), pendiente.current);
  }, [sp]);

  const paramsParaNavegar = useCallback(
    () => new URLSearchParams(consultaBaseParaNavegar(sp.toString(), pendiente.current)),
    [sp],
  );

  const navegar = useCallback(
    (cambios: CambiosUrl) => {
      const viva = sp.toString();
      const params = paramsParaNavegar();
      const antes = new URLSearchParams(params);
      antes.delete("tp");
      for (const [k, v] of Object.entries(cambios)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      // Otro periodo = de vuelta a la página 1 de la tabla (la búsqueda se queda).
      params.delete("tp");
      const qs = params.toString();
      if (qs === antes.toString()) return;
      pendiente.current = { base: viva, consulta: qs };
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [sp, paramsParaNavegar, pathname, router],
  );

  const periodo = useRangoBorrador({
    claveDesde: "desde",
    claveHasta: "hasta",
    deUrl: { desde: rango.desde ?? "", hasta: rango.hasta ?? "" },
    navegar,
    rangoParaNavegar: () => {
      const p = paramsParaNavegar();
      const base = rangoHistorialCaja(p.get("desde"), p.get("hasta"));
      return { desde: base.desde ?? "", hasta: base.hasta ?? "" };
    },
  });

  const limpiar = () => {
    periodo.soltar();
    navegar({ desde: null, hasta: null });
  };

  const campo = (c: CampoRangoLista, etiqueta: string) => (
    <Input
      id={`caja-historial-${c}`}
      type="date"
      value={periodo.visible[c]}
      aria-label={`${ETIQUETA_PERIODO_HISTORIAL}: ${etiqueta}`}
      title={TITULO_FECHA_HISTORIAL}
      className={cn(
        "h-9 min-w-0 flex-1 cursor-pointer sm:w-[8.5rem] sm:flex-none",
        periodo.visible[c] && CLASE_FILTRO_ACTIVO,
      )}
      onChange={(e) => periodo.onCambio(c, e.target.value)}
      onBlur={() => periodo.onSalir(c)}
      onKeyDown={(e) => {
        if (e.key === "Enter") periodo.onSalir(c);
      }}
    />
  );

  return (
    <div
      role="group"
      aria-label="Periodo del historial"
      className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto"
    >
      <span className="text-xs font-medium text-muted-foreground">{ETIQUETA_PERIODO_HISTORIAL}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
        {campo("desde", "desde")}
        <span aria-hidden="true" className="text-muted-foreground">
          –
        </span>
        {campo("hasta", "hasta")}
      </div>
      {hayRangoHistorial(rango) && (
        <button
          type="button"
          onClick={limpiar}
          title={TITULO_LIMPIAR_PERIODO}
          className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {TEXTO_LIMPIAR_PERIODO}
        </button>
      )}
      <span role="status" className="inline-flex items-center text-xs text-muted-foreground">
        {actualizando && (
          <>
            <ArrowPathIcon className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {TEXTO_ACTUALIZANDO}
          </>
        )}
      </span>
    </div>
  );
}
