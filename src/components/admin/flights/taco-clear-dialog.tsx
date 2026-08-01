"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { clearTacoAction } from "@/app/admin/flights/actions";

/**
 * Borrar las lecturas de un tramo (por lado) con CONFIRMACIÓN, para que el
 * piloto las vuelva a capturar. Caso que lo motivó: el primer vuelo se demoró
 * y el piloto capturó sus tacómetros en el vuelo equivocado — "Corregir"
 * obligaba a inventar otro número; lo que se necesitaba era dejarlo limpio.
 *
 * Solo oficina (el API exige ADMIN/COORDINADOR). Al borrar una llegada de un
 * vuelo COMPLETADO, el vuelo regresa a EN_VUELO y el piloto recibe un push
 * para recapturar.
 */
export function TacoClearDialog({
  flightId,
  escalaId,
  ruta,
  tieneSalida,
  tieneLlegada,
}: {
  flightId: string;
  escalaId: string;
  ruta: string;
  tieneSalida: boolean;
  tieneLlegada: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [salida, setSalida] = useState(true);
  const [llegada, setLlegada] = useState(true);

  if (!tieneSalida && !tieneLlegada) return null;

  const borrar = () =>
    startTransition(async () => {
      const res = await clearTacoAction(flightId, escalaId, {
        salida: tieneSalida && salida,
        llegada: tieneLlegada && llegada,
      });
      if (res.ok) {
        toast.success(
          "Lecturas borradas. El piloto ya puede volver a capturarlas (le llegó un aviso).",
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudieron borrar las lecturas");
      }
    });

  const nadaSeleccionado = !(tieneSalida && salida) && !(tieneLlegada && llegada);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        title="Borrar lecturas del tramo (para recapturar)"
        aria-label="Borrar lecturas del tramo"
        onClick={() => {
          setSalida(true);
          setLlegada(true);
          setOpen(true);
        }}
      >
        <TrashIcon className="h-4 w-4" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar lecturas · {ruta}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la lectura, su foto y su hora para que el piloto las
              capture de nuevo (le llega un aviso). Si el vuelo estaba
              COMPLETADO y queda sin una llegada, regresa a EN VUELO. Queda
              registrado quién borró.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            {tieneSalida && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={salida}
                  onChange={(e) => setSalida(e.target.checked)}
                />
                Borrar la lectura de <span className="font-medium">salida</span>
              </label>
            )}
            {tieneLlegada && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={llegada}
                  onChange={(e) => setLlegada(e.target.checked)}
                />
                Borrar la lectura de <span className="font-medium">llegada</span>
              </label>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                borrar();
              }}
              disabled={pending || nadaSeleccionado}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Borrando…" : "Borrar lecturas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
