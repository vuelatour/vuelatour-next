"use client";

import { useState, useTransition } from "react";
import {
  EllipsisHorizontalIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  deleteRecibidaAction,
  signRecibidaAction,
  updateRecibidaAction,
} from "@/app/admin/facturas-recibidas/actions";
import type { FacturaRecibida } from "@/types/invoices";

export function RecibidaActions({
  recibida,
  gastos,
}: {
  recibida: FacturaRecibida;
  gastos: { id: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [gastoId, setGastoId] = useState(recibida.gasto_id ?? "");
  const [categoria, setCategoria] = useState(recibida.categoria_sugerida ?? "");
  const [notas, setNotas] = useState(recibida.notas ?? "");

  const link = () => {
    startTransition(async () => {
      const res = await updateRecibidaAction(recibida.id, {
        gasto_id: gastoId || undefined,
        categoria_sugerida: categoria || undefined,
        notas: notas || undefined,
      });
      if (res.ok) {
        toast.success("Factura amarrada");
        setLinkOpen(false);
      } else toast.error(res.error ?? "Error");
    });
  };

  const descartar = () => {
    startTransition(async () => {
      const res = await updateRecibidaAction(recibida.id, { estado: "DESCARTADA" });
      if (res.ok) toast.success("Factura descartada");
      else toast.error(res.error ?? "Error");
    });
  };

  const descargar = () => {
    if (!recibida.xml_url) return;
    startTransition(async () => {
      const res = await signRecibidaAction(recibida.xml_url!);
      if (res.ok && res.data) window.open(res.data, "_blank");
      else toast.error(res.error ?? "No se pudo descargar");
    });
  };

  const eliminar = () => {
    startTransition(async () => {
      const res = await deleteRecibidaAction(recibida.id);
      if (res.ok) {
        toast.success("Factura eliminada");
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
          <DropdownMenuItem onClick={() => setLinkOpen(true)} className="gap-2">
            <LinkIcon className="h-4 w-4" />
            Amarrar a gasto
          </DropdownMenuItem>
          {recibida.xml_url && (
            <DropdownMenuItem onClick={descargar} className="gap-2">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Descargar XML
            </DropdownMenuItem>
          )}
          {recibida.estado !== "DESCARTADA" && (
            <DropdownMenuItem onClick={descartar} className="gap-2">
              <XCircleIcon className="h-4 w-4" />
              Descartar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Amarrar factura a un gasto</DialogTitle>
            <DialogDescription>
              {recibida.emisor_nombre ?? recibida.emisor_rfc ?? "Proveedor"} ·{" "}
              {recibida.total ?? "—"} {recibida.moneda ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Gasto</Label>
              <SearchableSelect
                options={[{ value: "", label: "Sin amarrar" }, ...gastos.map((g) => ({ value: g.id, label: g.label }))]}
                value={gastoId}
                onChange={setGastoId}
                placeholder="Busca el gasto correspondiente"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Categoría sugerida</Label>
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="refacción, taller…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notas</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={link} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta factura recibida?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita del buzón el registro de {recibida.emisor_nombre ?? recibida.emisor_rfc ?? "este proveedor"}.
              Esta acción no se puede deshacer.
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
