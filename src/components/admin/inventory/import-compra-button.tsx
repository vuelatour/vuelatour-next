"use client";

import { useState } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImportCompraDialog } from "./import-compra-dialog";

export function ImportCompraButton({
  providers,
}: {
  providers: { id: string; nombre: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <DocumentArrowUpIcon className="h-4 w-4" />
        Importar PDF
      </Button>
      <ImportCompraDialog open={open} onOpenChange={setOpen} providers={providers} />
    </>
  );
}
