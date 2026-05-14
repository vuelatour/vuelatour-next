"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { BankAccountFormDialog } from "./bank-account-form-dialog";

export function BankAccountCreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva cuenta
      </Button>
      <BankAccountFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
