"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ClientFormDialog } from "./client-form-dialog";

export function ClientCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo cliente
      </Button>
      <ClientFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
