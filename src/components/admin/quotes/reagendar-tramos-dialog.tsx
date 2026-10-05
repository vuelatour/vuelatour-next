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
  moverVueloOperativo,
  textosDialogoReagendar,
  toastAlCerrarSinMover,
  type ContextoReagendar,
} from "@/lib/admin/quote-fecha-operativa";

/**
 * «Se actualizó la fecha de la cotización» (5-oct-2026). Sale al GUARDAR una
 * cotización cuya fecha cambió y cuyo vuelo operativo sigue en otro día (la
 * decisión es `decidirPreguntaReagendar`, en el workspace). Vive FUERA de la
 * hoja y del cotizador: el cliente pidió explícitamente que esto no agregue
 * nada a la estructura de la hoja de cotización. El MISMO diálogo lo abre la
 * banda ámbar del detalle del vuelo (`contexto="vuelo"`, revisión 5-oct-2026)
 * cuando contestaron «No» y quieren moverlo después en un clic.
 *
 * - «Sí, mover el vuelo operativo» ⇒ `moverVueloOperativo` (llama a
 *   `alinearFechaTramosAction`; NUNCA lanza: un throw de la server action ya
 *   no tumba la pantalla al error boundary) ⇒ toast con lo que movió el API ⇒
 *   `router.refresh()`. Mientras guarda, los dos botones se apagan; si falla,
 *   el diálogo se QUEDA abierto con el motivo en rojo (se puede reintentar o
 *   salir). Si el error pudo dejar tramos movidos (503 `TRAMOS_NO_MOVIDOS`,
 *   5xx, red) también se refresca: el cotizador limpio se resetea con lo que
 *   quedó en la BD y un guardado posterior no revierte lo movido.
 * - «No» (o Esc) ⇒ `toastAlCerrarSinMover`: «la operación no cambió…» solo
 *   si de verdad no pudo cambiar; tras un error de ese tipo, el neutro «Revisa
 *   las fechas de los tramos…».
 *
 * Todos los textos vienen de `lib/admin/quote-fecha-operativa.ts`.
 */
export function ReagendarTramosDialog({
  abierto,
  nuevaFecha,
  fechaOperativa,
  vueloId,
  onCerrar,
  contexto = "cotizacion",
}: {
  abierto: boolean;
  /** `fecha_vuelo` de la cotización (ISO). */
  nuevaFecha: string;
  /** `fecha_salida_plan` del primer tramo vivo del vuelo (ISO). */
  fechaOperativa: string;
  vueloId: string;
  onCerrar: () => void;
  /** Dónde se abre (ADITIVO): al guardar la cotización (default) o desde el vuelo. */
  contexto?: ContextoReagendar;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Hubo un error que pudo dejar tramos movidos (pegajoso hasta cerrar). */
  const [quizaMovio, setQuizaMovio] = useState(false);
  const textos = textosDialogoReagendar(contexto, nuevaFecha, fechaOperativa);

  /** «No» / Esc: la operación no se toca; se dice dónde moverla después. */
  const cerrarSinMover = () => {
    if (pending) return;
    const aviso = toastAlCerrarSinMover({ contexto, quizaMovio });
    setError(null);
    setQuizaMovio(false);
    if (aviso) toast.info(aviso);
    onCerrar();
  };

  const mover = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const r = await moverVueloOperativo(() => alinearFechaTramosAction(vueloId));
      if (!r.ok) {
        setError(r.error);
        if (r.refrescar) {
          setQuizaMovio(true);
          router.refresh();
        }
        return;
      }
      setQuizaMovio(false);
      toast.success(r.toast);
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
          <AlertDialogTitle>{textos.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{textos.descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {textos.nota}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer" disabled={pending}>
            {textos.botonNo}
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              mover();
            }}
          >
            {pending ? textos.botonMoviendo : textos.botonMover}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
