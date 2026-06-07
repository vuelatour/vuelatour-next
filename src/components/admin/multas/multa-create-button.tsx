"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MultaFormDialog } from "./multa-form-dialog";

export function MultaCreateButton({
  aircraft,
  pilots,
}: {
  aircraft: { id: string; matricula: string }[];
  pilots: { id: string; nombre: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Registrar multa
      </Button>
      {open && (
        <MultaFormDialog open={open} onOpenChange={setOpen} aircraft={aircraft} pilots={pilots} />
      )}
    </>
  );
}
