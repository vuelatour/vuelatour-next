"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { alinearFechaTramosAction } from "@/app/admin/flights/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BOTON_MOVER,
  BOTON_MOVIENDO,
  BOTON_SOLO_COTIZACION,
  mensajeErrorReagendar,
  NOTA_SOLO_FECHA,
  textoReagendar,
  TITULO_REAGENDAR,
  TOAST_NO_MOVIDO,
  toastReagendado,
} from "@/lib/admin/quote-fecha-operativa";

/**
 * «Se actualizó la fecha de la cotización» (5-oct-2026). Sale al GUARDAR una
 * cotización cuya fecha cambió y cuyo vuelo operativo sigue en otro día (la
 * decisión es `decidirPreguntaReagendar`, en el workspace). Vive FUERA de la
 * hoja y del cotizador: el cliente pidió explícitamente que esto no agregue
 * nada a la estructura de la hoja de cotización.
 *
 * - «Sí, mover el vuelo operativo» ⇒ `alinearFechaTramosAction` ⇒ toast con
 *   lo que movió el API ⇒ `router.refresh()`. Mientras guarda, los dos
 *   botones se apagan; si falla, el diálogo se QUEDA abierto con el motivo en
 *   rojo (se puede reintentar o salir con «No»).
 * - «No, solo la cotización» (o Esc) ⇒ toast informativo y se cierra: la
 *   operación queda como estaba y se mueve después desde el vuelo.
 *
 * Todos los textos vienen de `lib/admin/quote-fecha-operativa.ts`.
 */
export function ReagendarTramosDialog({
  abierto,
  nuevaFecha,
  fechaOperativa,
  vueloId,
  onCerrar,
}: {
  abierto: boolean;
  /** `fecha_vuelo` de la cotización recién guardada (ISO). */
  nuevaFecha: string;
  /** `fecha_salida_plan` del primer tramo vivo del vuelo (ISO). */
  fechaOperativa: string;
  vueloId: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** «No» / Esc: la operación no se toca; se dice dónde moverla después. */
  const cerrarSinMover = () => {
    if (pending) return;
    setError(null);
    toast.info(TOAST_NO_MOVIDO);
    onCerrar();
  };

  const mover = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await alinearFechaTramosAction(vueloId);
      if (!res.ok) {
        setError(mensajeErrorReagendar(res));
        return;
      }
      toast.success(toastReagendado(res.data));
      onCerrar();
      router.refresh();
    });
  };

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) cerrarSinMover();
      }}
    >
      <AlertDialogContent
        className="data-[size=default]:sm:max-w-md"
        data-reagendar-tramos=""
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{TITULO_REAGENDAR}</AlertDialogTitle>
          <AlertDialogDescription>
            {textoReagendar(nuevaFecha, fechaOperativa)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {NOTA_SOLO_FECHA}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={pending}>
            {BOTON_SOLO_COTIZACION}
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              mover();
            }}
          >
            {pending ? BOTON_MOVIENDO : BOTON_MOVER}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
