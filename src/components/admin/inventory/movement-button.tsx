"use client";

import { useState } from "react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  MovementFormDialog,
  type AircraftOption,
  type ProviderOption,
} from "./movement-form-dialog";
import type { InventoryItem } from "@/types/inventory";

interface Props {
  item: InventoryItem;
  aircraft: AircraftOption[];
  providers: ProviderOption[];
}

export function MovementButton({ item, aircraft, providers }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <ArrowsRightLeftIcon className="h-4 w-4" />
        Registrar movimiento
      </Button>
      <MovementFormDialog
        open={open}
        onOpenChange={setOpen}
        item={item}
        aircraft={aircraft}
        providers={providers}
      />
    </>
  );
}
