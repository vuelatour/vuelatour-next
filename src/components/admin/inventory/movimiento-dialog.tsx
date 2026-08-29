"use client";

import { useEffect, useMemo, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createMovimientoAction } from "@/app/admin/inventory/actions";
import type { MovimientoFormValues } from "@/app/admin/inventory/schema";
import { Field } from "@/components/admin/form-field";
import type { InventarioEmpaque } from "@/types/inventory";

const TIPOS = [
  { value: "ENTRADA", label: "Entrada (compra / alta de stock)" },
  { value: "SALIDA", label: "Salida (consumo, se carga a un avión)" },
  { value: "DEVOLUCION", label: "Devolución (regresa a bodega)" },
  { value: "AJUSTE", label: "Ajuste / merma (corrección o desecho)" },
];

/** Valor del selector "Capturar por" cuando se captura en unidades. */
const POR_UNIDADES = "UNIDADES";

const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
const round2 = (n: number) => Math.round(n * 100) / 100;

interface MovimientoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemNombre: string;
  /** Unidad de medida del ítem (pieza, botella…) para las leyendas. */
  unidad?: string | null;
  /** Precio de venta del ítem: prellenado del cargo al avión en SALIDA. */
  precioVenta?: number | null;
  precioVentaMoneda?: "MXN" | "USD" | null;
  /** Empaques (cajas) del ítem: habilitan "Capturar por caja". */
  empaques?: InventarioEmpaque[];
  aircraft: { id: string; matricula: string }[];
  providers: { id: string; nombre: string }[];
  /** Tipo preseleccionado al abrir (ej. SALIDA desde el listado). */
  initialTipo?: MovimientoFormValues["tipo"];
  /** Empaque preseleccionado (se escaneó el código de la caja). */
  initialEmpaqueId?: string;
}

