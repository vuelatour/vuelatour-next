"use client";

import { useState, useTransition } from "react";
import {
  ArrowsRightLeftIcon,
  EllipsisHorizontalIcon,
  LinkSlashIcon,
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
import {
  deleteBankMovementAction,
  unreconcileBankMovementAction,
} from "@/app/admin/treasury/actions";
import {
  BankMovementFormDialog,
  type BankAccountOption,
} from "./bank-movement-form-dialog";
import { ReconcileDialog, type GastoOption } from "./reconcile-dialog";
import type { BankMovement } from "@/types/treasury";

interface Props {
  movement: BankMovement;
  bankAccounts: BankAccountOption[];
  gastos: GastoOption[];
}

export function BankMovementActions({ movement, bankAccounts, gastos }: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openReconcile, setOpenReconcile] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteBankMovementAction(movement.id);
      if (result.ok) {
        toast.success("Movimiento eliminado");
        setOpenDelete(false);
      } else {
        toast.error(result.error ?? "Error al eliminar");
      }
    });
  };

  const handleUnreconcile = () => {
    startTransition(async () => {
      const result = await unreconcileBankMovementAction(movement.id);
      if (result.ok) {
        toast.success("Conciliación deshecha");
      } else {
        toast.error(result.error ?? "Error");
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
          {!movement.conciliado && (
            <DropdownMenuItem onSelect={() => setOpenReconcile(true)} className="gap-2">
              <ArrowsRightLeftIcon className="h-4 w-4" />
              Conciliar con gasto
            </DropdownMenuItem>
          )}
          {movement.conciliado && (
            <DropdownMenuItem onSelect={handleUnreconcile} className="gap-2">
              <LinkSlashIcon className="h-4 w-4" />
              Deshacer conciliación
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setOpenDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BankMovementFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialMovement={movement}
        bankAccounts={bankAccounts}
      />
      <ReconcileDialog
        open={openReconcile}
        onOpenChange={setOpenReconcile}
        movement={movement}
        gastos={gastos}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              El movimiento bancario se borra de forma permanente.
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
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
