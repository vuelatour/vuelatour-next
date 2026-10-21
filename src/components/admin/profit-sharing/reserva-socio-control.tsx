"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { cambiarDescuentoReservaAction } from "@/app/admin/profit-sharing/actions";
import {
  ETIQUETA_CAMBIAR_RESERVA,
  ETIQUETA_SE_DESCUENTA,
  ETIQUETA_SOLO_INFORMATIVA,
  TEXTO_SIN_RENGLON_PROPIETARIO,
  TITULO_CAMBIAR_RESERVA,
  TITULO_SE_DESCUENTA,
  TITULO_SOLO_INFORMATIVA,
  confirmacionDescuentoReserva,
  toastDescuentoReserva,
} from "@/lib/admin/reparto-avion";

/** Badge «se le descuenta» / «solo informativa» (sin hooks: también en la card). */
export function BadgeReservaSocio({ descuenta, className }: { descuenta: boolean; className?: string }) {
  return (
    <span
      data-reserva-socio={descuenta ? "descuenta" : "informativa"}
      title={descuenta ? TITULO_SE_DESCUENTA : TITULO_SOLO_INFORMATIVA}
      className={cn(
        "inline-flex items-center rounded border px-1.5 text-[10px] font-medium leading-tight",
        descuenta
          ? "border-brand-600/30 bg-brand-600/10 text-brand-600 dark:text-brand-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        className,
      )}
    >
      {descuenta ? ETIQUETA_SE_DESCUENTA : ETIQUETA_SOLO_INFORMATIVA}
    </span>
  );
}

/**
 * «¿Se le descuenta la reserva de overhaul a este socio o solo se le
 * informa?» (20-oct-2026, API 0.0.101). Solo ADMIN. Es dinero: el cambio se
 * CONFIRMA con el texto que explica la consecuencia; la action hace el PATCH
 * de cada renglón de `aeronave_socio` del socio en el periodo. Sin renglón
 * (no cargaron los propietarios o el socio ya no está) solo se pinta el
 * badge y se dice dónde cambiarlo.
 */
export function ReservaSocioControl({
  aeronaveId,
  matricula,
  socio,
  ownerIds,
  descuenta,
  puedeCambiar,
}: {
  aeronaveId: string;
  matricula: string;
  socio: { id: string; nombre: string };
  /** Renglones de `aeronave_socio` del socio que cuentan en el periodo. */
  ownerIds: string[];
  descuenta: boolean;
  puedeCambiar: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const nuevo = !descuenta;
  const textos = confirmacionDescuentoReserva({ socio: socio.nombre, matricula, descontar: nuevo });

  const confirmar = () => {
    setError(null);
    empezar(async () => {
      let res: Awaited<ReturnType<typeof cambiarDescuentoReservaAction>>;
      try {
        res = await cambiarDescuentoReservaAction(aeronaveId, ownerIds, nuevo);
      } catch {
        setError("No se pudo confirmar el cambio con el servidor. Recarga la página para ver si se guardó.");
        return;
      }
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar el cambio.");
        return;
      }
      toast.success(toastDescuentoReserva(socio.nombre, nuevo));
      setAbierto(false);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <BadgeReservaSocio descuenta={descuenta} />
      {puedeCambiar &&
        (ownerIds.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 cursor-pointer px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            title={TITULO_CAMBIAR_RESERVA}
            aria-label={`${TITULO_CAMBIAR_RESERVA}: ${socio.nombre}`}
            data-accion="cambiar-reserva-socio"
            onClick={() => {
              setError(null);
              setAbierto(true);
            }}
          >
            {ETIQUETA_CAMBIAR_RESERVA}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground" title={TEXTO_SIN_RENGLON_PROPIETARIO}>
            (se cambia en la ficha del avión)
          </span>
        ))}
      <AlertDialog open={abierto} onOpenChange={(o) => !o && !pendiente && setAbierto(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{textos.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textos.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente} className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer"
              disabled={pendiente}
              data-accion="confirmar-reserva-socio"
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
            >
              {pendiente ? "Guardando…" : textos.boton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}
