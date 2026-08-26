"use client";

import { useState, useTransition } from "react";
import { EllipsisHorizontalIcon, PencilIcon, TrashIcon, LinkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { deleteCardAction, linkCardUserAction } from "@/app/admin/cards/actions";
import {
  CardFormDialog,
  type BankAccountOption,
  type UserOption,
} from "./card-form-dialog";
import type { Card } from "@/types/cards";

interface Props {
  card: Card;
  users: UserOption[];
  bankAccounts: BankAccountOption[];
}

export function CardActions({ card, users, bankAccounts }: Props) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  // Vínculo RÁPIDO tarjeta→usuario (26-ago): un clic, un selector, listo.
  // El API sincroniza el espejo usuario.tarjeta_terminacion solo.
  const [openLink, setOpenLink] = useState(false);
  const [linkUsuario, setLinkUsuario] = useState(card.usuario_id ?? "");
  const [pending, startTransition] = useTransition();

  const handleLink = () => {
    startTransition(async () => {
      const result = await linkCardUserAction(card.id, linkUsuario || null);
      if (result.ok) {
        toast.success(
          linkUsuario ? "Tarjeta vinculada al usuario" : "Tarjeta desvinculada",
        );
        setOpenLink(false);
      } else {
        toast.error(result.error ?? "No se pudo vincular");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCardAction(card.id);
      if (result.ok) {
        toast.success("Tarjeta marcada como inactiva");
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
          <DropdownMenuItem
            onClick={() => {
              setLinkUsuario(card.usuario_id ?? "");
              setOpenLink(true);
            }}
            className="gap-2"
          >
            <LinkIcon className="h-4 w-4" />
            Vincular usuario
          </DropdownMenuItem>
          {card.activa && (
            <DropdownMenuItem
              onClick={() => setOpenDelete(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4" />
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CardFormDialog
        open={openEdit}
        onOpenChange={setOpenEdit}
        initialCard={card}
        users={users}
        bankAccounts={bankAccounts}
      />

      {/* Vínculo rápido: quién trae la tarjeta (espejo en Usuarios se
          actualiza solo; "Sin vincular" la suelta). */}
      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular **** {card.terminacion}</DialogTitle>
            <DialogDescription>
              El usuario elegido queda con esta tarjeta como suya (columna
              Tarjeta de Usuarios y preselección en la app). Si otro usuario
              la tenía, se le quita.
            </DialogDescription>
          </DialogHeader>
          <SearchableSelect
            options={[
              { value: "", label: "Sin vincular" },
              ...users.map((u) => ({ value: u.id, label: u.nombre })),
            ]}
            value={linkUsuario}
            onChange={setLinkUsuario}
            placeholder="Elige al usuario"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenLink(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={handleLink} disabled={pending}>
              {pending ? "Guardando…" : "Guardar vínculo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarjeta **** {card.terminacion}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como inactiva. Los gastos históricos quedan intactos.
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
