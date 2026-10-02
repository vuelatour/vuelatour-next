"use client";

import { useState } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { UserFormDialog } from "@/components/admin/users/user-form-dialog";
import { BOTON_EDITAR_PILOTO } from "@/lib/admin/pilotos-edicion";
import type { User } from "@/types/users";

/**
 * «Editar datos» del piloto (2-oct-2026): abre el diálogo de usuario en modo
 * PILOTO (nombre, nombre corto, teléfono y tarjeta). Lo pintan la card de la
 * lista y la cabecera del detalle SOLO con `puedeEditarPiloto(rol)`; el API
 * es el candado. Recibe el piloto ya recortado con `usuarioParaEdicion`.
 */
export function EditarDatosPilotoButton({
  pilot,
  size = "default",
}: {
  pilot: User;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className="cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <PencilSquareIcon className="h-4 w-4" />
        {BOTON_EDITAR_PILOTO}
      </Button>
      {open && <UserFormDialog modo="piloto" open={open} onOpenChange={setOpen} user={pilot} />}
    </>
  );
}
