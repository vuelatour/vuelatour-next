"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  BoltIcon,
  BookmarkSquareIcon,
  CheckCircleIcon,
  DocumentChartBarIcon,
  EyeIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { abrirPdfCotizacion } from "@/lib/api/quotes-browser";
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
import {
  candadoRevision,
  RAZON_REVISION,
  type CobrosInfoCandado,
} from "@/lib/admin/quote-revision";
import type { PersistedQuote } from "@/types/quotes-persisted";

/**
 * Roles que pueden generar el PDF INTERNO (espejo del `@Roles` de
 * `POST /v1/quotes/:id/pdf-interno` en el API: sin SOCIO, nunca
 * PILOTO/MECANICO/VISITANTE). El panel solo esconde el botón; el gate real
 * es el API (403 → toast).
 */
const ROLES_PDF_INTERNO: ReadonlySet<string> = new Set([
  "ADMIN",
  "COORDINADOR",
  "FACTURACION",
  "ANALISTA",
]);

const TITULO_PDF_INTERNO =
  "Versión interna: comisiones, horas, cobros. No se manda al cliente";

/** Estado de edición directa (F0) que la página pasa a la barra. */
export interface EdicionBarra {
  sucio: boolean;
  /** D5 (F2): solo cambió presentación del PDF → se guarda sin versión. */
  soloPresentacion?: boolean;
  canSave: boolean;
  saving: boolean;
  versionSiguiente: number;
  onGuardar: () => void;
  onDescartar: () => void;
}

