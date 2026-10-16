"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { debeRenovarUrl, esPathFirmable, type BucketFirmable } from "@/lib/admin/foto-firmada";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import { pedirUrlFirmada } from "@/lib/storage/url-firmada";
import { cn } from "@/lib/utils";

/**
 * VISOR INCRUSTADO de un PDF de bucket privado (16-oct-2026). Pedido del
 * cliente: las «Hojas del comprobante» y las facturas del gasto salían como
 * un chip «PDF» que abría otra pestaña; la oficina quiere verlas AHÍ.
 *
 * La URL firmada VENCE (sección «Fotos de bucket privado» del AGENTS.md):
 * al montar, si la que trae la página ya es vieja (o no hay), se pide otra
 * ANTES de pintar el `<iframe>` — un iframe con una firma vencida enseña el
 * JSON `InvalidJWT` de Supabase y no hay `onError` que lo detecte. «Volver a
 * cargar» siempre pide firma nueva. «Abrir en pestaña nueva» la pide en el
 * mismo clic si hace falta (`BotonAbrirFirmado`).
 */
export function VisorPdf({
  bucket,
  path,
  url,
  titulo,
  onCerrar,
  className,
}: {
  bucket: BucketFirmable;
  path: string;
  /** URL que ya firmó la página (opcional): se usa si sigue fresca. */
  url?: string | null;
  titulo: string;
  onCerrar?: () => void;
  className?: string;
}) {
  const [estado, setEstado] = useState<{ src: string | null; fase: "firmando" | "listo" | "error"; n: number }>(
    () => {
      const fresca = url && !debeRenovarUrl({ url, nacioEn: Date.now(), ahora: Date.now() }) ? url : null;
      return { src: fresca, fase: fresca ? "listo" : "firmando", n: 0 };
    },
  );
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (estado.fase !== "firmando") return;
    let cancel = false;
    const firmar = esPathFirmable(path) ? pedirUrlFirmada(bucket, path) : Promise.resolve(null);
    void firmar.then((nueva) => {
      if (cancel) return;
      setEstado((prev) =>
        nueva ? { src: nueva, fase: "listo", n: prev.n + 1 } : { src: null, fase: "error", n: prev.n },
      );
    });
    return () => {
      cancel = true;
    };
    // `pedido` fuerza otra firma con «Volver a cargar».
  }, [bucket, path, estado.fase, pedido]);

  const recargar = () => {
    setEstado((prev) => ({ ...prev, fase: "firmando" }));
    setPedido((p) => p + 1);
  };

  return (
    <div className={cn("space-y-1.5 rounded-lg border border-border bg-background p-2", className)} data-visor-pdf>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <p className="min-w-0 flex-1 truncate font-medium" title={titulo}>
          {titulo}
        </p>
        <BotonAbrirFirmado
          bucket={bucket}
          path={path}
          url={estado.src}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-600 hover:bg-muted dark:text-brand-400"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Abrir en pestaña nueva
        </BotonAbrirFirmado>
        <button
          type="button"
          onClick={recargar}
          disabled={estado.fase === "firmando"}
          title="Volver a cargar el archivo (pide un enlace nuevo)"
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Volver a cargar
        </button>
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el visor"
            title="Cerrar el visor"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {estado.fase === "listo" && estado.src ? (
        <iframe
          key={`${estado.n}`}
          src={estado.src}
          title={titulo}
          className="h-[60vh] min-h-72 w-full rounded border border-border bg-white"
        />
      ) : estado.fase === "firmando" ? (
        <p className="flex h-40 items-center justify-center text-xs text-muted-foreground">Cargando el archivo…</p>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <p>No se pudo cargar el archivo.</p>
          <button
            type="button"
            onClick={recargar}
            className="cursor-pointer rounded-md px-2 py-1 font-medium text-brand-600 underline underline-offset-2 dark:text-brand-400"
          >
            Reintentar
          </button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        ¿No se ve bien (por ejemplo, en el celular)? Usa «Abrir en pestaña nueva».
      </p>
    </div>
  );
}

/**
 * Botón que abre un archivo de bucket privado en otra pestaña. Con una URL
 * fresca la abre tal cual; sin URL (la firma de la página faltó) o con una
 * vieja, la pide en el MISMO clic (`abrirArchivoFirmado`: abre la pestaña y
 * luego le pone la URL, para que Safari no la bloquee). Nunca texto sin enlace.
 */
export function BotonAbrirFirmado({
  bucket,
  path,
  url,
  className,
  title,
  children,
}: {
  bucket: BucketFirmable;
  path: string;
  url?: string | null;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = () => {
    if (url && (!esPathFirmable(path) || !debeRenovarUrl({ url, nacioEn: Date.now(), ahora: Date.now() }))) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!esPathFirmable(path)) {
      toast.error("No se pudo abrir el archivo: su ruta no es válida.");
      return;
    }
    setAbriendo(true);
    void abrirArchivoFirmado(async () => {
      const nueva = await pedirUrlFirmada(bucket, path);
      return nueva
        ? { ok: true, data: nueva }
        : { ok: false, error: "No se pudo abrir el archivo. Recarga la página e inténtalo de nuevo." };
    })
      .then((r) => {
        if (!r.ok) toast.error(r.error);
        else if (!r.abierta) {
          toast.info("El archivo está listo", {
            action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
          });
        }
      })
      .finally(() => setAbriendo(false));
  };
  return (
    <button
      type="button"
      onClick={abrir}
      disabled={abriendo}
      title={title}
      className={cn("disabled:cursor-default disabled:opacity-60", className)}
    >
      {children}
    </button>
  );
}

/** ¿El path es un PDF (se puede ver en el visor incrustado)? */
export function esPdfPath(path: string | null | undefined): boolean {
  return (path ?? "").toLowerCase().endsWith(".pdf");
}
