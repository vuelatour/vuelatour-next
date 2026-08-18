"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
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
  deleteExpirationAction,
  updateExpirationAction,
} from "@/app/admin/expirations/actions";
import {
  ExpirationFormDialog,
  type AircraftOption,
  type EngineOption,
  type PilotOption,
} from "./expiration-form-dialog";
import type { DocumentType, Expiration } from "@/types/expirations";

interface Props {
  expiration: Expiration;
  documentTypes: DocumentType[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  engines: EngineOption[];
}

export function ExpirationActions({
  expiration,
  documentTypes,
  aircraft,
  pilots,
  engines,
}: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Ajuste ÁGIL del crítico por documento (las reglas de la autoridad
  // cambian por semana): escribe el override sin abrir el formulario.
  const esCritico = expiration.tipo?.es_critico ?? false;
  const toggleCritico = () => {
    startTransition(async () => {
      const result = await updateExpirationAction(expiration.id, {
        critico: !esCritico,
      });
      if (result.ok) {
        toast.success(
          !esCritico
            ? "Marcado como crítico: alerta al vencer."
            : "Ya no es crítico: deja de alertar al vencer.",
        );
      } else {
        toast.error(result.error ?? "No se pudo cambiar");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteExpirationAction(expiration.id);
      if (result.ok) {
        toast.success("Vencimiento eliminado");
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
          <DropdownMenuItem onClick={() => setOpenEdit(true)} className="gap-2">
            <PencilIcon className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleCritico} className="gap-2">
            <ExclamationTriangleIcon className="h-4 w-4" />
            {esCritico ? "Quitar crítico" : "Marcar como crítico"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setOpenDelete(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExpirationFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialExpiration={expiration}
        documentTypes={documentTypes}
        aircraft={aircraft}
        pilots={pilots}
        engines={engines}
      />

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este vencimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              El documento deja de contar para alertas y semáforo. Queda bitácora de quién lo eliminó y administración puede restaurarlo desde la ficha del avión.
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
