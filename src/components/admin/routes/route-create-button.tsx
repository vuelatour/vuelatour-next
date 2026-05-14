"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { RouteFormDialog } from "./route-form-dialog";

export function RouteCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva ruta
      </Button>
      <RouteFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
