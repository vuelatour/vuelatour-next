"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  ExpenseFormDialog,
  type AircraftOption,
  type FlightOption,
  type ProviderOption,
} from "./expense-form-dialog";

interface Props {
  aircraft: AircraftOption[];
  providers: ProviderOption[];
  flights: FlightOption[];
}

export function ExpenseCreateButton({ aircraft, providers, flights }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo gasto
      </Button>
      <ExpenseFormDialog
        open={open}
        onOpenChange={setOpen}
        aircraft={aircraft}
        providers={providers}
        flights={flights}
      />
    </>
  );
}
