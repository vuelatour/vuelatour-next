"use client";

import { useState, useTransition } from "react";
import {
  CheckCircleIcon,
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
import {
  deleteExpenseAction,
  setExpenseReconciledAction,
} from "@/app/admin/expenses/actions";
import {
  ExpenseFormDialog,
  type AircraftOption,
  type FlightOption,
  type ProviderOption,
} from "./expense-form-dialog";
import type { Expense } from "@/types/expenses";

interface Props {
  expense: Expense;
  aircraft: AircraftOption[];
  providers: ProviderOption[];
  flights: FlightOption[];
}

export function ExpenseActions({ expense, aircraft, providers, flights }: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id);
      if (result.ok) {
        toast.success("Gasto eliminado");
        setOpenDelete(false);
      } else {
        toast.error(result.error ?? "Error al eliminar");
      }
    });
  };

  const handleToggleReconciled = () => {
    startTransition(async () => {
      const result = await setExpenseReconciledAction(expense.id, !expense.conciliado);
      if (result.ok) {
        toast.success(expense.conciliado ? "Marcado como no conciliado" : "Marcado como conciliado");
      } else {
        toast.error(result.error ?? "Error al actualizar");
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
          <DropdownMenuItem onSelect={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleToggleReconciled} className="gap-2">
            <CheckCircleIcon className="h-4 w-4" />
            {expense.conciliado ? "Marcar no conciliado" : "Marcar conciliado"}
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

      <ExpenseFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialExpense={expense}
        aircraft={aircraft}
        providers={providers}
        flights={flights}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              El gasto se borra de forma permanente. Esta acción no se puede deshacer.
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
