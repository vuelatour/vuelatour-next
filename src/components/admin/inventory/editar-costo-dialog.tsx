"use client";

import { useEffect, useState, useTransition } from "react";
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
import {
  HINT_TC_OPCIONAL,
  NOTA_TC_USD,
  TITULO_EDITAR_COSTO,
  TOAST_COSTO_ACTUALIZADO,
  confirmacionDeConflicto,
  decidirGuardarCosto,
  tcQueViaja,
  type ConfirmacionCosto,
} from "@/lib/admin/inventario-ficha";
import { AvisoSalidasCosto } from "./aviso-salidas-costo";

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
  /**
   * API 0.0.36 (del detalle del ítem): cuántas SALIDAS ya se cobraron con el
   * precio de esta compra y cuántas de ellas salieron a $0 SIN cargo. Con
   * alguna, el primer «Guardar» NO envía: primero se avisa. Ausentes (lista
   * de pendientes o API previo) = no se sabe; si el API encuentra salidas
   * responde 409 `ENTRADA_CON_SALIDAS` y se abre el MISMO aviso con la lista.
   */
  salidasConEstePrecio?: number;
  salidasSinCargo?: number;
}

interface EditarCostoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ENTRADA a corregir (null = diálogo cerrado sin selección). */
  movimiento: MovimientoCostoEditable | null;
}

/**
 * «Corregir el costo de la compra»: el COSTO de una ENTRADA de cardex (la
 * carga masiva dejó entradas a $0 y el cliente las completa con el precio
 * real). SOLO moneda/costo/TC — cantidad, fecha y tipo jamás.
 *
 * Desde el API 0.0.36 el costo del producto es su ÚLTIMO PRECIO DE COMPRA y
 * cada salida guarda el costo con que se cobró: corregir una compra cambia
 * el valorizado y las SIGUIENTES salidas, nunca lo ya cobrado. Si ese precio
 * ya se usó (D7), el primer «Guardar» no envía: muestra el recuadro ámbar y
 * «Guardar de todos modos» reenvía con `confirmar_salidas: true`. Un 409
 * `ENTRADA_CON_SALIDAS` (dato viejo) abre el MISMO recuadro con la lista.
 */
export function EditarCostoDialog({ open, onOpenChange, movimiento }: EditarCostoDialogProps) {
  const [pending, startTransition] = useTransition();
  // Recuadro de salidas que ya usaron este precio (null = no se muestra).
  const [confirmacion, setConfirmacion] = useState<ConfirmacionCosto | null>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<EditarCostoFormValues>({ defaultValues: defaults(movimiento) });

  useEffect(() => {
    if (open) {
      reset(defaults(movimiento));
      setConfirmacion(null);
    }
  }, [open, reset, movimiento]);

  const moneda = watch("moneda");

  const enviar = (values: EditarCostoFormValues, confirmarSalidas: boolean) => {
    if (!movimiento) return;
    // El T.C. solo viaja si su campo estaba a la vista (pesos): en dólares el
    // API conserva el de la fila o pone el oficial del día (`tcQueViaja`).
    const cuerpo: EditarCostoFormValues = {
      ...values,
      tc_usd_mxn: tcQueViaja({ moneda: values.moneda, tc: values.tc_usd_mxn }),
    };
    startTransition(async () => {
      const result = await updateMovimientoCostoAction(movimiento.itemId, movimiento.id, cuerpo, {
        confirmarSalidas,
      });
      if (result.ok) {
        toast.success(TOAST_COSTO_ACTUALIZADO);
        onOpenChange(false);
        return;
      }
      if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
        return;
      }
      // 409 ENTRADA_CON_SALIDAS: el detalle venía viejo (o es la lista de
      // pendientes, que no trae conteos): el MISMO recuadro, con la lista.
      const conflicto = confirmacionDeConflicto(result);
      if (conflicto) {
        setConfirmacion(conflicto);
        return;
      }
      // Los demás 409/400 del API ya explican el porqué (nace de compra…).
      toast.error(result.error ?? "Error desconocido");
    });
  };

  // Primer «Guardar»: con salidas que ya usaron este precio NO se envía.
  const onSubmit = handleSubmit((values) => {
    if (!movimiento) return;
    const d = decidirGuardarCosto({
      salidasConEstePrecio: movimiento.salidasConEstePrecio,
      salidasSinCargo: movimiento.salidasSinCargo,
      confirmado: false,
    });
    if (d.tipo === "CONFIRMAR") {
      setConfirmacion(d.confirmacion);
      return;
    }
    enviar(values, false);
  });

  // «Guardar de todos modos» (el operador ya leyó el recuadro).
  const onConfirmar = handleSubmit((values) => enviar(values, true));

  const etiquetaUnidad = movimiento?.unidad?.trim() ? movimiento.unidad.trim() : "unidades";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITULO_EDITAR_COSTO}</DialogTitle>
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
            . Solo se corrige el costo; la cantidad y la fecha no cambian. Lo ya cobrado a
            los aviones no se mueve.
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
                aria-label="Moneda de la compra"
                className="h-9 w-20 shrink-0 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
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

          {/* T.C. OPCIONAL (API 0.0.36): vacío = el T.C. oficial del día de la
              compra, el mismo de las cotizaciones. En dólares no se captura:
              se convierte solo con ese T.C. */}
          {moneda === "MXN" ? (
            <Field
              label="Tipo de cambio (MXN por USD)"
              hint={HINT_TC_OPCIONAL}
              error={errors.tc_usd_mxn?.message}
            >
              <Input
                type="number"
                step="0.0001"
                min="0"
                placeholder="Oficial del día"
                className="w-40"
                {...register("tc_usd_mxn")}
              />
            </Field>
          ) : (
            <p className="-mt-2 text-xs text-muted-foreground">{NOTA_TC_USD}</p>
          )}

          {confirmacion && (
            <AvisoSalidasCosto
              confirmacion={confirmacion}
              unidad={movimiento?.unidad}
              pending={pending}
              onConfirmar={() => void onConfirmar()}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            {/* Con el recuadro abierto, el único camino es «Guardar de todos
                modos» (ya leyó qué pasa con las salidas). */}
            {!confirmacion && (
              <Button type="submit" disabled={pending || !movimiento}>
                {pending ? "Guardando…" : "Guardar costo"}
              </Button>
            )}
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
