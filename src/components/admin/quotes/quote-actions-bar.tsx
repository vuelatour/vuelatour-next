"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
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
import type { PersistedQuote } from "@/types/quotes-persisted";

export function QuoteActionsBar({ quote }: { quote: PersistedQuote }) {
  const router = useRouter();
  const [confirming, startConfirm] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [openCancel, setOpenCancel] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

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
  // Revisable: estados tempranos (cotizar una RESERVA la convierte en COTIZADO)
  // o cotización ABIERTA aún sin cobrar/facturar (cierre con tramos reales).
  const canRevise =
    quote.estado === "RESERVA" ||
    quote.estado === "COTIZADO" ||
    quote.estado === "SOLICITUD" ||
    (quote.cotizacion_abierta === true &&
      quote.estado !== "CANCELADO" &&
      !quote.cobrado &&
      !quote.facturado);
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

  return (
    <div className="flex items-center gap-2 flex-wrap">
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
    </div>
  );
}
