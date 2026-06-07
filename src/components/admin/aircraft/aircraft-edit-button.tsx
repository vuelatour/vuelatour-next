"use client";

import { useState } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { AircraftFormDialog } from "./aircraft-form-dialog";
import type { Aircraft } from "@/types/aircraft";

export function AircraftEditButton({ aircraft }: { aircraft: Aircraft }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <PencilSquareIcon className="h-4 w-4" />
        Editar
      </Button>
      <AircraftFormDialog open={open} onOpenChange={setOpen} initialAircraft={aircraft} />
    </>
  );
}
