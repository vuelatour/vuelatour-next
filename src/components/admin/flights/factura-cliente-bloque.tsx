"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fmtDate } from "@/lib/datetime";
import {
  FACTURA_CLIENTE_ESTADOS,
  RAZON_BLOQUEO_CFDI,
  estadoFacturaCliente,
  estatusFacturaCliente,
  motivoArchivoInvalido,
  textoArchivoFactura,
  type EstatusFacturaCliente,
} from "@/lib/admin/factura-cliente";
import {
  quitarFacturaClienteAction,
  setFacturaClienteEstatusAction,
  subirFacturaClienteAction,
  urlFacturaClienteAction,
} from "@/app/admin/flights/actions";
import type { FacturaClienteBloque as Bloque } from "@/types/flights";

/**
 * FACTURA DEL SERVICIO del vuelo, dentro de la card «Cobro» (22-sep-2026).
 *
 * Pedido del cliente: «agregar por cada vuelo las opciones para identificar
 * vuelos facturado, sin factura, factura elaborada y enviada, y que pueda yo
 * también subir la factura del servicio a un lado».
 *
 * Reglas:
 *  - El estatus es de OFICINA y se cambia con un clic (reversible con el
 *    mismo control, como el semáforo de facturación de los gastos: sin
 *    confirmación).
 *  - Con CFDI timbrado (`facturado`) el selector va DESHABILITADO en
 *    «Facturado» y se explica por qué — el API responde 409 `VUELO_CON_CFDI`
 *    a cualquier intento de bajarlo, así que esconder el motivo sería dejar
 *    al operador peleándose con un error.
 *  - El archivo vive en un bucket PRIVADO: «Ver» pide una URL firmada al
 *    momento (10 min) y la abre en otra pestaña; nunca se guarda una URL
 *    pública en el HTML.
 *  - «Quitar» CONFIRMA (regla permanente del cliente).
 */
export function FacturaClienteBloque({
  flightId,
  facturaCliente,
  facturado,
  puedeEditar,
}: {
  flightId: string;
  /** Bloque del API; `undefined` = API sin desplegar (no se pinta nada). */
  facturaCliente?: Bloque | null;
  facturado: boolean;
  /** ADMIN / COORDINADOR / FACTURACION. Sin permiso: solo lectura. */
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendiente, startTransition] = useTransition();
  const [subiendo, setSubiendo] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const estatus = estatusFacturaCliente({ facturado, factura_cliente: facturaCliente });
  const info = estadoFacturaCliente(estatus);
  const archivo = facturaCliente?.archivo ?? null;
  const bloqueado = facturado;
  const ocupado = pendiente || subiendo;

  const cambiar = (v: EstatusFacturaCliente) => {
    if (v === estatus) return;
    startTransition(async () => {
      const res = await setFacturaClienteEstatusAction(flightId, v);
      if (res.ok) {
        toast.success(`Factura del servicio: ${estadoFacturaCliente(v).label}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cambiar el estatus de la factura");
      }
    });
  };

  const subir = async (file: File) => {
    const motivo = motivoArchivoInvalido(file);
    if (motivo) {
      toast.error(motivo);
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await subirFacturaClienteAction(flightId, fd);
      if (res.ok) {
        toast.success("Factura del servicio guardada.");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo subir la factura");
      }
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const ver = () => {
    startTransition(async () => {
      const res = await urlFacturaClienteAction(flightId);
      if (res.ok && res.data) window.open(res.data, "_blank", "noopener");
      else toast.error(res.error ?? "No se pudo abrir la factura");
    });
  };

  const quitar = () => {
    startTransition(async () => {
      const res = await quitarFacturaClienteAction(flightId);
      setConfirmarQuitar(false);
      if (res.ok) {
        toast.success("Archivo de la factura quitado.");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo quitar el archivo");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <DocumentTextIcon className="h-3.5 w-3.5" />
          Factura del servicio
        </span>
        {puedeEditar && !bloqueado ? (
          <div className="min-w-[230px]">
            <SearchableSelect
              options={FACTURA_CLIENTE_ESTADOS.map((e) => ({
                value: e.value,
                label: e.labelForm,
                description: e.ayuda,
              }))}
              value={estatus}
              onChange={(v) => cambiar(v as EstatusFacturaCliente)}
              placeholder="Estatus de la factura"
              disabled={ocupado}
            />
          </div>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${info.pill}`}
            title={bloqueado ? RAZON_BLOQUEO_CFDI : info.ayuda}
          >
            {info.label}
          </span>
        )}
        {bloqueado && (
          <span className="text-[11px] text-muted-foreground" title={RAZON_BLOQUEO_CFDI}>
            CFDI timbrado en el sistema: el estatus se queda en «Facturado».
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {archivo ? (
          <>
            <span
              className="min-w-0 max-w-[280px] truncate text-[11px] text-muted-foreground"
              title={textoArchivoFactura(archivo, fmtDate(archivo.subida_at)) ?? undefined}
            >
              {textoArchivoFactura(archivo, fmtDate(archivo.subida_at))}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={ver}
              disabled={ocupado}
              title="Abre la factura en otra pestaña (enlace firmado, 10 minutos)"
            >
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              Ver
            </Button>
            {puedeEditar && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmarQuitar(true)}
                disabled={ocupado}
                title="Quitar el archivo de la factura"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Quitar
              </Button>
            )}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Sin archivo de factura cargado.
          </span>
        )}
        {puedeEditar && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xml,application/pdf,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subir(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => inputRef.current?.click()}
              disabled={ocupado}
              title="Sube el PDF o el XML de la factura que se le mandó al cliente"
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              {subiendo ? "Subiendo…" : archivo ? "Reemplazar factura" : "Subir factura"}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmarQuitar} onOpenChange={(o) => !o && setConfirmarQuitar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el archivo de la factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el archivo que está guardado en el vuelo
              {archivo?.nombre ? ` (${archivo.nombre})` : ""}. El estatus de la factura no cambia:
              si además hay que corregirlo, cámbialo en el selector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={quitar}
              disabled={ocupado}
            >
              Quitar archivo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
