"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowUpTrayIcon,
  DocumentTextIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteDocumentoFlota,
  uploadDocumentoFlota,
} from "@/lib/storage/documentos-flota";
import { getExpirationArchivoAction } from "@/app/admin/expirations/actions";

/**
 * Campo para adjuntar la COPIA de un documento (permiso/licencia/seguro).
 * Subida directa al bucket privado; el valor es el PATH que se guarda en
 * `vencimiento.archivo_url`. Ver = URL firmada al momento (endpoint del API).
 *
 * - `value`: PATH actual (null = sin adjunto).
 * - `onChange`: recibe el PATH nuevo, o null al quitar.
 * - `expirationId`: si el vencimiento ya existe, "Ver" firma su archivo
 *   guardado; recién subido, "Ver" firma el path nuevo vía el mismo endpoint
 *   tras guardar (aquí solo abre el que ya está en el servidor).
 */
export function DocumentoField({
  value,
  onChange,
  expirationId,
  savedValue = null,
  firmar,
  onFile: notificarFile,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  expirationId?: string;
  /** PATH ya PERSISTIDO en el vencimiento (para saber si "Ver" puede firmar
   *  o hay que guardar primero). El del alta nueva es null. */
  savedValue?: string | null;
  /** Firma alternativa del documento GUARDADO (ej. pólizas de seguro). Si no
   *  se da, "Ver" usa el endpoint de vencimientos con `expirationId`. */
  firmar?: () => Promise<{ ok: boolean; data?: { url: string }; error?: string }>;
  /** Se llama con el File original tras subirlo (para lectura IA aguas arriba). */
  onFile?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [viendo, startVer] = useTransition();
  // Nombre legible: última parte del path, sin el prefijo timestamp-random.
  const nombre = value
    ? decodeURIComponent(value.split("/").pop() ?? "documento").replace(
        /^\d+-[a-z0-9]{6}-/,
        "",
      )
    : null;

  const elegir = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    setSubiendo(true);
    try {
      const path = await uploadDocumentoFlota(file);
      // Limpia el huérfano del reemplazo dentro del mismo diálogo (un path
      // subido esta sesión y aún no guardado). El guardado nunca se toca.
      if (value && value !== savedValue) void deleteDocumentoFlota(value);
      onChange(path);
      notificarFile?.(file);
      toast.success("Documento adjunto — guarda para conservarlo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
    }
  };

  const ver = () => {
    if (!expirationId && !firmar) {
      toast.info("Guarda el registro para poder ver el documento.");
      return;
    }
    if (value !== savedValue) {
      toast.info("Guarda los cambios para ver el documento nuevo.");
      return;
    }
    startVer(async () => {
      const res = firmar
        ? await firmar()
        : await getExpirationArchivoAction(expirationId!);
      if (res.ok && res.data?.url) {
        window.open(res.data.url, "_blank", "noopener");
      } else {
        toast.error(res.error ?? "No se pudo abrir el documento");
      }
    });
  };


  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={onFile}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <DocumentTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm truncate flex-1" title={nombre ?? ""}>
            {nombre}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={ver}
            disabled={viendo}
          >
            <EyeIcon className="h-4 w-4" />
            {viendo ? "Abriendo…" : "Ver"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={elegir}
            disabled={subiendo}
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Reemplazar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={() => {
              if (value && value !== savedValue) {
                void deleteDocumentoFlota(value);
              }
              onChange(null);
            }}
            aria-label="Quitar documento"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={elegir}
          disabled={subiendo}
          className="w-full rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground hover:bg-muted/40 hover:border-ring transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          {subiendo
            ? "Subiendo…"
            : "Adjuntar copia del documento (foto o PDF)"}
        </button>
      )}
    </div>
  );
}
