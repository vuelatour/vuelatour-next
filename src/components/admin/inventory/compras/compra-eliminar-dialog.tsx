"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
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
import { deleteCompraAction } from "@/app/admin/inventory/compras/actions";
import { textoConfirmarEliminarCompra } from "@/lib/admin/compras-estado";
import type { CompraListItem } from "@/types/compras";

/**
 * Eliminar desde la LISTA una compra sin líneas (21-oct-2026; captura del
 * cliente: compras #12, #11, #10 y #7 «Abiertas» con 0 líneas y 0 pagos que
 * nadie sabía qué eran). Solo ABIERTA y sin líneas (`puedeEliminarDesdeLista`);
 * el API rechaza las recibidas. Con confirmación, como toda baja.
 */
export function CompraEliminarDialog({ compra }: { compra: Pick<CompraListItem, "id" | "folio" | "n_pagos"> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const eliminar = () => {
    startTransition(async () => {
      const r = await deleteCompraAction(compra.id);
      if (r.ok) {
        toast.success(`Compra #${compra.folio} eliminada`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo eliminar la compra");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-destructive hover:bg-muted"
        title={`Eliminar la compra #${compra.folio} (sin líneas)`}
        aria-label={`Eliminar la compra #${compra.folio}`}
        data-eliminar-compra={compra.id}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la compra #{compra.folio}?</AlertDialogTitle>
            <AlertDialogDescription>{textoConfirmarEliminarCompra(compra)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                eliminar();
              }}
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
