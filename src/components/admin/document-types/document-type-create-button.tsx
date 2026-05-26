"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { DocumentTypeFormDialog } from "./document-type-form-dialog";

export function DocumentTypeCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo tipo
      </Button>
      <DocumentTypeFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
