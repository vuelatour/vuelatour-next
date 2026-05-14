"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  CardFormDialog,
  type BankAccountOption,
  type UserOption,
} from "./card-form-dialog";

interface Props {
  users: UserOption[];
  bankAccounts: BankAccountOption[];
}

export function CardCreateButton({ users, bankAccounts }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nueva tarjeta
      </Button>
      <CardFormDialog
        open={open}
        onOpenChange={setOpen}
        users={users}
        bankAccounts={bankAccounts}
      />
    </>
  );
}
