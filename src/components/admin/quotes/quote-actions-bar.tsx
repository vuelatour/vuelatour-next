"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelQuoteAction,
  confirmQuoteAction,
} from "@/app/admin/quotes/actions";
import { cotizacionEditablePorFecha } from "@/lib/datetime";
import type { PersistedQuote } from "@/types/quotes-persisted";

export function QuoteActionsBar({ quote }: { quote: PersistedQuote }) {
  const router = useRouter();
  const [confirming, startConfirm] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [openCancel, setOpenCancel] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [openCobradoInfo, setOpenCobradoInfo] = useState(false);

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${env.API_URL}/v1/quotes/${quote.id}/pdf`, {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        toast.error("No se pudo generar el PDF");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const canConfirm = quote.estado === "COTIZADO" || quote.estado === "SOLICITUD";
  // Revisable mientras no se haya cobrado/facturado (ajustes de última hora);
  // cotizar una RESERVA la convierte en COTIZADO. Además, solo dentro de la
  // ventana de edición: vuelo del mes corriente o anterior (hora Cancún) —
  // más atrás pertenece a cierres pasados.
  const enVentana = cotizacionEditablePorFecha(quote.fecha_vuelo);
  const canRevise =
    quote.estado !== "CANCELADO" &&
    !quote.cobrado &&
    !quote.facturado &&
    enVentana;
  const bloqueadaPorMes =
    quote.estado !== "CANCELADO" &&
    !quote.cobrado &&
    !quote.facturado &&
    !enVentana;
  // Cobrado (sin factura): la revisión cambiaría un total YA cobrado. En vez
  // de esconder el botón, se explica el porqué y se lleva al cobro para
  // eliminarlo (la card de cobros vive abajo en esta misma página).
  const bloqueadaPorCobro =
    quote.estado !== "CANCELADO" && quote.cobrado && !quote.facturado;
  const canCancel =
    quote.estado !== "CANCELADO" && quote.estado !== "COMPLETADO";

  const handleConfirm = () => {
    startConfirm(async () => {
      const res = await confirmQuoteAction(quote.id);
      if (res.ok) {
        toast.success(`Cotización #${quote.folio} confirmada`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al confirmar");
      }
    });
  };

  const handleCancel = () => {
    startCancel(async () => {
      const res = await cancelQuoteAction(quote.id, motivoCancel.trim() || undefined);
      if (res.ok) {
        toast.success(`Cotización #${quote.folio} cancelada`);
        setOpenCancel(false);
        setMotivoCancel("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al cancelar");
      }
    });
  };

  // La cotización y el vuelo son la MISMA entidad (mismo folio): el detalle
  // operativo (tramos, tacómetros, cobros, gastos) vive en /admin/flights.
  // En SOLICITUD/COTIZADO aún no es un vuelo operativo (esa página rebota de
  // regreso a Cotizaciones), así que el acceso directo no se muestra.
  const canVerVuelo =
    quote.estado !== "SOLICITUD" && quote.estado !== "COTIZADO";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canVerVuelo && (
        <Link
          href={`/admin/flights/${quote.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          Ver vuelo
        </Link>
      )}
      <Button variant="outline" onClick={handlePdf} disabled={pdfLoading} className="gap-2">
        <ArrowDownTrayIcon className="h-4 w-4" />
        {pdfLoading ? "Generando…" : "PDF"}
      </Button>
      {canRevise && (
        <Link
          href={`/admin/quotes/${quote.id}/revise`}
          className={buttonVariants({ variant: "outline" })}
        >
          <PencilSquareIcon className="h-4 w-4" />
          Revisar
        </Link>
      )}
      {bloqueadaPorMes && (
        <Button
          variant="outline"
          disabled
          className="gap-2"
          title="El vuelo es de un mes ya cerrado (anterior al mes pasado): la cotización ya no puede ajustarse."
        >
          <PencilSquareIcon className="h-4 w-4" />
          Revisar · mes cerrado
        </Button>
      )}
      {bloqueadaPorCobro && (
        <Button
          variant="outline"
          onClick={() => setOpenCobradoInfo(true)}
          className="gap-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
          title="El vuelo ya tiene cobros registrados: la cotización no puede revisarse."
        >
          <PencilSquareIcon className="h-4 w-4" />
          Revisar · vuelo cobrado
        </Button>
      )}
      {canConfirm && (
        <Button
          onClick={handleConfirm}
          disabled={confirming}
          className="gap-2 bg-brand-600 hover:bg-brand-600/90"
        >
          <CheckCircleIcon className="h-4 w-4" />
          {confirming ? "Confirmando…" : "Confirmar"}
        </Button>
      )}
      {canCancel && (
        <Button
          variant="outline"
          onClick={() => setOpenCancel(true)}
          disabled={cancelling}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <XCircleIcon className="h-4 w-4" />
          Cancelar
        </Button>
      )}

      <AlertDialog open={openCancel} onOpenChange={setOpenCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Cancelar cotización #{quote.folio}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El vuelo pasa a estado CANCELADO. La acción no puede deshacerse desde la UI;
              tendrás que crear una nueva cotización si el cliente cambia de opinión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Motivo (opcional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Cliente canceló",
                "Clima",
                "Cambio de aeronave",
                "Sin confirmación del cliente",
              ].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivoCancel(m)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    motivoCancel === m
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <Textarea
              rows={3}
              placeholder="Ej. Cliente reagendó para próxima temporada"
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {cancelling ? "Cancelando…" : "Cancelar cotización"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openCobradoInfo} onOpenChange={setOpenCobradoInfo}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              El vuelo ya tiene cobros registrados
            </AlertDialogTitle>
            <AlertDialogDescription>
              Revisar la cotización cambiaría un total que el cliente YA pagó,
              y los números dejarían de cuadrar. Para poder ajustarla: elimina
              primero el cobro registrado (abajo en esta página, sección
              &ldquo;Cobros registrados en el vuelo&rdquo;), revisa la
              cotización y vuelve a registrar el cobro con el monto correcto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Entendido</AlertDialogCancel>
            <a
              href="#cobros-vuelo"
              onClick={() => setOpenCobradoInfo(false)}
              className={buttonVariants({})}
            >
              Ir a los cobros
            </a>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
