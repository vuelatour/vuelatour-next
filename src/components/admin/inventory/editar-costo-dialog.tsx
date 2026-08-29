"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { updateMovimientoCostoAction } from "@/app/admin/inventory/actions";
import type { EditarCostoFormValues } from "@/app/admin/inventory/schema";
import { Field } from "@/components/admin/form-field";
import { fmtDateOnly } from "@/lib/datetime";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

/**
 * Lo mínimo (serializable) de una ENTRADA para corregir su costo — sirve
 * igual desde el cardex del ítem que desde la lista de pendientes de costo.
 */
export interface MovimientoCostoEditable {
  id: string;
  itemId: string;
  itemNombre: string;
  fecha_movimiento: string;
  cantidad: number;
  referencia: string | null;
  moneda?: "MXN" | "USD";
  costo_unitario_usd: number;
  costo_unitario_mxn?: number | null;
  tc_usd_mxn?: number | null;
  unidad?: string | null;
}

interface EditarCostoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ENTRADA a corregir (null = diálogo cerrado sin selección). */
  movimiento: MovimientoCostoEditable | null;
}

/**
 * Corrige el COSTO de una ENTRADA de cardex (la carga masiva dejó entradas a
 * $0 y el cliente las completa con el precio real). SOLO moneda/costo/TC —
 * cantidad, fecha y tipo jamás. Espejo del bloque de captura de costo del
 * MovimientoDialog para que el operador vea siempre el mismo flujo.
 */
export function EditarCostoDialog({ open, onOpenChange, movimiento }: EditarCostoDialogProps) {
  const [pending, startTransition] = useTransition();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<EditarCostoFormValues>({ defaultValues: defaults(movimiento) });

  useEffect(() => {
    if (open) reset(defaults(movimiento));
  }, [open, reset, movimiento]);

  const moneda = watch("moneda");

  const onSubmit = handleSubmit((values) => {
    if (!movimiento) return;
    startTransition(async () => {
      const result = await updateMovimientoCostoAction(movimiento.itemId, movimiento.id, values);
      if (result.ok) {
        toast.success("Costo actualizado · el valorizado del ítem ya lo refleja");
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        // Los 409 del API ya explican el porqué (nace de compra / capa consumida).
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  const etiquetaUnidad = movimiento?.unidad?.trim() ? movimiento.unidad.trim() : "unidades";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Completar costo de la entrada</DialogTitle>
          <DialogDescription>{movimiento?.itemNombre ?? ""}</DialogDescription>
        </DialogHeader>

        {movimiento && (
          <p className="text-sm text-muted-foreground -mt-2">
            Entrada del {fmtDateOnly(movimiento.fecha_movimiento)} ·{" "}
            {num(movimiento.cantidad)} {etiquetaUnidad}
            {movimiento.referencia ? (
              <>
                {" "}· ref <span className="font-mono text-xs">{movimiento.referencia}</span>
              </>
            ) : null}
            . Solo se corrige el costo; la cantidad y la fecha no cambian.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Costo unitario"
            required
            hint={`Por ${etiquetaUnidad.replace(/s$/, "")}, en la moneda en que se compró`}
            error={
              moneda === "MXN"
                ? errors.costo_unitario_mxn?.message
                : errors.costo_unitario_usd?.message
            }
          >
            <div className="flex gap-2">
              <select
                value={moneda}
                onChange={(e) => setValue("moneda", e.target.value as EditarCostoFormValues["moneda"])}
                className="h-9 w-20 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
              {moneda === "MXN" ? (
                <Input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  placeholder="0.00"
                  {...register("costo_unitario_mxn")}
                />
              ) : (
                <Input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  placeholder="0.00"
                  {...register("costo_unitario_usd")}
                />
              )}
            </div>
          </Field>

          {/* Con captura en pesos, el TC de la compra convierte a USD (la
              contabilidad del inventario y el balance corren en dólares). */}
          {moneda === "MXN" && (
            <Field
              label="Tipo de cambio (MXN por USD)"
              required
              hint="El de la compra (estado de cuenta / factura). El costo se convierte a USD para el balance."
              error={errors.tc_usd_mxn?.message}
            >
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="Ej. 18.50"
                  className="w-32"
                  {...register("tc_usd_mxn")}
                />
                {Number(watch("costo_unitario_mxn")) > 0 && Number(watch("tc_usd_mxn")) > 0 && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ≈ ${(Number(watch("costo_unitario_mxn")) / Number(watch("tc_usd_mxn"))).toFixed(2)} USD c/u
                  </span>
                )}
              </div>
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !movimiento}>
              {pending ? "Guardando…" : "Guardar costo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaults(m: MovimientoCostoEditable | null): EditarCostoFormValues {
  if (!m) {
    return { moneda: "MXN", costo_unitario_usd: "", costo_unitario_mxn: "", tc_usd_mxn: "" };
  }
  // Sin costo real (la carga masiva quedó en $0): arranca en MXN (moneda
  // operativa del cliente) con el campo vacío para forzar la captura.
  if (!(Number(m.costo_unitario_usd) > 0)) {
    return {
      moneda: "MXN",
      costo_unitario_usd: "",
      costo_unitario_mxn: "",
      tc_usd_mxn: m.tc_usd_mxn ? String(m.tc_usd_mxn) : "",
    };
  }
  // Con costo: se prellena tal como se capturó, en su moneda (mismo criterio
  // que el API: es MXN solo si además trae los pesos capturados).
  return {
    moneda: m.moneda === "MXN" && m.costo_unitario_mxn != null ? "MXN" : "USD",
    costo_unitario_usd: Number(m.costo_unitario_usd) > 0 ? String(m.costo_unitario_usd) : "",
    costo_unitario_mxn: m.costo_unitario_mxn != null ? String(m.costo_unitario_mxn) : "",
    tc_usd_mxn: m.tc_usd_mxn ? String(m.tc_usd_mxn) : "",
  };
}
