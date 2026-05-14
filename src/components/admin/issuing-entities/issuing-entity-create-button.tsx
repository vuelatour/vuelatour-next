"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { IssuingEntityFormDialog } from "./issuing-entity-form-dialog";

export function IssuingEntityCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva entidad
      </Button>
      <IssuingEntityFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
