"use client";

import { useState, useTransition } from "react";
import { LinkIcon, EllipsisHorizontalIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { linkMovimientoAction } from "@/app/admin/conciliacion/actions";
import type { MovimientoBancario } from "@/types/conciliacion";

interface MovimientoActionsProps {
  movimiento: MovimientoBancario;
  gastos: { value: string; label: string }[];
}

export function MovimientoActions({ movimiento, gastos }: MovimientoActionsProps) {
  const [openLink, setOpenLink] = useState(false);
  const [gastoId, setGastoId] = useState("");
  const [pending, startTransition] = useTransition();

  const unlink = () => {
    startTransition(async () => {
      const r = await linkMovimientoAction(movimiento.id, null);
      if (r.ok) toast.success("Desvinculado");
      else toast.error(r.error ?? "Error");
    });
  };

  const link = () => {
    if (!gastoId) {
      toast.error("Selecciona un gasto");
      return;
    }
    startTransition(async () => {
      const r = await linkMovimientoAction(movimiento.id, gastoId);
      if (r.ok) {
        toast.success("Gasto vinculado");
        setOpenLink(false);
        setGastoId("");
      } else {
        toast.error(r.error ?? "Error");
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
          {movimiento.conciliado ? (
            <DropdownMenuItem onClick={unlink} className="gap-2 text-destructive focus:text-destructive">
              <XMarkIcon className="h-4 w-4" />
              Desvincular gasto
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setOpenLink(true)} className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Vincular gasto
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openLink} onOpenChange={setOpenLink}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular gasto</DialogTitle>
            <DialogDescription>
              Cargo de {Number(movimiento.monto).toLocaleString("es-MX")} del {movimiento.fecha}.
              Selecciona el gasto capturado que corresponde.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Gasto</Label>
            <SearchableSelect
              options={gastos}
              value={gastoId}
              onChange={setGastoId}
              placeholder="Buscar gasto"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenLink(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={link} disabled={pending}>
              {pending ? "Vinculando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
