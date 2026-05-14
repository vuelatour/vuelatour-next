"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ProviderFormDialog } from "./provider-form-dialog";

export function ProviderCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo proveedor
      </Button>
      <ProviderFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
