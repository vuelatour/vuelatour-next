"use client";

import { useState } from "react";
import { UserPlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { UserInviteDialog } from "./user-invite-dialog";
import type { Rol } from "@/types/me";

/** `rolActor` (invariante 122): a Administración no se le ofrece el rol Dirección. */
export function UserInviteButton({ rolActor }: { rolActor?: Rol | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <UserPlusIcon className="h-4 w-4" />
        Invitar usuario
      </Button>
      <UserInviteDialog open={open} onOpenChange={setOpen} rolActor={rolActor} />
    </>
  );
}
