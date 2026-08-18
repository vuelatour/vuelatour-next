"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
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
import { deleteCajaMovimientoAction } from "@/app/admin/caja-chica/actions";
import type { CajaMovimiento, MonedaCaja } from "@/types/caja-chica";
import { MovimientoDialog } from "./movimiento-dialog";

/**
 * Menú ⋯ de un MOVIMIENTO de caja (reposición/reintegro/ajuste): corregir
 * (fecha/monto/tipo/notas) o eliminar con confirmación. Nació del caso Mari
 * (18-ago): registró el ingreso sin la fecha real y no había NINGUNA forma
 * de corregirlo o borrarlo.
 */
export function MovimientoActions({
  movimiento,
  fondoId,
  persona,
  moneda,
  usuarios,
}: {
  movimiento: CajaMovimiento;
  fondoId: string;
  persona: string;
  moneda: MonedaCaja;
  usuarios: { id: string; nombre: string }[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const eliminar = () =>
    startTransition(async () => {
      const res = await deleteCajaMovimientoAction(movimiento.id, fondoId);
      if (res.ok) {
        toast.success("Movimiento eliminado");
        setDeleteOpen(false);
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <EllipsisHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Acciones del movimiento</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Base UI: onClick, no onSelect (onSelect queda mudo). */}
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Corregir (fecha, monto, notas)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MovimientoDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        fondoId={fondoId}
        persona={persona}
        moneda={moneda}
        usuarios={usuarios}
        movimiento={movimiento}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              El saldo del fondo se recalcula al quitarlo. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={eliminar}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
