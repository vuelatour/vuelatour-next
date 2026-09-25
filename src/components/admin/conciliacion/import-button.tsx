"use client";

import { useState } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImportDialog, type CuentaImportOption } from "./import-dialog";

export function ImportButton({
  cuentas,
  label = "Importar estado de cuenta",
  variant = "default",
}: {
  cuentas: CuentaImportOption[];
  /** Texto del botón (Ingresos lo llama «Subir estado de cuenta», 24-sep-2026). */
  label?: string;
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" variant={variant}>
        <DocumentArrowUpIcon className="h-4 w-4" />
        {label}
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} cuentas={cuentas} />
    </>
  );
}
