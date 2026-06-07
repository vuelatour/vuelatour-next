"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MultaFormDialog } from "./multa-form-dialog";
import { deleteMultaAction } from "@/app/admin/multas/actions";
import type { Multa } from "@/types/multas";

export function MultaActions({
  multa,
  aircraft,
  pilots,
}: {
  multa: Multa;
  aircraft: { id: string; matricula: string }[];
  pilots: { id: string; nombre: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const eliminar = () => {
    startTransition(async () => {
      const res = await deleteMultaAction(multa.id);
      if (res.ok) {
        toast.success("Multa eliminada");
        setDeleteOpen(false);
      } else toast.error(res.error ?? "Error");
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
          <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2">
            <PencilSquareIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <MultaFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          multa={multa}
          aircraft={aircraft}
          pilots={pilots}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta multa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina del registro histórico. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                eliminar();
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
