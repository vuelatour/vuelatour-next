"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ExternalFlightFormSheet } from "./external-flight-form-sheet";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

export function NewExternalFlightButton({
  clients,
  airports,
}: {
  clients: ClientOption[];
  airports: AirportOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <PlusIcon className="h-4 w-4" />
        Nuevo vuelo externo
      </Button>
      <ExternalFlightFormSheet
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        airports={airports}
      />
    </>
  );
}
