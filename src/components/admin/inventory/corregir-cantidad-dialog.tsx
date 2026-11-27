"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { corregirCantidadMovimientoAction } from "@/app/admin/inventory/actions";
import { Field } from "@/components/admin/form-field";
import { fmtDateOnly } from "@/lib/datetime";
import { cantidadConUnidad } from "@/lib/admin/inventario-eliminar";
import {
  AYUDA_CORREGIR_CANTIDAD,
  ETIQUETA_CANTIDAD_CORRECTA,
  ETIQUETA_MOTIVO_CANTIDAD,
  MOTIVO_CANTIDAD_MAX,
  PLACEHOLDER_MOTIVO_CANTIDAD,
  TITULO_CORREGIR_CANTIDAD,
  estadoCantidad,
  mensajeErrorCantidad,
  toastCantidadCorregida,
} from "@/lib/admin/inventario-cantidad";

/** Lo mínimo (serializable) de la ENTRADA cuya cantidad se corrige. */
export interface MovimientoCantidadEditable {
  id: string;
  itemId: string;
  itemNombre: string;
  fecha_movimiento: string;
  cantidad: number;
  unidad?: string | null;
}

interface CorregirCantidadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimiento: MovimientoCantidadEditable;
}

/**
 * «Corregir la cantidad de la entrada» (27-nov-2026, API 0.0.152): el caso
 * «por error de dedo puse 13, pero ingresaron 12». Un campo y, si se quiere,
 * el motivo. La regla (que la existencia no quede negativa en ningún punto,
 * que la entrada no nazca de una compra) es del API y su mensaje se pinta tal
 * cual; el panel no recalcula existencias. Se monta con `key` por movimiento:
 * cada apertura arranca en blanco.
 */
export function CorregirCantidadDialog({ open, onOpenChange, movimiento }: CorregirCantidadDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [rechazo, setRechazo] = useState<string | null>(null);

  const estado = estadoCantidad(texto, movimiento.cantidad);

  const guardar = () => {
    if (estado.numero == null) return;
    const cantidad = estado.numero;
    setRechazo(null);
    startTransition(async () => {
      const result = await corregirCantidadMovimientoAction(movimiento.itemId, movimiento.id, {
        cantidad,
        motivo,
      });
      if (result.ok) {
        toast.success(toastCantidadCorregida(result.data ?? {}, movimiento.unidad));
        onOpenChange(false);
        router.refresh();
        return;
      }
      // El motivo del rechazo se queda EN el diálogo (dice qué hacer): un
      // toast que se va solo dejaría al operador sin la respuesta.
      setRechazo(mensajeErrorCantidad(result));
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITULO_CORREGIR_CANTIDAD}</DialogTitle>
          <DialogDescription>
            {movimiento.itemNombre} · entrada del {fmtDateOnly(movimiento.fecha_movimiento)}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" data-cantidad-actual>
            Cantidad registrada:{" "}
            <span className="font-semibold tabular-nums">
              {cantidadConUnidad(movimiento.cantidad, movimiento.unidad)}
            </span>
          </p>

          <Field label={ETIQUETA_CANTIDAD_CORRECTA} required error={estado.error ?? undefined}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setRechazo(null);
              }}
              className="w-40"
            />
          </Field>

          <Field label={ETIQUETA_MOTIVO_CANTIDAD}>
            <Input
              value={motivo}
              maxLength={MOTIVO_CANTIDAD_MAX}
              placeholder={PLACEHOLDER_MOTIVO_CANTIDAD}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>

          <p className="text-xs text-muted-foreground">{AYUDA_CORREGIR_CANTIDAD}</p>

          {rechazo && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
              data-rechazo-cantidad
            >
              {rechazo}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || estado.numero == null}>
              {pending ? "Guardando…" : "Guardar cantidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
