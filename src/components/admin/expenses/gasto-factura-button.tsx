"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowTopRightOnSquareIcon,
  DocumentArrowUpIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  subirFacturaGastoAction,
  verFacturaGastoAction,
} from "@/app/admin/expenses/actions";
import { fileToBase64 } from "@/lib/storage/documentos-flota";
import type { Gasto } from "@/types/expenses";

const MAX_BYTES = 8 * 1024 * 1024; // base64 (+33 %) contra el límite de 12 MB

/**
 * «Subir factura» de UN gasto, desde su propia fila (22-sep-2026).
 *
 * Pedido del cliente: «en los registros de gastos, además de la opción
 * facturada (a un lado), agregar la opción para subir la factura
 * correspondiente de dicho gasto». Hasta hoy la factura solo entraba por el
 * buzón (`/admin/facturas-recibidas`) y había que buscar el gasto ahí para
 * amarrarla: dos pantallas para lo que es un solo movimiento.
 *
 * **Basta CON UNO de los dos archivos**: el XML es el fiscal (de él salen el
 * UUID, el emisor y el total) pero hay proveedores que solo mandan el PDF, y
 * exigir el XML dejaría esas facturas fuera — que es justo lo que el cliente
 * pidió poder guardar. Con solo PDF la factura entra sin `uuid_fiscal` y
 * marca el gasto igual. Al amarrar, el trigger del API pone el gasto en
 * 🟢 FACTURADA: este diálogo NO toca el semáforo por su cuenta.
 */
export function GastoFacturaButton({ gasto }: { gasto: Gasto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [xml, setXml] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [, startTransition] = useTransition();
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const yaTiene = !!gasto.factura_recibida_id;

  const cerrar = () => {
    setOpen(false);
    setXml(null);
    setPdf(null);
  };

  const guardar = async () => {
    if (!xml && !pdf) {
      toast.error("Elige al menos un archivo: el XML del CFDI o el PDF de la factura.");
      return;
    }
    if ((xml && xml.size > MAX_BYTES) || (pdf && pdf.size > MAX_BYTES)) {
      toast.error("Cada archivo debe pesar menos de 8 MB.");
      return;
    }
    setGuardando(true);
    try {
      const xml_b64 = xml ? await fileToBase64(xml) : undefined;
      const pdf_b64 = pdf ? await fileToBase64(pdf) : undefined;
      const res = await subirFacturaGastoAction(gasto.id, {
        xml_b64,
        pdf_b64,
        pdf_nombre: pdf?.name,
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo subir la factura");
        return;
      }
      toast.success(
        res.data?.ya_existia
          ? "Esa factura ya estaba en el buzón: se le sumó este gasto."
          : "Factura amarrada a este gasto.",
      );
      cerrar();
      startTransition(() => router.refresh());
    } catch {
      toast.error("No se pudo leer el archivo. Vuelve a elegirlo.");
    } finally {
      setGuardando(false);
    }
  };

  /** Abre el archivo de la factura ya amarrada con una URL FIRMADA. */
  const verFactura = async () => {
    const id = gasto.factura_recibida_id;
    if (!id) return;
    setGuardando(true);
    try {
      const res = await verFacturaGastoAction(id);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "No se pudo abrir la factura" : res.error ?? "No se pudo abrir la factura");
        return;
      }
      window.open(res.data, "_blank", "noopener,noreferrer");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-muted-foreground hover:text-brand-600"
        onClick={() => setOpen(true)}
        title={
          yaTiene
            ? "Este gasto ya tiene factura amarrada (ver o reemplazar)"
            : "Subir la factura (XML del CFDI y/o el PDF) y amarrarla a este gasto"
        }
        aria-label={yaTiene ? "Ver la factura de este gasto" : "Subir la factura de este gasto"}
      >
        {yaTiene ? (
          <PaperClipIcon className="h-3.5 w-3.5" />
        ) : (
          <DocumentArrowUpIcon className="h-3.5 w-3.5" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : cerrar())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Factura de este gasto</DialogTitle>
            <DialogDescription>
              Sube el <strong>XML del CFDI</strong> del proveedor y/o su <strong>PDF</strong>: se
              registra en Facturas recibidas y queda amarrado a este gasto, que pasa a 🟢
              Facturada. Con el XML se guardan además el UUID fiscal, el emisor y el total.
            </DialogDescription>
          </DialogHeader>

          {yaTiene && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Este gasto ya tiene una factura amarrada. Si subes otra, será la que quede
              amarrada.{" "}
              <button
                type="button"
                onClick={verFactura}
                disabled={guardando}
                className="inline-flex cursor-pointer items-center gap-1 underline underline-offset-2"
              >
                Ver la factura
                <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </button>
            </p>
          )}

          <div className="space-y-3 text-sm">
            <ArchivoCampo
              etiqueta="XML del CFDI"
              accept=".xml,text/xml,application/xml"
              file={xml}
              inputRef={xmlRef}
              onFile={setXml}
              ayuda="El archivo fiscal: de aquí salen el UUID, el emisor y el total."
            />
            <ArchivoCampo
              etiqueta="PDF de la factura"
              accept=".pdf,application/pdf"
              file={pdf}
              inputRef={pdfRef}
              onFile={setPdf}
              ayuda="La versión impresa que manda el proveedor."
            />
            <p className="text-[11px] text-muted-foreground">
              Con uno de los dos basta. Si el proveedor solo mandó el PDF, la factura se guarda
              igual (sin UUID fiscal) y el gasto queda facturado.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || (!xml && !pdf)}>
              {guardando ? "Subiendo…" : "Subir y amarrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ArchivoCampo({
  etiqueta,
  ayuda,
  accept,
  file,
  onFile,
  inputRef,
  obligatorio = false,
}: {
  etiqueta: string;
  ayuda: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  obligatorio?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">
          {etiqueta}
          {obligatorio && <span className="ml-1 text-destructive">*</span>}
        </p>
        <div className="flex items-center gap-1">
          {file && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground"
              onClick={() => {
                onFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Quitar
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => inputRef.current?.click()}>
            {file ? "Cambiar" : "Elegir archivo"}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {file ? file.name : ayuda}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
