"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { FondoFormDialog } from "./fondo-form-dialog";

export function FondoCreateButton({
  usuarios,
}: {
  usuarios: { id: string; nombre: string; rol: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Abrir fondo
      </Button>
      <FondoFormDialog open={open} onOpenChange={setOpen} usuarios={usuarios} />
    </>
  );
}
