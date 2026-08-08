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
}: {
  path: string;
  filename: string;
  label?: string;
  query?: Record<string, string | undefined>;
  /** Estilo del botón; `link` permite usarlo como enlace dentro de un texto. */
  variant?: "outline" | "link" | "ghost" | "secondary";
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const err = await descargarDelApi(path, { filename, query });
    if (err) toast.error("No se pudo exportar", { description: err });
    setLoading(false);
  };

  return (
    <Button variant={variant} size="sm" className={cn("gap-2", className)} disabled={loading} onClick={run}>
      <TableCellsIcon className="h-4 w-4" />
      {loading ? "Generando…" : label}
    </Button>
  );
}
