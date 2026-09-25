"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BanknotesIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { cn } from "@/lib/utils";
import {
  AVISO_ENTRADAS_SIN_COSTO,
  PERIODOS_TIENDA,
  PERIODO_TIENDA_DEFAULT,
  TITULO_TARJETA_TIENDA,
  avisoVentasSinUtilidad,
  lineaUnidadesTienda,
  notaUtilidad,
  numeroONulo,
  partesUtilidad,
  textoPeriodoTienda,
  type PeriodoTienda,
} from "@/lib/admin/inventario-utilidad";
import { filtroUbicacionDeUrl } from "@/lib/admin/inventario-ubicacion";
import type { TiendaResumen } from "@/types/inventory";

interface UtilidadTiendaCardProps {
  /** `GET tienda/resumen` del periodo; null = no se pudo saber (API previo/falla). */
  resumen: TiendaResumen | null;
  /** Respaldo con las sumas de la lista (MISMA moneda, jamás cruzadas). */
  respaldo: {
    utilidad_mxn: number | null;
    utilidad_usd: number | null;
    unidades_vendidas: number | null;
    ventas_sin_utilidad: number;
    con_entradas_sin_costo: boolean;
  };
  periodo: PeriodoTienda;
  /** Rango del periodo (días Cancún) para el Excel; null = todo el historial. */
  rango: { desde: string; hasta: string } | null;
  margenVentaPct?: number | null;
  /**
   * Ids del catálogo de ubicaciones cuando está DISPONIBLE (el Excel respeta
   * el filtro vigente). null = sin catálogo: el Excel no manda `ubicacion`
   * (un API previo respondería 400 y, sin migración, 503).
   */
  ubicacionesIds: string[] | null;
}

/**
 * «Utilidad de la tienda» (25-sep-2026): lo que la tienda VuelaTour le ha
 * ganado a lo que se carga a los aviones — pesos y dólares POR SEPARADO,
 * nunca sumados. Chips de periodo (enlaces que conservan orden, filtro y
 * búsqueda de la URL viva), unidades vendidas, margen vigente y avisos de
 * cifras no confiables. Todo número viene del API.
 */
export function UtilidadTiendaCard({
  resumen,
  respaldo,
  periodo,
  rango,
  margenVentaPct,
  ubicacionesIds,
}: UtilidadTiendaCardProps) {
  const sp = useSearchParams();
  const margen = resumen?.margen_venta_pct ?? margenVentaPct ?? null;
  const utilidad = resumen
    ? { mxn: numeroONulo(resumen.utilidad_mxn), usd: numeroONulo(resumen.utilidad_usd) }
    : { mxn: respaldo.utilidad_mxn, usd: respaldo.utilidad_usd };
  const partes = partesUtilidad(utilidad);
  const unidades = resumen ? resumen.unidades_vendidas : respaldo.unidades_vendidas;
  const sinUtilidad = resumen ? resumen.ventas_sin_utilidad : respaldo.ventas_sin_utilidad;
  const sinCosto = resumen ? resumen.con_entradas_sin_costo : respaldo.con_entradas_sin_costo;

  const hrefPeriodo = (valor: PeriodoTienda) => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (valor === PERIODO_TIENDA_DEFAULT) params.delete("periodo");
    else params.set("periodo", valor);
    params.delete("tp");
    const qs = params.toString();
    return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
  };

  // El Excel sale con el periodo y el filtro de ubicación que se ven.
  const ubic = ubicacionesIds
    ? filtroUbicacionDeUrl(sp?.get("ubic"), ubicacionesIds.map((id) => ({ id })))
    : null;
  const queryExcel: Record<string, string | undefined> = {
    desde: rango?.desde,
    hasta: rango?.hasta,
    ubicacion: ubic ?? undefined,
  };

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <BanknotesIcon className="h-4 w-4" aria-hidden="true" />
              {TITULO_TARJETA_TIENDA}
              <span className="normal-case tracking-normal">· {textoPeriodoTienda(periodo)}</span>
            </p>
            {partes.length === 0 ? (
              <p className="text-xl font-semibold text-muted-foreground">Sin ventas en el periodo</p>
            ) : (
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {partes.map((p) => (
                  <span
                    key={p.moneda}
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      p.tono === "positivo"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : p.tono === "negativo"
                          ? "text-red-600"
                          : "text-foreground",
                    )}
                  >
                    {p.texto}
                  </span>
                ))}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {unidades != null ? lineaUnidadesTienda(unidades, margen) : null}
              {unidades != null ? " · " : null}
              <Link
                href="/admin/configuracion"
                className="cursor-pointer underline underline-offset-2 hover:text-foreground"
              >
                se cambia en Configuración
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
              {PERIODOS_TIENDA.map((p) => {
                const activo = p.valor === periodo;
                return (
                  <Link
                    key={p.valor}
                    href={hrefPeriodo(p.valor)}
                    aria-current={activo ? "true" : undefined}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      activo
                        ? "bg-brand-600 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.etiqueta}
                  </Link>
                );
              })}
            </div>
            <ExcelExportButton
              path="/v1/inventory/items/export"
              filename="inventario.xlsx"
              label="Excel"
              query={queryExcel}
            />
          </div>
        </div>

        {(sinUtilidad > 0 || sinCosto) && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {[sinUtilidad > 0 ? avisoVentasSinUtilidad(sinUtilidad) : null, sinCosto ? AVISO_ENTRADAS_SIN_COSTO : null]
                .filter(Boolean)
                .join(" ")}
            </span>
          </div>
        )}

        <p className="text-xs text-muted-foreground/80">{notaUtilidad(margen)}</p>
      </CardContent>
    </Card>
  );
}
