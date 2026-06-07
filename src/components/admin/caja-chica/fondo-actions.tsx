"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateFondoAction } from "@/app/admin/caja-chica/actions";
import { MovimientoDialog } from "./movimiento-dialog";
import type { CajaFondo } from "@/types/caja-chica";

export function FondoActions({
  fondo,
  usuarios = [],
}: {
  fondo: CajaFondo;
  usuarios?: { id: string; nombre: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [movOpen, setMovOpen] = useState(false);

  const toggle = () => {
    startTransition(async () => {
      const result = await updateFondoAction(fondo.id, { activo: !fondo.activo });
      if (result.ok) toast.success(fondo.activo ? "Fondo desactivado" : "Fondo reactivado");
      else toast.error(result.error ?? "Error");
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setMovOpen(true)}
            className="gap-2"
            title="Reponer saldo (recarga), registrar un reintegro de gastos o un ajuste del fondo."
          >
            <BanknotesIcon className="h-4 w-4" />
            Registrar movimiento
          </DropdownMenuItem>
          {fondo.activo ? (
            <DropdownMenuItem onClick={toggle} className="gap-2 text-destructive focus:text-destructive">
              <PauseCircleIcon className="h-4 w-4" />
              Desactivar fondo
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={toggle} className="gap-2">
              <PlayCircleIcon className="h-4 w-4" />
              Reactivar fondo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <MovimientoDialog
        open={movOpen}
        onOpenChange={setMovOpen}
        fondoId={fondo.id}
        persona={fondo.usuario?.nombre ?? "—"}
        moneda={fondo.moneda}
        usuarios={usuarios}
      />
    </>
  );
}
