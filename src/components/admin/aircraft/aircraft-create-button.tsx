"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { AircraftFormDialog } from "./aircraft-form-dialog";

export function AircraftCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva aeronave
      </Button>
      <AircraftFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
