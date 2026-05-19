"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  ExpirationFormDialog,
  type AircraftOption,
  type EngineOption,
  type PilotOption,
} from "./expiration-form-dialog";
import type { DocumentType } from "@/types/expirations";

interface Props {
  documentTypes: DocumentType[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  engines: EngineOption[];
}

export function ExpirationCreateButton({
  documentTypes,
  aircraft,
  pilots,
  engines,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo vencimiento
      </Button>
      <ExpirationFormDialog
        open={open}
        onOpenChange={setOpen}
        documentTypes={documentTypes}
        aircraft={aircraft}
        pilots={pilots}
        engines={engines}
      />
    </>
  );
}
