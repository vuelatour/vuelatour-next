"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
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
import { MovimientoDialog } from "./movimiento-dialog";
import type { InventarioItem } from "@/types/inventory";

interface ItemActionsProps {
  item: InventarioItem;
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  categorias?: string[];
}

export function ItemActions({ item, aircraft, providers, categorias }: ItemActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openSalida, setOpenSalida] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteItemAction(item.id);
      if (result.ok) {
        toast.success("Ítem marcado como inactivo");
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
          {item.activo && (
            <DropdownMenuItem onClick={() => setOpenSalida(true)} className="gap-2">
              <PaperAirplaneIcon className="h-4 w-4" />
              Registrar salida (cargar a avión)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {item.activo && (
            <DropdownMenuItem
              onClick={() => setOpenDelete(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4" />
              Desactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialItem={item}
        categorias={categorias}
      />

      <MovimientoDialog
        open={openSalida}
        onOpenChange={setOpenSalida}
        itemId={item.id}
        itemNombre={item.nombre}
        unidad={item.unidad}
        empaques={item.empaques ?? []}
        aircraft={aircraft}
        providers={providers}
        initialTipo="SALIDA"
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar {item.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marca como inactivo y deja de aparecer en el catálogo. El cardex histórico queda
              intacto.
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
