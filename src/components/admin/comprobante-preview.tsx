import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { ImagePreview } from "@/components/admin/image-preview";

/**
 * Miniatura de comprobante de gasto: imagen con zoom o, si el archivo es PDF
 * (facturas que sube la oficina), un botón que lo abre en otra pestaña.
 * `path` es el path del bucket (decide el tipo); `url` la URL firmada.
 */
export function ComprobantePreview({
  path,
  url,
  alt,
  thumbClassName,
}: {
  path: string;
  url: string;
  alt: string;
  thumbClassName?: string;
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
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`${alt} (${etiqueta})`}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-brand-500"
      >
        <DocumentTextIcon className="h-4 w-4" />
        {etiqueta}
      </a>
    );
  }
  return <ImagePreview src={url} alt={alt} thumbClassName={thumbClassName} />;
}
