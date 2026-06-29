"use client";

import { useState, useTransition } from "react";
import {
  CheckBadgeIcon,
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
import { deleteGastoAction, dismissDuplicadoAction } from "@/app/admin/expenses/actions";
import { ExpenseVerifyDialog } from "./expense-verify-dialog";
import type { Gasto } from "@/types/expenses";

interface ExpenseActionsProps {
  gasto: Gasto;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** URL firmada de la foto del comprobante (bucket privado), si tiene. */
  fotoUrl?: string;
}

export function ExpenseActions({ gasto, aircraft, providers, fotoUrl }: ExpenseActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const dismiss = () => {
    startTransition(async () => {
      const r = await dismissDuplicadoAction(gasto.id);
      if (r.ok) toast.success("Marcado como no duplicado");
      else toast.error(r.error ?? "Error");
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const r = await deleteGastoAction(gasto.id);
      if (r.ok) {
        toast.success("Gasto eliminado");
        setOpenDelete(false);
      } else {
        toast.error(r.error ?? "Error al eliminar");
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
          <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Verificar / editar
          </DropdownMenuItem>
          {gasto.duplicado_sospechado && (
            <DropdownMenuItem onClick={dismiss} className="gap-2">
              <CheckBadgeIcon className="h-4 w-4" />
              No es duplicado
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setOpenDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExpenseVerifyDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        gasto={gasto}
        aircraft={aircraft}
        providers={providers}
        fotoUrl={fotoUrl}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se borra el registro del gasto.
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
