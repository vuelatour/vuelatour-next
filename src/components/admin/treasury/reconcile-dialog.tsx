"use client";

import { useState, useTransition } from "react";
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
import { reconcileBankMovementAction } from "@/app/admin/treasury/actions";
import type { BankMovement } from "@/types/treasury";

export interface GastoOption {
  value: string;
  label: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: BankMovement;
  gastos: GastoOption[];
}

export function ReconcileDialog({ open, onOpenChange, movement, gastos }: Props) {
  const [gastoId, setGastoId] = useState("");
  const [pending, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    if (!next) setGastoId("");
    onOpenChange(next);
  };

  const submit = () => {
    if (!gastoId) {
      toast.error("Selecciona un gasto");
      return;
    }
    startTransition(async () => {
      const result = await reconcileBankMovementAction(movement.id, gastoId);
      if (result.ok) {
        toast.success("Movimiento conciliado");
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Error al conciliar");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Conciliar movimiento</DialogTitle>
          <DialogDescription>
            Enlaza este movimiento bancario con un gasto capturado. Ambos quedarán
            marcados como conciliados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">
              {movement.tipo} · {movement.monto}
            </p>
            <p className="text-xs text-muted-foreground">
              {movement.fecha}
              {movement.descripcion ? ` · ${movement.descripcion}` : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Gasto</Label>
            <SearchableSelect
              options={gastos}
              value={gastoId}
              onChange={setGastoId}
              placeholder="Busca un gasto sin conciliar"
              emptyText="Sin gastos pendientes"
            />
            <p className="text-xs text-muted-foreground">
              Solo se listan gastos aún no conciliados.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Conciliando…" : "Conciliar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
