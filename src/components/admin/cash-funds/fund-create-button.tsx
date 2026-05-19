"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { FundFormDialog, type UserOption } from "./fund-form-dialog";

export function FundCreateButton({ users }: { users: UserOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <PlusIcon className="h-4 w-4" />
        Nuevo fondo
      </Button>
      <FundFormDialog open={open} onOpenChange={setOpen} users={users} />
    </>
  );
}
