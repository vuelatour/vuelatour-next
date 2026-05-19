"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ItemFormDialog } from "./item-form-dialog";

export function ItemCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo insumo
      </Button>
      <ItemFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
