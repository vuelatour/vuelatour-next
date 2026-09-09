"use client";

import { useState } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImportDialog, type CuentaImportOption } from "./import-dialog";

export function ImportButton({ cuentas }: { cuentas: CuentaImportOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <DocumentArrowUpIcon className="h-4 w-4" />
        Importar estado de cuenta
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} cuentas={cuentas} />
    </>
  );
}
