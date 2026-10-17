"use client";

import { useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { descargarDelApi } from "@/lib/download";

/** Descarga un Excel desde un endpoint del API (blob + token de sesión). Reutilizable. */
export function ExcelExportButton({
  path,
  filename,
  label = "Exportar Excel",
  query,
  variant = "outline",
  className,
  title,
  "aria-label": ariaLabel,
  camposOpcionales,
}: {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
  /** Estilo del botón; `link` permite usarlo como enlace dentro de un texto. */
  variant?: "outline" | "link" | "ghost" | "secondary";
  className?: string;
  /** Tooltip (ADITIVO, 12-oct-2026): el nombre largo cuando `label` es corto («Excel»). */
  title?: string;
  /** Nombre accesible (ADITIVO): distingue botones con el mismo `label` («Descargar el balance de XB-PEV en Excel»). */
  "aria-label"?: string;
  /** Campos que un API previo puede no conocer (ADITIVO, 16-oct-2026): ver `descargarDelApi`. */
  camposOpcionales?: readonly string[];
}) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const err = await descargarDelApi(path, { filename, query, camposOpcionales });
    if (err) toast.error("No se pudo exportar", { description: err });
    setLoading(false);
  };

  // Con `aria-label` el nombre accesible tapa el texto visible: en carga se
  // antepone «Generando…» (y va `aria-busy`) para que el lector también lo
  // sepa. Sin `aria-label` y sin carga, el marcado es byte a byte el de siempre.
  const nombre = ariaLabel ? (loading ? `Generando… ${ariaLabel}` : ariaLabel) : undefined;

  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("gap-2", className)}
      disabled={loading}
      onClick={run}
      title={title}
      aria-label={nombre}
      aria-busy={loading || undefined}
    >
      <TableCellsIcon className="h-4 w-4" />
      {loading ? "Generando…" : label}
    </Button>
  );
}
