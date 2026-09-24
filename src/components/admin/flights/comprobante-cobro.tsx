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
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { esParteDeSobre } from "@/components/admin/flights/cobro-sobre-nota";
import {
  refrescarComprobanteCobroAction,
  urlComprobanteCobroAction,
} from "@/app/admin/flights/actions";
import { adjuntarComprobanteCobro } from "@/lib/api/facturas-emitidas-browser";
import {
  abrirArchivoFirmado,
  motivoComprobanteInvalido,
  tipoComprobante,
} from "@/lib/admin/facturas-emitidas";
import type { FlightCobro } from "@/types/flights";

/**
 * COMPROBANTE de un cobro (24-sep-2026, pedido de Itzi: «si el cliente me
 * manda su comprobante que se pueda adjuntar y que esté ahí mismo en ese
 * apartado de cobros»). Se adjunta DESPUÉS de registrar el cobro.
 *
 *  - Con comprobante: miniatura con zoom (imagen) o botón «PDF»; un HEIC va
 *    como enlace (Chrome no lo pinta: nunca un `<img>` roto); sin URL
 *    firmada, botón «Comprobante» que la pide al momento.
 *  - Oficina (ADMIN/COORDINADOR/FACTURACION): «Adjuntar comprobante» o
 *    «Reemplazar» (confirma; el selector de archivo se abre en el MISMO clic
 *    de confirmar). El anterior se conserva en el bucket (lo decide el API).
 *  - Parte de un sobre de grupo: por ahora no se adjunta por vuelo (el API
 *    responde 409 COBRO_DE_GRUPO) y se dice.
 *
 * NO toca dinero ni lo bloquea el candado de «cotización con cobros». La
 * subida va del navegador DIRECTO al API (tope de 4.5 MB de Vercel).
 */
export function ComprobanteCobro({
  cobro,
  url,
  flightId,
  puedeAdjuntar,
}: {
  cobro: FlightCobro;
  /** URL firmada del voucher (si la página la pudo firmar). */
  url?: string | null;
  flightId: string;
  /**
   * Oficina (ADMIN/COORDINADOR/FACTURACION): adjunta/reemplaza Y puede pedir
   * la URL firmada al momento (mismos roles que `cobro-voucher-urls`).
   */
  puedeAdjuntar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);

  const path = cobro.foto_voucher_url;
  const sobre = esParteDeSobre(cobro);
  const adjuntable = puedeAdjuntar && !sobre;

  const abrirSinUrl = () => {
    if (!path) return;
    void abrirArchivoFirmado(() => urlComprobanteCobroAction(path)).then((r) => {
      if (!r.ok) toast.error(r.error);
      else if (!r.abierta) {
        toast.info("El comprobante está listo", {
          action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
        });
      }
    });
  };

  const subir = async (file: File) => {
    const motivo = motivoComprobanteInvalido(file);
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSubiendo(true);
    const res = await adjuntarComprobanteCobro(cobro.id, file);
    setSubiendo(false);
    if (res.ok) {
      toast.success("Comprobante adjuntado");
      await refrescarComprobanteCobroAction(flightId);
      router.refresh();
      return;
    }
    toast.error(res.error);
    if (res.code === "COMPROBANTE_CAMBIO") router.refresh();
  };

  const vista = (() => {
    if (!path) return null;
    if (!url && !puedeAdjuntar) {
      // Sin URL firmada Y sin permiso de pedirla: `cobro-voucher-urls` es
      // de oficina (ADMIN/COORDINADOR/FACTURACION, los MISMOS roles que
      // adjuntan) y a SOCIO le responde 403 — un botón «Comprobante» fallaría
      // SIEMPRE. Se dice que existe, sin prometer abrirlo.
      return (
        <span
          className="inline-flex h-7 items-center gap-1 px-2 text-[11px] text-muted-foreground"
          title="Solo oficina abre el comprobante"
        >
          <DocumentTextIcon className="h-3.5 w-3.5" />
          Con comprobante
        </span>
      );
    }
    if (!url) {
      return (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={abrirSinUrl}
          title="Abrir el comprobante del cobro (enlace firmado)"
        >
          <DocumentTextIcon className="h-3.5 w-3.5" />
          Comprobante
        </Button>
      );
    }
    if (tipoComprobante(path) === "heic") {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Comprobante del cobro (HEIC: se abre en otra pestaña o se descarga)"
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-brand-500"
        >
          <DocumentTextIcon className="h-4 w-4" />
          HEIC
        </a>
      );
    }
    return (
      <ComprobantePreview
        path={path}
        url={url}
        alt="Comprobante del cobro"
        thumbClassName="h-8 w-8 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
      />
    );
  })();

  if (!vista && !adjuntable && !(sobre && puedeAdjuntar)) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {vista}
      {adjuntable && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            disabled={subiendo}
            onClick={() => (path ? setConfirmarReemplazo(true) : inputRef.current?.click())}
            title={
              path
                ? "Cambiar el comprobante por otro (el anterior se guarda por seguridad)"
                : "Adjunta la foto o el PDF del comprobante que mandó el cliente"
            }
          >
            <PaperClipIcon className="h-3.5 w-3.5" />
            {subiendo ? "Subiendo…" : path ? "Reemplazar" : "Adjuntar comprobante"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf,.heic,.heif"
            className="hidden"
            aria-label="Elegir el comprobante del cobro"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subir(f);
            }}
          />
        </>
      )}
      {!path && sobre && puedeAdjuntar && (
        <span className="text-[11px] text-muted-foreground">
          Comprobante del grupo: por ahora no se adjunta por vuelo
        </span>
      )}

      <AlertDialog
        open={confirmarReemplazo}
        onOpenChange={(o) => !o && setConfirmarReemplazo(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar el comprobante?</AlertDialogTitle>
            <AlertDialogDescription>
              El nuevo es el que se verá; el anterior se guarda por seguridad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmarReemplazo(false);
                // En el MISMO gesto del clic: el navegador deja abrir el
                // selector de archivos.
                inputRef.current?.click();
              }}
            >
              Elegir el nuevo comprobante
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