export function MovimientoDialog({
  open,
  onOpenChange,
  itemId,
  itemNombre,
  unidad,
  precioVenta,
  precioVentaMoneda,
  empaques,
  aircraft,
  providers,
  initialTipo,
  initialEmpaqueId,
}: MovimientoDialogProps) {
  const [pending, startTransition] = useTransition();
  // Solo empaques activos se pueden usar para capturar; si el preseleccionado
  // (escaneado) está inactivo, se ofrece igual para no perder la lectura.
  const empaquesUsables = useMemo(
    () => (empaques ?? []).filter((e) => e.activo || e.id === initialEmpaqueId),
    [empaques, initialEmpaqueId],
  );
  const conEmpaques = empaquesUsables.length > 0;
  // String estable (no el array): `empaques` puede venir como [] nuevo en
  // cada render y un reset por render borraría lo que teclea el operador.
  const preseleccionado =
    initialEmpaqueId && empaquesUsables.some((e) => e.id === initialEmpaqueId)
      ? initialEmpaqueId
      : "";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MovimientoFormValues>({
    defaultValues: defaults(initialTipo, preseleccionado, precioVenta, precioVentaMoneda),
  });

  useEffect(() => {
    if (open) reset(defaults(initialTipo, preseleccionado, precioVenta, precioVentaMoneda));
  }, [open, reset, initialTipo, preseleccionado, precioVenta, precioVentaMoneda]);

  const tipo = watch("tipo");
  const esSalida = tipo === "SALIDA";
  const empaqueId = watch("empaque_id");
  const empaque = empaquesUsables.find((e) => e.id === empaqueId) ?? null;
  const cantidadEmpaques = Number(watch("cantidad_empaques"));
  const unidadesCalc =
    empaque && cantidadEmpaques > 0 ? round2(cantidadEmpaques * Number(empaque.factor)) : 0;
  const etiquetaUnidad = unidad?.trim() ? unidad.trim() : "unidades";

  const onSubmit = handleSubmit((values) => {
    // Por empaque: la cantidad en UNIDADES (fuente única del cardex) se
    // deriva aquí y viaja junto con empaque_id + cantidad_empaques; el API
    // vuelve a calcularla y valida que coincidan.
    let payload: MovimientoFormValues = values;
    if (empaque) {
      if (!(cantidadEmpaques > 0)) {
        toast.error(`Captura cuántos «${empaque.nombre}» ${esSalida ? "salen" : "entran"}.`);
        return;
      }
      payload = { ...values, cantidad: String(unidadesCalc) };
    } else {
      payload = { ...values, empaque_id: "", cantidad_empaques: "" };
    }
    // La venta solo aplica en SALIDA: en otros tipos el campo ni se ve y no
    // debe viajar (jamás mezclarla con costo_unitario_*).
    if (!esSalida) {
      payload = { ...payload, venta_unitaria: "" };
    } else if (String(payload.venta_unitaria ?? "").trim() === "") {
      // El campo viene PRELLENADO con el precio del ítem: vaciarlo es una
      // decisión ("esta salida va a costo FIFO") y viaja como 0 explícito —
      // sin él, el API re-aplicaría el precio del ítem.
      payload = { ...payload, venta_unitaria: "0" };
    }
    startTransition(async () => {
      const result = await createMovimientoAction(itemId, payload);
      if (result.ok) {
        const conGasto = (result.data as { gasto_generado?: unknown } | undefined)
          ?.gasto_generado;
        const prorrateado = (conGasto as { prorrateado?: boolean } | null)?.prorrateado;
        toast.success(
          prorrateado
            ? "Salida registrada · el costo se prorrateó entre toda la flota"
            : conGasto
              ? "Salida registrada · el costo se cargó como gasto del avión"
              : "Movimiento registrado",
        );
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimiento de cardex</DialogTitle>
          <DialogDescription>{itemNombre}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Tipo" required>
            <SearchableSelect
              options={TIPOS}
              value={tipo}
              onChange={(v) => setValue("tipo", v as MovimientoFormValues["tipo"])}
              placeholder="Tipo de movimiento"
            />
          </Field>

          {/* Captura por caja: el operador teclea cuántas cajas y el sistema
              rebaja/suma las unidades (caja de 6 × 2 = 12). */}
          {conEmpaques && (
            <Field
              label="Capturar por"
              hint="Por unidad suelta o por caja completa (se convierte a unidades)"
            >
              <SearchableSelect
                options={[
                  { value: POR_UNIDADES, label: `Unidades (${etiquetaUnidad})` },
                  ...empaquesUsables.map((e) => ({
                    value: e.id,
                    label: `${e.nombre}${e.activo ? "" : " (inactivo)"}`,
                    description: `${num(Number(e.factor))} ${etiquetaUnidad} por empaque`,
                  })),
                ]}
                value={empaqueId || POR_UNIDADES}
                onChange={(v) => {
                  setValue("empaque_id", v === POR_UNIDADES ? "" : v);
                  if (v === POR_UNIDADES) setValue("cantidad_empaques", "");
                }}
                placeholder="Unidades o caja"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            {empaque ? (
              <Field
                label={`Cantidad de ${empaque.nombre.toLowerCase()}`}
                required
                hint={
                  cantidadEmpaques > 0
                    ? `= ${num(unidadesCalc)} ${etiquetaUnidad}`
                    : `1 = ${num(Number(empaque.factor))} ${etiquetaUnidad}`
                }
                error={errors.cantidad_empaques?.message ?? errors.cantidad?.message}
              >
                <Input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  {...register("cantidad_empaques", { required: "Requerido" })}
                />
              </Field>
            ) : (
              <Field
                label={`Cantidad (${etiquetaUnidad})`}
                required
                error={errors.cantidad?.message}
              >
                <Input type="number" step="any" min="0" {...register("cantidad", { required: "Requerido" })} />
              </Field>
            )}
            {esSalida ? (
              <Field
                label="Precio de venta unitario"
                hint="El avión paga este precio; el costo FIFO queda para el inventario"
                error={errors.venta_unitaria?.message}
              >
                <div className="flex gap-2">
                  <select
                    value={watch("venta_moneda")}
                    onChange={(e) =>
                      setValue("venta_moneda", e.target.value as MovimientoFormValues["venta_moneda"])
                    }
                    className="h-9 w-20 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Vacío = a costo FIFO"
                    {...register("venta_unitaria")}
                  />
                </div>
              </Field>
            ) : (
              <Field
                label="Costo unitario"
                required
                hint={empaque ? `Por ${etiquetaUnidad.replace(/s$/, "")} suelta, NO por caja` : undefined}
                error={
                  watch("moneda") === "MXN"
                    ? errors.costo_unitario_mxn?.message
                    : errors.costo_unitario_usd?.message
                }
              >
                <div className="flex gap-2">
                  <select
                    value={watch("moneda")}
                    onChange={(e) =>
                      setValue("moneda", e.target.value as MovimientoFormValues["moneda"])
                    }
                    className="h-9 w-20 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                  {watch("moneda") === "MXN" ? (
                    <Input type="number" step="any" min="0" placeholder="0.00" {...register("costo_unitario_mxn")} />
                  ) : (
                    <Input type="number" step="any" min="0" placeholder="0.00" {...register("costo_unitario_usd")} />
                  )}
                </div>
              </Field>
            )}
          </div>

          {/* Con captura en pesos, el TC de la compra convierte a USD (la
              contabilidad del inventario y el balance corren en dólares). */}
          {!esSalida && watch("moneda") === "MXN" && (
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

          {esSalida && (
            <>
              {/* Aceites/consumibles de flota: el costo FIFO se prorratea en
                  partes iguales entre los aviones activos (un gasto por avión). */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={watch("para_flota") ?? false}
                  onChange={(e) => {
                    setValue("para_flota", e.target.checked);
                    if (e.target.checked) setValue("aeronave_id", "");
                  }}
                  className="h-4 w-4 accent-brand-600"
                />
                <span>
                  Para todas las matrículas{" "}
                  <span className="text-xs text-muted-foreground">
                    (el costo se reparte en partes iguales entre la flota activa)
                  </span>
                </span>
              </label>
              {!watch("para_flota") && (
                <Field
                  label="Avión (se le carga la pieza)"
                  required
                  hint="El costo FIFO se registra automáticamente como gasto de refacción del avión y sale en su reporte mensual."
                  error={errors.aeronave_id?.message}
                >
                  <SearchableSelect
                    options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
                    value={watch("aeronave_id")}
                    onChange={(v) => setValue("aeronave_id", v)}
                    placeholder="Matrícula"
                  />
                </Field>
              )}
            </>
          )}

          {tipo === "DEVOLUCION" && (
            <Field
              label="Avión (si venía cargada a uno)"
              hint="Al elegirlo, se revierte el gasto de refacción que generó la salida."
              error={errors.aeronave_id?.message}
            >
              <SearchableSelect
                options={aircraft.map((a) => ({ value: a.id, label: a.matricula }))}
                value={watch("aeronave_id")}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Matrícula (opcional)"
              />
            </Field>
          )}

          {tipo === "ENTRADA" && (
            <Field label="Proveedor" error={errors.proveedor_id?.message}>
              <SearchableSelect
                options={providers.map((p) => ({ value: p.id, label: p.nombre }))}
                value={watch("proveedor_id")}
                onChange={(v) => setValue("proveedor_id", v)}
                placeholder="De dónde vino"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" error={errors.fecha_movimiento?.message}>
              <Input type="date" {...register("fecha_movimiento")} />
            </Field>
            <Field label="Referencia" hint="No. orden / factura">
              <Input {...register("referencia")} />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea rows={2} {...register("notas")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando…" : "Registrar movimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function defaults(
  tipo: MovimientoFormValues["tipo"] = "ENTRADA",
  empaqueId = "",
  precioVenta?: number | null,
  precioVentaMoneda?: "MXN" | "USD" | null,
): MovimientoFormValues {
  return {
    tipo,
    cantidad: "",
    empaque_id: empaqueId,
    cantidad_empaques: "",
    para_flota: false,
    // Pesos por default: es la moneda operativa del cliente (USD para
    // compras tipo Aircraft Spruce).
    moneda: "MXN",
    costo_unitario_usd: "",
    costo_unitario_mxn: "",
    tc_usd_mxn: "",
    // Prellenado con el precio de venta del ítem: en SALIDA el avión paga
    // este precio (editable); vacío = la salida se carga a costo FIFO.
    venta_unitaria: precioVenta != null && precioVenta > 0 ? String(precioVenta) : "",
    venta_moneda: precioVentaMoneda ?? "MXN",
    aeronave_id: "",
    proveedor_id: "",
    fecha_movimiento: "",
    referencia: "",
    notas: "",
  };
}
