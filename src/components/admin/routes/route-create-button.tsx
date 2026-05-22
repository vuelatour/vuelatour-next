"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { RouteFormSheet } from "./route-form-sheet";

interface AirportOption {
  iata: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

export function RouteCreateButton({ airports }: { airports: AirportOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva ruta
      </Button>
      <RouteFormSheet open={open} onOpenChange={setOpen} airports={airports} />
    </>
  );
}
