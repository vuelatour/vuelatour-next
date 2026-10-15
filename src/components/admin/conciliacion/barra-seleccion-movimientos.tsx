"use client";

/**
 * Barra FIJA «Movimientos seleccionados» de Conciliación (14-oct-2026, API
 * 0.0.77). Se pinta con al menos una fila seleccionada; abajo al centro,
 * debajo de los diálogos (z-40 < z-50) y sin scroll horizontal a 360 px (los
 * botones se acomodan con `flex-wrap`).
 *
 * La barra NO decide nada: el resumen por tipo y moneda (guía visual en
 * centavos; la suma que decide la calcula el API) y qué acción aplica salen
 * de `lib/admin/conciliacion-seleccion.ts`. Ningún botón se apaga por una
 * regla de negocio: si la acción no aplica, su motivo se VE en la barra y el
 * clic lo repite en un `toast.info` sin abrir el diálogo. Los diálogos los
 * monta la tabla (con una copia congelada de la selección), no la barra.
 */

import type { ReactNode } from "react";
import { toast } from "sonner";
import { ArrowUturnLeftIcon, LinkIcon, NoSymbolIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  BOTON_DESHACER_OMISION,
  BOTON_LIMPIAR,
  BOTON_OMITIR,
  BOTON_VINCULAR_A_GASTO,
  ETIQUETA_REGION_SELECCION,
  accionesDeSeleccion,
  textoResumenSeleccion,
  textoSeleccionRetirada,
  type AccionSeleccion,
  type ResumenSeleccion,
  type VistaSeleccion,
} from "@/lib/admin/conciliacion-seleccion";

export interface BarraSeleccionMovimientosProps {
  vista: VistaSeleccion;
  resumen: ResumenSeleccion;
  /** Marcadas que dejaron de calificar (un refresh): se dice en gris. */
  retirados: number;
  onOmitir: () => void;
  onDeshacer: () => void;
  onLimpiar: () => void;
  /** «Vincular a un gasto…» (varios cargos → un gasto): sin él no se ofrece. */
  onVincular?: () => void;
}

export function BarraSeleccionMovimientos(p: BarraSeleccionMovimientosProps) {
  const acciones = accionesDeSeleccion(p.resumen, p.vista);
  const retirada = textoSeleccionRetirada(p.retirados, p.vista);

  /** El botón de una acción: si no aplica, repite su motivo (nunca se apaga). */
  const boton = (accion: AccionSeleccion, texto: string, icono: ReactNode, abrir: () => void) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer gap-1.5"
      onClick={() => {
        if (accion.aplica) abrir();
        else if (accion.motivo) toast.info(accion.motivo);
      }}
    >
      {icono}
      {texto}
    </Button>
  );

  const vincular = p.vista === "lista" && p.onVincular ? acciones.vincular : null;
  const motivos = [
    vincular && !vincular.aplica ? vincular.motivo : null,
    p.vista === "lista" && !acciones.omitir.aplica ? acciones.omitir.motivo : null,
    p.vista === "omitidos" && !acciones.deshacer.aplica ? acciones.deshacer.motivo : null,
  ].filter((m): m is string => !!m);

  return (
    <div
      role="region"
      aria-label={ETIQUETA_REGION_SELECCION}
      className="fixed bottom-6 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-card px-4 py-2 shadow-lg"
    >
      <p aria-live="polite" className="text-sm font-medium">
        {textoResumenSeleccion(p.resumen)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {vincular &&
          p.onVincular &&
          boton(vincular, BOTON_VINCULAR_A_GASTO, <LinkIcon className="h-4 w-4" aria-hidden />, p.onVincular)}
        {p.vista === "lista" &&
          boton(acciones.omitir, BOTON_OMITIR, <NoSymbolIcon className="h-4 w-4" aria-hidden />, p.onOmitir)}
        {p.vista === "omitidos" &&
          boton(
            acciones.deshacer,
            BOTON_DESHACER_OMISION,
            <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden />,
            p.onDeshacer,
          )}
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer gap-1.5" onClick={p.onLimpiar}>
          <XMarkIcon className="h-4 w-4" aria-hidden />
          {BOTON_LIMPIAR}
        </Button>
      </div>
      {motivos.map((m) => (
        <p key={m} className="max-w-prose text-xs text-muted-foreground">
          {m}
        </p>
      ))}
      {retirada && <p className="text-xs text-muted-foreground">{retirada}</p>}
    </div>
  );
}
