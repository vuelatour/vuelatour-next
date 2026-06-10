"use client";

import { useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ReservaFormSheet } from "./reserva-form-sheet";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

interface PilotOption {
  id: string;
  nombre: string;
}

export function NewReservaButton({
  clients,
  airports,
  aircraft,
  pilots,
}: {
  clients: ClientOption[];
  airports: AirportOption[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <CalendarDaysIcon className="h-4 w-4" />
        Apartar espacio
      </Button>
      <ReservaFormSheet
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        airports={airports}
        aircraft={aircraft}
        pilots={pilots}
      />
    </>
  );
}
