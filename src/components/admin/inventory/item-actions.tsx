"use client";

import { useState, useTransition } from "react";
import {
  ArrowsRightLeftIcon,
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
import { deleteItemAction } from "@/app/admin/inventory/actions";
import { ItemFormDialog } from "./item-form-dialog";
import {
  MovementFormDialog,
  type AircraftOption,
  type ProviderOption,
} from "./movement-form-dialog";
import type { InventoryItem } from "@/types/inventory";

interface Props {
  item: InventoryItem;
  aircraft: AircraftOption[];
  providers: ProviderOption[];
}

export function ItemActions({ item, aircraft, providers }: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openMovement, setOpenMovement] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteItemAction(item.id);
      if (result.ok) {
        toast.success("Insumo marcado como inactivo");
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
            <ArrowsRightLeftIcon className="h-4 w-4" />
            Registrar movimiento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {item.activo && (
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

      <ItemFormDialog open={openEdit} onOpenChange={setOpenEdit} initialItem={item} />
      <MovementFormDialog
        open={openMovement}
        onOpenChange={setOpenMovement}
        item={item}
        aircraft={aircraft}
        providers={providers}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar {item.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactivo y no podrán registrarse nuevos movimientos. El
              cardex histórico se conserva.
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
