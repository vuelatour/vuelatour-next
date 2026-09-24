"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelarFacturaAction,
  eliminarFacturaAction,
  quitarArchivoFacturaAction,
  reactivarFacturaAction,
  refrescarFacturasEmitidasAction,
  urlArchivoFacturaAction,
} from "@/app/admin/facturas-emitidas/actions";
import {
  leerArchivoFactura,
  reemplazarArchivoFactura,
} from "@/lib/api/facturas-emitidas-browser";
import {
  abrirArchivoFirmado,
  avisarCambioPorFacturar,
  clasificarArchivosFactura,
  diferenciasLecturaVsFactura,
  motivoValido,
  textoPdfDeOtraFactura,
} from "@/lib/admin/facturas-emitidas";
import {
  RegistrarFacturaDialog,
  type ClienteOpcion,
  type EmisoraOpcion,
} from "./registrar-factura-dialog";
import type { AvisoFactura, FacturaEmitida } from "@/types/facturas-emitidas";

type Confirmacion =
  | { tipo: "cancelar" }
  | { tipo: "reactivar" }
  | { tipo: "quitar-pdf" }
  | { tipo: "eliminar" }
  | { tipo: "reemplazo-dudoso"; archivo: File; texto: string; diferencias: string[] };

/** Abre el PDF/XML con URL firmada (ventana abierta en el mismo clic). */
export function verArchivoFactura(f: Pick<FacturaEmitida, "id" | "etiqueta">, tipo: "pdf" | "xml") {
  void abrirArchivoFirmado(() => urlArchivoFacturaAction(f.id, tipo)).then((r) => {
    if (!r.ok) toast.error(r.error);
    else if (!r.abierta) {
      toast.info(`La factura ${f.etiqueta} está lista`, {
        action: {
          label: tipo === "pdf" ? "Abrir PDF" : "Abrir XML",
          onClick: () => window.open(r.url, "_blank"),
        },
      });
    }
  });
}

function avisarSigueFacturado(avisos: AvisoFactura[] | undefined) {
  for (const a of avisos ?? []) toast.warning(a.mensaje, { duration: 12_000 });
}

/**
 * Menú ⋯ de una factura del registro (24-sep-2026). Todo lo destructivo
 * CONFIRMA (regla permanente del cliente): cancelar y eliminar piden motivo;
 * quitar el PDF avisa que se guarda una copia. «Reemplazar PDF» lee el
 * archivo nuevo y, si parece de OTRA factura, pregunta antes de subirlo.
 *
 * `DropdownMenuItem` es Base UI: la acción va en `onClick` (con `onSelect`
 * de Radix no dispara).
 */
