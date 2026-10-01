"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { ImagePreview } from "@/components/admin/image-preview";
import {
  debeRenovarUrl,
  esPathFirmable,
  type BucketFirmable,
} from "@/lib/admin/foto-firmada";
import { abrirArchivoFirmado } from "@/lib/admin/facturas-emitidas";
import { pedirUrlFirmada } from "@/lib/storage/url-firmada";

/**
 * Miniatura de comprobante (gasto, voucher de cobro): imagen con zoom o, si
 * el archivo es PDF/XLSX/CSV (facturas que sube la oficina), un enlace que lo
 * abre en otra pestaña. `path` es el path del bucket (decide el tipo y permite
 * pedir otra firma); `url` la URL firmada; `bucket` el bucket privado.
 *
 * Las URLs firmadas VENCEN (1-oct-2026): la imagen se renueva sola (ver
 * `ImagePreview`) y el enlace, si su URL ya es vieja, pide otra en el MISMO
 * clic (`abrirArchivoFirmado`: abre la pestaña y luego le pone la URL).
 */
export function ComprobantePreview({
  path,
  url,
  alt,
  thumbClassName,
  bucket,
}: {
  path: string;
  url: string;
  alt: string;
  thumbClassName?: string;
  bucket: BucketFirmable;
}) {
  const lower = path.toLowerCase();
  const etiqueta = lower.endsWith(".pdf")
    ? "PDF"
    : lower.endsWith(".xlsx")
      ? "XLSX"
      : lower.endsWith(".csv")
        ? "CSV"
        : null;
  if (etiqueta) {
    return (
      <EnlaceArchivoFirmado
        bucket={bucket}
        path={path}
        url={url}
        title={`${alt} (${etiqueta})`}
        etiqueta={etiqueta}
      />
    );
  }
  return (
    <ImagePreview
      src={url}
      alt={alt}
      thumbClassName={thumbClassName}
      bucket={bucket}
      path={path}
    />
  );
}

const CLASE_CHIP_ARCHIVO =
  "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-brand-500";

/**
 * Enlace a un archivo de bucket privado que se abre en otra pestaña (PDF,
 * XLSX, CSV, HEIC, plan de vuelo). Con URL fresca es un `<a target="_blank">`
 * normal; con una URL vieja pide otra firma en el MISMO clic. Sin `children`
 * se pinta el chip «📄 PDF» de los comprobantes.
 */
export function EnlaceArchivoFirmado({
  bucket,
  path,
  url,
  title,
  etiqueta,
  className = CLASE_CHIP_ARCHIVO,
  children,
}: {
  bucket: BucketFirmable;
  path: string;
  url: string;
  title?: string;
  etiqueta?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  // Sin la hora de firma en el token, la URL «nace» al montar.
  const [montadoEn] = useState(() => Date.now());
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={(e) => {
        // Sin path que el API acepte no hay a quién pedir otra firma: el
        // enlace se abre tal cual (comportamiento de siempre).
        if (!esPathFirmable(path)) return;
        if (!debeRenovarUrl({ url, nacioEn: montadoEn, ahora: Date.now() })) return;
        e.preventDefault();
        void abrirArchivoFirmado(async () => {
          const nueva = await pedirUrlFirmada(bucket, path);
          return nueva
            ? { ok: true, data: nueva }
            : { ok: false, error: "No se pudo abrir el archivo. Recarga la página e inténtalo de nuevo." };
        }).then((r) => {
          if (!r.ok) toast.error(r.error);
          else if (!r.abierta) {
            toast.info("El archivo está listo", {
              action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
            });
          }
        });
      }}
      className={className}
    >
      {children ?? (
        <>
          <DocumentTextIcon className="h-4 w-4" />
          {etiqueta}
        </>
      )}
    </a>
  );
}