export function QuoteActionsBar({
  quote,
  edicion,
  onAjusteRapido,
  onVistaPrevia,
  rol = null,
  cobrosInfo,
}: {
  quote: PersistedQuote;
  /**
   * Dinero cobrado del vuelo (neto y cobros MXN sin TC): espejo del candado
   * D3 del API para que «Bloqueada · vuelo cobrado» aparezca también con un
   * anticipo parcial, no solo con la bandera `cobrado`.
   */
  cobrosInfo?: CobrosInfoCandado;
  /**
   * EDICIÓN DIRECTA (F0, 8-sep-2026): ya no existe «Revisar». Con cambios
   * (`sucio`) la barra muestra «Descartar» y «Guardar → vN» (mismas acciones
   * que la barra del total). undefined = cotización bloqueada.
   */
  edicion?: EdicionBarra;
  /** «Ajuste rápido»: scroll+focus a pasajeros del documento (D2). */
  onAjusteRapido?: () => void;
  /**
   * «Vista previa hoja 1» (F1): abre la hoja real del PDF (diálogo grande;
   * en pantallas angostas cambia a la pestaña de vista previa). Se pinta
   * también con la cotización bloqueada (la hoja guardada se puede ver).
   */
  onVistaPrevia?: () => void;
  /**
   * Rol del usuario (de /v1/me). Decide si se pinta «PDF interno»
   * (8-sep-2026); sin rol el botón no aparece. El PDF de cliente no se gatea.
   */
  rol?: string | null;
}) {
  const router = useRouter();
  const [confirming, startConfirm] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [openCancel, setOpenCancel] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfInternoLoading, setPdfInternoLoading] = useState(false);
  const [openCobradoInfo, setOpenCobradoInfo] = useState(false);
  const puedePdfInterno = rol != null && ROLES_PDF_INTERNO.has(rol);

  // PDF del cliente: fuente única `abrirPdfCotizacion` (también la usa
  // «Ver PDF real» de la vista previa, F1).
  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      await abrirPdfCotizacion(quote.id);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  /**
   * PDF INTERNO (8-sep-2026): una hoja para la oficina con comisiones, horas
   * de taco, partición, cobros y gastos — NUNCA al cliente. Va por el proxy
   * `/api/quotes/:id/pdf-interno` (cookie de sesión, sin token en el
   * cliente; el proxy traduce 401/403/502 a `{ message }` para el toast).
   */
  const handlePdfInterno = async () => {
    setPdfInternoLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/pdf-interno`, { method: "POST" });
      if (!res.ok) {
        let msg = "No se pudo generar el PDF interno";
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) msg = body.message;
        } catch {
          // sin JSON: mensaje genérico
        }
        toast.error(msg);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar el PDF interno");
    } finally {
      setPdfInternoLoading(false);
    }
  };

  const canConfirm = quote.estado === "COTIZADO" || quote.estado === "SOLICITUD";
  // Candado por COBRO (fuente única `candadoRevision`): en vez de esconderlo,
  // se explica el porqué y se lleva al cobro para eliminarlo (la card de
  // cobros vive en esta misma página). El resto de razones (facturada, mes
  // cerrado, servicio) se leen en la barra del total del documento.
  const { bloqueadaPorCobro } = candadoRevision(quote, cobrosInfo);
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
      {/* «Vista previa hoja 1» (F1): la hoja REAL del PDF, en vivo. */}
      {onVistaPrevia && (
        <Button
          variant="outline"
          onClick={onVistaPrevia}
          className="gap-2"
          title="Ver la hoja 1 del PDF tal como la verá el cliente (se actualiza al editar)."
        >
          <EyeIcon className="h-4 w-4" />
          Vista previa hoja 1
        </Button>
      )}
      <Button
        variant="outline"
        onClick={handlePdf}
        disabled={pdfLoading}
        className="gap-2"
        title="PDF para el cliente (con fichas de aeronave)."
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        {pdfLoading ? "Generando…" : "PDF"}
      </Button>
      {/* «PDF interno»: solo roles de oficina (ROLES_PDF_INTERNO); icono
          distinto para que no se confunda con el PDF que se manda al cliente. */}
      {puedePdfInterno && (
        <Button
          variant="outline"
          onClick={handlePdfInterno}
          disabled={pdfInternoLoading}
          className="gap-2"
          title={TITULO_PDF_INTERNO}
          aria-label={`PDF interno. ${TITULO_PDF_INTERNO}`}
        >
          <DocumentChartBarIcon className="h-4 w-4" />
          {pdfInternoLoading ? "Generando…" : "PDF interno"}
        </Button>
      )}
      {/* «Ajuste rápido» (D2): lleva a los pasajeros del documento — la
          cotización ya se edita directo. */}
      {onAjusteRapido && !edicion?.sucio && (
        <Button
          variant="outline"
          onClick={onAjusteRapido}
          className="gap-2"
          title="Ir a pasajeros y extras del documento: se editan directo y se guardan como versión nueva."
        >
          <BoltIcon className="h-4 w-4" />
          Ajuste rápido
        </Button>
      )}
      {/* Edición directa con cambios: Descartar / Guardar → vN (espejo de la
          barra del total). */}
      {edicion?.sucio && (
        <>
          <Button
            variant="outline"
            onClick={edicion.onDescartar}
            disabled={edicion.saving}
            className="gap-2"
            title="Descarta los cambios (se confirma)."
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            Descartar
          </Button>
          <Button
            onClick={edicion.onGuardar}
            disabled={edicion.saving}
            className="gap-2 bg-brand-600 hover:bg-brand-600/90"
            title={
              edicion.soloPresentacion
                ? "Solo cambió cómo se ve el PDF (notas/toggles): se guarda sin versión nueva. Ctrl/⌘+S"
                : "Guarda una versión nueva (pide el motivo). Ctrl/⌘+S"
            }
          >
            <BookmarkSquareIcon className="h-4 w-4" />
            {edicion.saving
              ? "Guardando…"
              : edicion.soloPresentacion
                ? "Guardar PDF (sin versión)"
                : `Guardar → v${edicion.versionSiguiente}`}
          </Button>
        </>
      )}
      {bloqueadaPorCobro && (
        <Button
          variant="outline"
          onClick={() => setOpenCobradoInfo(true)}
          className="gap-2 border-amber-500/40 text-amber-700 dark:text-amber-400"
          title={RAZON_REVISION.cobrado}
        >
          <LockClosedIcon className="h-4 w-4" />
          Bloqueada · vuelo cobrado
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
                  aria-pressed={motivoCancel === m}
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
              Cambiar la cotización movería un total que el cliente YA pagó,
              y los números dejarían de cuadrar. Para poder ajustarla: elimina
              primero el cobro registrado (abajo en esta página, sección
              &ldquo;Cobros registrados en el vuelo&rdquo;), edita el
              documento, guarda la versión y vuelve a registrar el cobro con el
              monto correcto.
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
