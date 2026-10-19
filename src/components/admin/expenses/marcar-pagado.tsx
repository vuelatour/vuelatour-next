"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CLASES_CHIP_ESTADO_PAGO,
  TEXTO_MARCAR_PAGADO,
  TITULO_CHIP_BOTON,
  chipEstadoPago,
  type ChipEstadoPago as Chip,
  type GastoPorPagar,
} from "@/lib/admin/gasto-por-pagar";

/**
 * El diálogo vive en `marcar-pagado-dialog.tsx` y se carga SOLO al abrirlo
 * (`next/dynamic` sin SSR): las tablas que pintan el chip no arrastran la
 * server action ni su cadena (`apiServer` ⇒ variables de entorno) al
 * renderizar. Se precarga al pasar el puntero o enfocar el botón.
 */
const MarcarPagadoDialog = dynamic(
  () => import("./marcar-pagado-dialog").then((m) => m.MarcarPagadoDialog),
  { ssr: false },
);
const precargarDialogo = () => {
  void import("./marcar-pagado-dialog");
};

/**
 * Gastos «por pagar» (19-oct-2026, API 0.0.95, contrato §7): el chip junto a
 * la fecha («Por pagar · 20 oct» ámbar / «Vencido · 20 oct» rojo) y el
 * diálogo «Marcar pagado» (fecha del pago, default hoy Cancún, máximo hoy ⇒
 * `PATCH {por_pagar:false, fecha_gasto, if_updated_at}`). El estado lo
 * calcula el API (`estado_pago`): sin la llave no se pinta NADA. Textos y
 * reglas en `lib/admin/gasto-por-pagar.ts`.
 */

const CLASE_CHIP_BASE =
  "inline-flex w-fit items-center rounded-full border px-1.5 py-px text-[11px] font-medium leading-tight whitespace-nowrap";

/** El chip, solo lectura (sin hooks: sirve donde no se marca pagado). */
export function ChipEstadoPagoGasto({ chip, className }: { chip: Chip | null; className?: string }) {
  if (!chip) return null;
  return (
    <span
      className={cn(CLASE_CHIP_BASE, CLASES_CHIP_ESTADO_PAGO[chip.tono], className)}
      title={chip.titulo}
      data-estado-pago={chip.estado}
    >
      {chip.texto}
      <span className="sr-only"> · {chip.titulo}</span>
    </span>
  );
}

/**
 * El chip como BOTÓN que abre «Marcar pagado» (la manera directa: el
 * operador ve «Vencido · 20 oct» en rojo y lo pulsa). `aria-haspopup`: con
 * el foco aquí, ↑/↓ no mueven la fila activa de la tabla.
 */
export function BotonChipPorPagar({ gasto, className }: { gasto: GastoPorPagar; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const chip = chipEstadoPago(gasto);
  if (!chip) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        onPointerEnter={precargarDialogo}
        onFocus={precargarDialogo}
        aria-haspopup="dialog"
        title={`${chip.titulo} ${TITULO_CHIP_BOTON}`}
        data-estado-pago={chip.estado}
        className={cn(
          CLASE_CHIP_BASE,
          CLASES_CHIP_ESTADO_PAGO[chip.tono],
          "cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {chip.texto}
        <span className="sr-only"> · {TITULO_CHIP_BOTON}</span>
      </button>
      {abierto && <MarcarPagadoDialog gasto={gasto} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

/** Botón «Marcar pagado» suelto (caja chica) que abre el MISMO diálogo. */
export function BotonMarcarPagado({ gasto, className }: { gasto: GastoPorPagar; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAbierto(true)}
        onPointerEnter={precargarDialogo}
        onFocus={precargarDialogo}
        aria-haspopup="dialog"
        className={cn("h-7 cursor-pointer gap-1 px-2 text-xs", className)}
      >
        <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {TEXTO_MARCAR_PAGADO}
      </Button>
      {abierto && <MarcarPagadoDialog gasto={gasto} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
