"use client";

import { useTransition } from "react";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { getExpirationArchivoAction } from "@/app/admin/expirations/actions";

/**
 * Botón compacto "Ver documento" de un vencimiento: pide la URL firmada al
 * momento (bucket privado, solo oficina) y abre en pestaña nueva. Reutilizado
 * en tabla de vencimientos, home, ingeniería y ficha del piloto.
 */
export function VerDocumentoButton({
  expirationId,
  label = "Ver documento",
  className,
}: {
  expirationId: string;
  label?: string;
  className?: string;
}) {
  const [abriendo, start] = useTransition();
  return (
    <button
      type="button"
      className={
        className ??
        "inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline"
      }
      onClick={(e) => {
        // Dentro de filas que son <Link>: el clic no debe navegar.
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const res = await getExpirationArchivoAction(expirationId);
          if (res.ok && res.data?.url) {
            window.open(res.data.url, "_blank", "noopener");
          } else {
            toast.error(res.error ?? "No se pudo abrir el documento");
          }
        });
      }}
      disabled={abriendo}
    >
      <DocumentTextIcon className="h-3 w-3" />
      {abriendo ? "Abriendo…" : label}
    </button>
  );
}
