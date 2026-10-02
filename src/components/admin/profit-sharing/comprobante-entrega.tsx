"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentTextIcon, PaperClipIcon } from "@heroicons/react/24/outline";
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
import {
  ComprobantePreview,
  EnlaceArchivoFirmado,
} from "@/components/admin/comprobante-preview";
import { adjuntarComprobantePagoSocio } from "@/lib/api/reparto-pagos-browser";
import { motivoComprobanteInvalido, tipoComprobante } from "@/lib/admin/facturas-emitidas";
import {
  CONFIRMAR_REEMPLAZO_COMPROBANTE,
  errorPideRefrescar,
  etiquetaComprobantePago,
} from "@/lib/admin/reparto-pagos";
import type { PagoSocio } from "@/types/reparto-pagos";

export const BUCKET_COMPROBANTES_SOCIOS = "reparto-comprobantes" as const;

/**
 * Comprobante de UNA entrega: miniatura (imagen) / «PDF» / «HEIC» con URL
 * firmada que se renueva sola; oficina adjunta o reemplaza (confirma; el
 * anterior se conserva en el bucket). La subida va del navegador DIRECTO al
 * API (tope de 4.5 MB de Vercel).
 */
export function ComprobanteEntrega({
  pago,
  puedeAdjuntar,
}: {
  pago: PagoSocio;
  puedeAdjuntar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const path = pago.comprobante_path;
  const url = pago.comprobante_url;

  const subir = async (file: File) => {
    const motivo = motivoComprobanteInvalido(file);
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSubiendo(true);
    const res = await adjuntarComprobantePagoSocio(pago.id, file);
    setSubiendo(false);
    if (!res.ok) {
      toast.error(res.error);
      if (errorPideRefrescar(res.code)) router.refresh();
      return;
    }
    toast.success("Comprobante adjuntado");
    router.refresh();
  };

  const vista = (() => {
    if (!path) return null;
    if (!url) {
      return (
        <span
          className="inline-flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted-foreground"
          title="No se pudo preparar el enlace del comprobante; recarga la página."
        >
          <DocumentTextIcon className="h-3.5 w-3.5" aria-hidden />
          Con comprobante
        </span>
      );
    }
    if (tipoComprobante(path) === "heic") {
      return (
        <EnlaceArchivoFirmado
          bucket={BUCKET_COMPROBANTES_SOCIOS}
          path={path}
          url={url}
          title="Comprobante de la entrega (HEIC: se abre en otra pestaña o se descarga)"
          etiqueta="HEIC"
        />
      );
    }
    return (
      <ComprobantePreview
        bucket={BUCKET_COMPROBANTES_SOCIOS}
        path={path}
        url={url}
        alt="Comprobante de la entrega al socio"
        thumbClassName="h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
      />
    );
  })();

  return (
    <>
      {vista}
      {puedeAdjuntar && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground"
            disabled={subiendo}
            data-accion="comprobante-entrega-socio"
            aria-label={etiquetaComprobantePago(pago)}
            title={
              path
                ? "Cambiar el comprobante por otro (el anterior se guarda por seguridad)"
                : "Adjunta la foto o el PDF de la transferencia, el cheque o el recibo firmado"
            }
            onClick={() => (path ? setConfirmarReemplazo(true) : inputRef.current?.click())}
          >
            <PaperClipIcon className="h-3.5 w-3.5" aria-hidden />
            {subiendo ? "Subiendo…" : path ? "Reemplazar" : "Adjuntar comprobante"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf,.heic,.heif"
            className="hidden"
            aria-label="Elegir el comprobante de la entrega"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subir(f);
            }}
          />
          <AlertDialog
            open={confirmarReemplazo}
            onOpenChange={(o) => !o && setConfirmarReemplazo(false)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRMAR_REEMPLAZO_COMPROBANTE.titulo}</AlertDialogTitle>
                <AlertDialogDescription>
                  {CONFIRMAR_REEMPLAZO_COMPROBANTE.descripcion}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="cursor-pointer"
                  onClick={() => {
                    setConfirmarReemplazo(false);
                    // En el MISMO gesto del clic: el navegador deja abrir el
                    // selector de archivos.
                    inputRef.current?.click();
                  }}
                >
                  {CONFIRMAR_REEMPLAZO_COMPROBANTE.boton}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
