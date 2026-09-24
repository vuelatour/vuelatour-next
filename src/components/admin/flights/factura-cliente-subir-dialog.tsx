"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUpTrayIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/form-field";
import {
  LIMITE_FOLIO_FACTURA,
  MAX_BYTES_FACTURA,
  datosDeCfdi,
  folioAEnviar,
  megasDe,
  motivoArchivoInvalido,
  textoDeXmlBytes,
} from "@/lib/admin/factura-cliente";
import { leerBytes, subirFacturaClienteDirecto } from "@/lib/api/factura-cliente-browser";
import type { FacturaClienteBloque } from "@/types/flights";

/**
 * Diálogo «Subir factura» del vuelo (24-sep-2026): el archivo (PDF o XML,
 * ≤ 10 MB) + el FOLIO opcional que imprime la columna «FACTURA VUELATOUR» del
 * Excel. Si el archivo es el XML del CFDI, el folio se PRELLENA con
 * `SERIE-FOLIO` (misma regla que el API) y se puede corregir.
 *
 * La subida va del navegador DIRECTO al API (`subirFacturaClienteDirecto`,
 * ver por qué ahí) y el diálogo solo se cierra con «Factura guardada» cuando
 * el API respondió 200 con el archivo. Si falla, el diálogo se queda abierto
 * con el motivo en rojo («… La factura NO se guardó.») — nunca en silencio.
 */
export function SubirFacturaDialog({
  flightId,
  open,
  onOpenChange,
  reemplaza,
  conFolio,
  folioActual,
  onGuardada,
}: {
  flightId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ya hay archivo: el nuevo lo REEMPLAZA. */
  reemplaza: boolean;
  /** El API sabe de folios (`soportaFolio`); si no, no se ofrece ni se manda. */
  conFolio: boolean;
  folioActual: string | null;
  onGuardada: (bloque: FacturaClienteBloque, avisoFolio?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [folio, setFolio] = useState(folioActual ?? "");
  const [folioTocado, setFolioTocado] = useState(false);
  const [extraido, setExtraido] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const motivo = archivo ? motivoArchivoInvalido(archivo) : null;

  const elegir = async (f: File | null) => {
    setError(null);
    setArchivo(f);
    setExtraido(null);
    if (!f || !conFolio) return;
    if (!f.name.toLowerCase().endsWith(".xml") || motivoArchivoInvalido(f)) return;
    const bytes = await leerBytes(f);
    const datos = bytes ? datosDeCfdi(textoDeXmlBytes(bytes)) : null;
    if (datos?.folio) {
      setExtraido(datos.folio);
      if (!folioTocado) setFolio(datos.folio);
    }
  };

  const subir = async () => {
    if (!archivo || subiendo) return;
    if (motivo) {
      setError(motivo);
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      const res = await subirFacturaClienteDirecto(flightId, archivo, {
        folio: conFolio ? folioAEnviar({ tecleado: folio, extraidoDelXml: extraido }) : null,
      });
      if (res.ok) {
        onGuardada(res.bloque, res.avisoFolio);
        onOpenChange(false);
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      // `subirFacturaClienteDirecto` no lanza; esto es la red de seguridad
      // para que ningún fallo vuelva a quedar mudo.
      const msg = "No se pudo subir la factura. La factura NO se guardó. Vuelve a intentarlo.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubiendo(false);
    }
  };

  const maxMb = Math.round(MAX_BYTES_FACTURA / 1024 / 1024);

  return (
    <Dialog open={open} onOpenChange={(o) => (!subiendo ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reemplaza ? "Reemplazar la factura" : "Subir la factura del servicio"}</DialogTitle>
          <DialogDescription>
            El PDF o el XML que se le mandó al cliente (máximo {maxMb} MB).
            {reemplaza ? " El archivo anterior se sustituye por este." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xml,application/pdf,text/xml,application/xml"
              className="hidden"
              onChange={(e) => void elegir(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              title="Elige el PDF o el XML de la factura"
            >
              <DocumentTextIcon className="h-4 w-4" />
              <span className="truncate">
                {archivo ? archivo.name : "Elegir archivo (PDF o XML)…"}
              </span>
            </Button>
            {archivo && (
              <p className="text-[11px] text-muted-foreground">
                {megasDe(archivo.size)} MB
                {extraido ? ` · XML del CFDI: folio ${extraido}` : ""}
              </p>
            )}
          </div>

          {conFolio && (
            <Field
              label="Folio de la factura"
              hint={
                extraido
                  ? "Lo tomamos del XML (Serie-Folio). Puedes corregirlo."
                  : folioActual
                    ? "Si lo dejas vacío se conserva el folio que ya tenía."
                    : "Opcional. Es el que sale en el Excel. Si subes el XML del CFDI se toma solo."
              }
            >
              <Input
                value={folio}
                maxLength={LIMITE_FOLIO_FACTURA}
                placeholder="Ej. A-1234"
                onChange={(e) => {
                  setFolio(e.target.value);
                  setFolioTocado(true);
                }}
                disabled={subiendo}
              />
            </Field>
          )}

          {(error ?? motivo) && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error ?? motivo}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={subiendo}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            onClick={() => void subir()}
            disabled={!archivo || !!motivo || subiendo}
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {subiendo ? "Subiendo…" : reemplaza ? "Reemplazar factura" : "Subir factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
