"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  BankMovementFormDialog,
  type BankAccountOption,
} from "./bank-movement-form-dialog";

export function BankMovementCreateButton({
  bankAccounts,
}: {
  bankAccounts: BankAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo movimiento
      </Button>
      <BankMovementFormDialog
        open={open}
        onOpenChange={setOpen}
        bankAccounts={bankAccounts}
      />
    </>
  );
}
