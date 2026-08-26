"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { assignAeronaveGastoAction } from "@/app/admin/expenses/actions";

/** Opción de aeronave para el selector (activas). */
export interface AeronaveOption {
  id: string;
  matricula: string;
  modelo: string;
}

/**
 * Asigna el avión a una carga de combustible sin avión — LA acción central
 * del modelo por avión/mes: sin avión la carga no entra al Balance y bloquea
 * el pre-cierre del mes.
 */
export function FuelAssignAircraft({
  gastoId,
  aircraft,
}: {
  gastoId: string;
  aircraft: AeronaveOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [aeronaveId, setAeronaveId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const asignar = () => {
    if (!aeronaveId) {
      toast.error("Elige la aeronave");
      return;
    }
    startTransition(async () => {
      const r = await assignAeronaveGastoAction(gastoId, aeronaveId);
      if (r.ok) {
        toast.success("Avión asignado a la carga");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo asignar el avión");
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1 px-2 text-xs border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400"
      >
        <PaperAirplaneIcon className="h-3 w-3" />
        Asignar avión
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setAeronaveId("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿De qué avión es esta carga?</DialogTitle>
            <DialogDescription>
              El combustible se controla por avión y por mes: sin avión, la
              carga no entra al Balance y bloquea el cierre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <SearchableSelect
              options={aircraft.map((a) => ({
                value: a.id,
                label: a.matricula,
                description: a.modelo,
              }))}
              value={aeronaveId}
              onChange={setAeronaveId}
              placeholder="Elige la aeronave…"
              searchPlaceholder="Buscar matrícula…"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button size="sm" disabled={pending || !aeronaveId} onClick={asignar}>
                {pending ? "Asignando…" : "Asignar avión"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