export function FacturaAccionesMenu({
  factura,
  clientes,
  emisoras,
}: {
  factura: FacturaEmitida;
  clientes?: ClienteOpcion[];
  emisoras?: EmisoraOpcion[];
}) {
  const router = useRouter();
  const inputPdfRef = useRef<HTMLInputElement>(null);
  const idMotivo = useId();
  const [editar, setEditar] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const vigente = factura.estatus === "VIGENTE";
  const vueloIds = factura.vuelos.map((v) => v.id);

  const cerrar = () => {
    setConfirmacion(null);
    setMotivo("");
  };

  const tras = () => {
    avisarCambioPorFacturar();
    router.refresh();
  };

  const subirPdf = async (archivo: File) => {
    setOcupado(true);
    // El menú no tiene dónde pintar un «Subiendo…»: sin este aviso la subida
    // (hasta 150 s) pasaba sin ninguna señal en pantalla.
    const aviso = toast.loading(`Subiendo el PDF de ${factura.etiqueta}…`);
    const res = await reemplazarArchivoFactura(factura.id, { pdf: archivo });
    toast.dismiss(aviso);
    setOcupado(false);
    if (res.ok) {
      toast.success(factura.pdf ? `PDF de ${factura.etiqueta} reemplazado` : `PDF agregado a ${factura.etiqueta}`);
      void refrescarFacturasEmitidasAction(vueloIds);
      tras();
    } else {
      toast.error(res.error);
    }
  };

  const alElegirPdf = async (lista: FileList | null) => {
    const c = clasificarArchivosFactura(Array.from(lista ?? []));
    if (c.error || !c.pdf || c.xml) {
      toast.error(c.error ?? "Elige el PDF de la factura.");
      return;
    }
    const archivo = c.pdf;
    // ¿El PDF nuevo es de ESTA factura? Si se pudo leer y dice otra cosa,
    // se pregunta; si no se pudo leer, se sube (la lectura es una ayuda).
    setOcupado(true);
    const aviso = toast.loading("Revisando que el PDF sea de esta factura…");
    const lectura = await leerArchivoFactura({ pdf: archivo });
    toast.dismiss(aviso);
    setOcupado(false);
    const diferencias = lectura.ok
      ? diferenciasLecturaVsFactura(lectura.data.campos, factura)
      : [];
    if (lectura.ok && diferencias.length > 0) {
      setConfirmacion({
        tipo: "reemplazo-dudoso",
        archivo,
        texto: textoPdfDeOtraFactura(lectura.data.campos),
        diferencias,
      });
      return;
    }
    await subirPdf(archivo);
  };

  const ejecutar = async () => {
    if (!confirmacion) return;
    if (confirmacion.tipo === "reemplazo-dudoso") {
      const archivo = confirmacion.archivo;
      cerrar();
      await subirPdf(archivo);
      return;
    }
    setOcupado(true);
    try {
      if (confirmacion.tipo === "cancelar") {
        const res = await cancelarFacturaAction(factura.id, motivo);
        if (!res.ok) return void toast.error(res.error ?? "No se pudo cancelar.");
        toast.success(`Factura ${factura.etiqueta} cancelada. Cancélala también ante el SAT.`);
        avisarSigueFacturado(res.data?.avisos);
      } else if (confirmacion.tipo === "reactivar") {
        const res = await reactivarFacturaAction(factura.id);
        if (!res.ok) return void toast.error(res.error ?? "No se pudo reactivar.");
        toast.success(`Factura ${factura.etiqueta} vigente otra vez.`);
        avisarSigueFacturado(res.data?.avisos);
      } else if (confirmacion.tipo === "quitar-pdf") {
        const res = await quitarArchivoFacturaAction(factura.id, "pdf");
        if (!res.ok) return void toast.error(res.error ?? "No se pudo quitar el PDF.");
        toast.success("PDF quitado del registro.");
      } else if (confirmacion.tipo === "eliminar") {
        const res = await eliminarFacturaAction(factura.id, motivo, vueloIds);
        if (!res.ok) return void toast.error(res.error ?? "No se pudo eliminar el registro.");
        toast.success(`Registro de la factura ${factura.etiqueta} eliminado.`);
        avisarSigueFacturado(res.data?.avisos);
      }
      cerrar();
      tras();
    } finally {
      setOcupado(false);
    }
  };

  const pideMotivo = confirmacion?.tipo === "cancelar" || confirmacion?.tipo === "eliminar";
  const destructiva =
    confirmacion?.tipo === "cancelar" ||
    confirmacion?.tipo === "eliminar" ||
    confirmacion?.tipo === "quitar-pdf";

  const textos: Record<Confirmacion["tipo"], { titulo: string; cuerpo: string; boton: string }> = {
    cancelar: {
      titulo: `¿Cancelar la factura ${factura.etiqueta}?`,
      cuerpo:
        "Queda en el registro como CANCELADA con su número (no se puede volver a usar). Cancélala también ante el SAT.",
      boton: "Cancelar factura",
    },
    reactivar: {
      titulo: `¿Reactivar la factura ${factura.etiqueta}?`,
      cuerpo: "Vuelve a contar como vigente para sus vuelos. Úsalo solo si se canceló por error.",
      boton: "Reactivar",
    },
    "quitar-pdf": {
      titulo: `¿Quitar el PDF de ${factura.etiqueta}?`,
      cuerpo:
        "El PDF deja de verse en el registro. Por seguridad se guarda una copia que solo soporte puede recuperar.",
      boton: "Quitar PDF",
    },
    eliminar: {
      titulo: `¿Eliminar el registro de ${factura.etiqueta}?`,
      cuerpo:
        "Úsalo solo si se registró por error. La factura desaparece del registro y su número queda libre.",
      boton: "Eliminar registro",
    },
    "reemplazo-dudoso": {
      titulo: "¿Reemplazar el PDF?",
      cuerpo: confirmacion?.tipo === "reemplazo-dudoso" ? confirmacion.texto : "",
      boton: "Reemplazar de todos modos",
    },
  };
  const t = confirmacion ? textos[confirmacion.tipo] : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={ocupado}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Acciones de la factura ${factura.etiqueta}`}
          title="Más acciones"
        >
          <EllipsisHorizontalIcon className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setEditar(true)} className="cursor-pointer gap-2">
            <PencilSquareIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {factura.pdf && (
            <DropdownMenuItem onClick={() => verArchivoFactura(factura, "pdf")} className="cursor-pointer gap-2">
              <DocumentTextIcon className="h-4 w-4" />
              Ver PDF
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => inputPdfRef.current?.click()} className="cursor-pointer gap-2">
            <ArrowUpTrayIcon className="h-4 w-4" />
            {factura.pdf ? "Reemplazar PDF" : "Adjuntar PDF"}
          </DropdownMenuItem>
          {factura.xml && (
            <DropdownMenuItem onClick={() => verArchivoFactura(factura, "xml")} className="cursor-pointer gap-2">
              <CodeBracketIcon className="h-4 w-4" />
              Ver XML
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {vigente ? (
            <DropdownMenuItem
              onClick={() => setConfirmacion({ tipo: "cancelar" })}
              className="cursor-pointer gap-2 text-amber-700 focus:text-amber-700 dark:text-amber-300"
            >
              <NoSymbolIcon className="h-4 w-4" />
              Cancelar factura
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setConfirmacion({ tipo: "reactivar" })} className="cursor-pointer gap-2">
              <ArrowPathIcon className="h-4 w-4" />
              Reactivar
            </DropdownMenuItem>
          )}
          {factura.pdf && (
            <DropdownMenuItem onClick={() => setConfirmacion({ tipo: "quitar-pdf" })} className="cursor-pointer gap-2">
              <XMarkIcon className="h-4 w-4" />
              Quitar PDF
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setConfirmacion({ tipo: "eliminar" })}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar registro
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={inputPdfRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        aria-label={`Elegir el PDF de la factura ${factura.etiqueta}`}
        onChange={(e) => {
          const files = e.target.files;
          void alElegirPdf(files).finally(() => {
            e.target.value = "";
          });
        }}
      />

      {editar && (
        <RegistrarFacturaDialog
          open={editar}
          onOpenChange={setEditar}
          modo="editar"
          factura={factura}
          clientes={clientes}
          emisoras={emisoras}
        />
      )}

      <AlertDialog open={confirmacion !== null} onOpenChange={(o) => !o && !ocupado && cerrar()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{t?.cuerpo}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmacion?.tipo === "reemplazo-dudoso" && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-300">
              {confirmacion.diferencias.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {pideMotivo && (
            <div className="space-y-1.5">
              <Label htmlFor={idMotivo} className="text-sm">
                Motivo <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id={idMotivo}
                value={motivo}
                maxLength={500}
                rows={2}
                placeholder={
                  confirmacion?.tipo === "cancelar"
                    ? "Ej. Se re-emitió con el RFC correcto (A-130)."
                    : "Ej. Se capturó dos veces por error."
                }
                onChange={(e) => setMotivo(e.target.value)}
                disabled={ocupado}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className={destructiva ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={() => void ejecutar()}
              disabled={ocupado || (pideMotivo && !motivoValido(motivo))}
              title={pideMotivo && !motivoValido(motivo) ? "Escribe el motivo (mínimo 3 letras)." : undefined}
            >
              {ocupado ? "Un momento…" : t?.boton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
