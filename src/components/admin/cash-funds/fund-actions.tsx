"use client";

import { useState, useTransition } from "react";
import {
  BanknotesIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteFundAction } from "@/app/admin/cash-funds/actions";
import { FundFormDialog, type UserOption } from "./fund-form-dialog";
import { MovementFormDialog } from "./movement-form-dialog";
import type { CashFund } from "@/types/cash-funds";

interface Props {
  fund: CashFund;
  users: UserOption[];
}

export function FundActions({ fund, users }: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openMovement, setOpenMovement] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteFundAction(fund.id);
      if (result.ok) {
        toast.success("Fondo marcado como inactivo");
        setOpenDelete(false);
      } else {
        toast.error(result.error ?? "Error al eliminar");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenMovement(true)} className="gap-2">
            <BanknotesIcon className="h-4 w-4" />
            Solicitar movimiento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {fund.activo && (
            <DropdownMenuItem
              onSelect={() => setOpenDelete(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4" />
              Desactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <FundFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialFund={fund}
        users={users}
      />
      <MovementFormDialog open={openMovement} onOpenChange={setOpenMovement} fund={fund} />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar este fondo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactivo y no podrán solicitarse nuevos movimientos. El
              historial se conserva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Desactivando…" : "Desactivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
