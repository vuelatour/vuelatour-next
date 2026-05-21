"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  KeyIcon,
  NoSymbolIcon,
  PencilIcon,
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
import { deactivateUserAction } from "@/app/admin/users/actions";
import { UserFormDialog } from "./user-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { User } from "@/types/users";

export function UserActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openReset, setOpenReset] = useState(false);
  const [openDeactivate, setOpenDeactivate] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDeactivate = () => {
    startTransition(async () => {
      const result = await deactivateUserAction(user.id);
      if (result.ok) {
        toast.success("Usuario desactivado");
        setOpenDeactivate(false);
      } else {
        toast.error(result.error ?? "Error al desactivar");
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
          <DropdownMenuItem onClick={() => setOpenReset(true)} className="gap-2">
            <KeyIcon className="h-4 w-4" />
            {user.supabase_auth_id ? "Restablecer contraseña" : "Crear contraseña"}
          </DropdownMenuItem>
          {user.estado === "ACTIVO" && !isSelf && (
            <DropdownMenuItem
              onClick={() => setOpenDeactivate(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <NoSymbolIcon className="h-4 w-4" />
              Desactivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserFormDialog open={openEdit} onOpenChange={setOpenEdit} user={user} />
      <ResetPasswordDialog open={openReset} onOpenChange={setOpenReset} user={user} />

      <AlertDialog open={openDeactivate} onOpenChange={setOpenDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar a {user.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario quedará en estado INACTIVO y no podrá acceder al sistema. Puede
              reactivarlo después editándolo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeactivate();
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
