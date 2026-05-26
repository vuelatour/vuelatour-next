"use client";

import { useState } from "react";
import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { MovimientoDialog } from "./movimiento-dialog";

interface MovimientoButtonProps {
  itemId: string;
  itemNombre: string;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
}

export function MovimientoButton(props: MovimientoButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <ArrowsUpDownIcon className="h-4 w-4" />
        Registrar movimiento
      </Button>
      <MovimientoDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
