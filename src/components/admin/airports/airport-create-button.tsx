"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { AirportFormDialog } from "./airport-form-dialog";

export function AirportCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo aeropuerto
      </Button>
      <AirportFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
