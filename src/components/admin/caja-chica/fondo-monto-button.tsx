"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/admin/form-field";
import { updateFondoAction } from "@/app/admin/caja-chica/actions";

/**
 * Fijar/editar el monto NOMINAL del fondo ("su caja es de $6,000") desde el
 * detalle. Con el monto fijado, el header muestra "por reponer" =
 * fondo − saldo (el número del cheque de reposición).
 */
export function FondoMontoButton({
  fondoId,
  montoActual,
  persona,
}: {
  fondoId: string;
  montoActual: number | null;
  persona: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setMonto(montoActual != null ? String(montoActual) : "");
  }, [open, montoActual]);

  const guardar = () => {
    startTransition(async () => {
      const res = await updateFondoAction(fondoId, { monto_fondo: monto });
      if (res.ok) {
        toast.success("Fondo actualizado");
        setOpen(false);
        router.refresh();
      } else if (res.fieldErrors) {
        toast.error(res.fieldErrors.monto_fondo?.[0] ?? "Monto inválido");
      } else {
        toast.error(res.error ?? "No se pudo actualizar");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Fijar o editar el monto del fondo"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        {montoActual != null ? "Editar" : "Fijar fondo"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Monto del fondo</DialogTitle>
            <DialogDescription>
              ¿De cuánto es la caja de {persona}? Con esto se muestra
              &quot;por reponer&quot; = fondo − saldo.
            </DialogDescription>
          </DialogHeader>
          <Field label="Monto">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Ej. 6000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={guardar} disabled={pending || !monto}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
