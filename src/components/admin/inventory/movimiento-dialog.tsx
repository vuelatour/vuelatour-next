"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createMovimientoAction } from "@/app/admin/inventory/actions";
import { montoTxt } from "@/lib/admin/inventario-eliminar";
import {
  ETIQUETA_A_COSTO,
  HINT_A_COSTO,
  HINT_PARA_FLOTA,
  PLACEHOLDER_A_COSTO,
  hintAvionSalida,
  hintVentaSalida,
  placeholderVenta,
  textoSalidaRegistrada,
  ventaDelFormulario,
} from "@/lib/admin/inventario-salida";
import {
  HINT_TC_OPCIONAL,
  NOTA_TC_USD,
  tcQueViaja,
  textoAvisoSalida,
} from "@/lib/admin/inventario-ficha";
import {
  BOTON_CAPTURAR_COSTO,
  BOTON_REGISTRAR_SIN_COSTO,
  HINT_COSTO_ENTRADA_PENDIENTE,
  TITULO_CONFIRMAR_SIN_COSTO,
  clasificarCostoEntrada,
  textoConfirmarEntradaSinCosto,
  textoEntradaRegistradaSinCosto,
} from "@/lib/admin/inventario-entrada-inicial";
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
  /**
   * Margen de la tienda (% sobre el último precio de compra) SOLO para los
   * textos («Vacío = último precio de compra + 25 %»); ausente ⇒ 25. El
   * número real lo aplica el API al registrar la salida.
   */
  margenVentaPct?: number | null;
  /**
   * ¿El producto ya tiene una compra con costo (último precio vigente)? Solo
   * para el texto de la confirmación de una ENTRADA sin costo (28-sep-2026):
   * `undefined` = no se sabe (API previo) ⇒ el texto cubre los dos casos.
   */
  tieneCostoVigente?: boolean;
}

/** Entrada sin costo esperando confirmación: el cuerpo YA armado (USD 0). */
interface EntradaSinCostoPendiente {
  cuerpo: Record<string, unknown>;
  cantidad: number;
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
  margenVentaPct,
  tieneCostoVigente,
}: MovimientoDialogProps) {
  const [pending, startTransition] = useTransition();
  // ENTRADA con el costo vacío o en 0 (28-sep-2026, revisión adversaria):
  // antes un «0» tecleado registraba la entrada SIN costo en silencio. Ahora
  // se pregunta, igual que en el alta del producto. Abierta/cerrada va aparte
  // del cuerpo (el texto se queda durante la animación de salida y un doble
  // clic no registra dos veces).
  const [sinCosto, setSinCosto] = useState<EntradaSinCostoPendiente | null>(null);
  const [sinCostoAbierto, setSinCostoAbierto] = useState(false);
  const irAlCostoRef = useRef(false);
  const costoInputRef = useRef<HTMLInputElement | null>(null);
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
    if (!open) return;
    reset(defaults(initialTipo, preseleccionado, precioVenta, precioVentaMoneda));
    setSinCosto(null);
    setSinCostoAbierto(false);
  }, [open, reset, initialTipo, preseleccionado, precioVenta, precioVentaMoneda]);

  const tipo = watch("tipo");
  const esSalida = tipo === "SALIDA";
  const aCosto = watch("a_costo") === true;
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
    // VENTA (25-sep-2026, `ventaDelFormulario`): solo en SALIDA. Vacío ⇒ NO
    // viaja (el API aplica el precio del producto o el último precio de
    // compra + margen de la tienda); «Cargar a costo» ⇒ 0 explícito. Antes el
    // vacío viajaba como 0 y, con el margen, dejaría toda salida del panel a
    // costo (sin utilidad).
    const { venta_unitaria: _v, venta_moneda: _m, a_costo: _c, ...sinVenta } = payload;
    void _v;
    void _m;
    void _c;
    const cuerpo: Record<string, unknown> = {
      ...sinVenta,
      // El T.C. solo viaja si su campo estaba a la vista (pesos): en dólares
      // lo pone el API con el oficial del día (`tcQueViaja`).
      tc_usd_mxn: tcQueViaja({ tipo: values.tipo, moneda: values.moneda, tc: values.tc_usd_mxn }),
      ...ventaDelFormulario({
        tipo: values.tipo,
        venta: values.venta_unitaria,
        aCosto: values.a_costo,
        moneda: values.venta_moneda,
      }),
    };
    const matricula = aircraft.find((a) => a.id === values.aeronave_id)?.matricula ?? null;

    // ENTRADA sin costo = decisión EXPLÍCITA (misma regla que el alta,
    // `clasificarCostoEntrada`): vacío o 0 ⇒ se PREGUNTA y viaja como USD 0
    // (sin pesos ni T.C.); un costo tan chico que se guardaría en $0 es error.
    if (values.tipo === "ENTRADA") {
      const moneda = values.moneda === "USD" ? "USD" : "MXN";
      const costo = clasificarCostoEntrada({
        costo: moneda === "MXN" ? values.costo_unitario_mxn : values.costo_unitario_usd,
        moneda,
        tc: values.tc_usd_mxn,
      });
      if (costo.tipo === "ERROR") {
        toast.error(costo.mensaje);
        return;
      }
      const cantidad = Number(cuerpo.cantidad);
      if (costo.tipo === "PENDIENTE" && cantidad > 0) {
        setSinCosto({
          cuerpo: {
            ...cuerpo,
            moneda: "USD",
            costo_unitario_usd: 0,
            costo_unitario_mxn: "",
            tc_usd_mxn: undefined,
          },
          cantidad,
        });
        setSinCostoAbierto(true);
        return;
      }
    }
    registrar(cuerpo, { matricula, paraFlota: values.para_flota === true });
  });

  const registrar = (
    cuerpo: Record<string, unknown>,
    ctx: { matricula: string | null; paraFlota: boolean; cantidadSinCosto?: number },
  ) => {
    startTransition(async () => {
      const result = await createMovimientoAction(itemId, cuerpo);
      if (result.ok) {
        toast.success(
          ctx.cantidadSinCosto != null
            ? textoEntradaRegistradaSinCosto(ctx.cantidadSinCosto)
            : esSalida && result.data
              ? textoSalidaRegistrada(result.data, ctx.paraFlota ? null : ctx.matricula)
              : "Movimiento registrado",
        );
        // API 0.0.36: la salida salió a $0 porque el producto no tiene
        // ninguna compra con costo — se dice, no se calla.
        const aviso = textoAvisoSalida(result.data?.aviso, result.data?.aviso_mensaje);
        if (aviso) toast.warning(aviso, { duration: 10000 });
        // El API avisa cuando NO pudo revertir todo el cargo de una
        // devolución (caso típico: la salida era «para todas las
        // matrículas» y generó un gasto por avión). Callarlo dejaría un
        // costo cargado a los aviones sin que nadie se entere.
        const pendiente = result.data?.reversion_pendiente;
        if (pendiente && pendiente.sin_revertir > 0) {
          toast.warning(
            `Quedaron ${montoTxt(pendiente.sin_revertir, pendiente.moneda)} sin revertir` +
              `${pendiente.gastos_sin_tc > 0 ? ` (${pendiente.gastos_sin_tc} gasto(s) sin tipo de cambio)` : ""}` +
              ": ajústalo en Gastos.",
            { duration: 10000 },
          );
        }
        onOpenChange(false);
      } else if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        const firstError = result.fieldErrors[firstField]?.[0] ?? "Validación falló";
        toast.error(`${firstField}: ${firstError}`);
      } else {
        toast.error(result.error ?? "Error desconocido");
      }
    });
  };

  const esEntrada = tipo === "ENTRADA";
  const costoMxnReg = register("costo_unitario_mxn");
  const costoUsdReg = register("costo_unitario_usd");

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
                hint={aCosto ? HINT_A_COSTO : hintVentaSalida(margenVentaPct)}
                error={errors.venta_unitaria?.message}
              >
                <div className="flex gap-2">
                  <select
                    value={watch("venta_moneda")}
                    onChange={(e) =>
                      setValue("venta_moneda", e.target.value as MovimientoFormValues["venta_moneda"])
                    }
                    disabled={aCosto}
                    aria-label="Moneda del precio de venta"
                    className="h-9 w-20 shrink-0 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-default disabled:opacity-50 dark:bg-input/30"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    disabled={aCosto}
                    placeholder={
                      aCosto
                        ? PLACEHOLDER_A_COSTO
                        : placeholderVenta({ precioProducto: precioVenta, margenPct: margenVentaPct })
                    }
                    {...register("venta_unitaria")}
                  />
                </div>
              </Field>
            ) : (
              <Field
                label="Costo unitario"
                // ENTRADA: vacío = costo PENDIENTE (se confirma); devolución y
                // ajuste lo siguen exigiendo.
                required={!esEntrada}
                hint={
                  [
                    empaque ? `Por ${etiquetaUnidad.replace(/s$/, "")} suelta, NO por caja.` : null,
                    esEntrada ? HINT_COSTO_ENTRADA_PENDIENTE : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
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
                    className="h-9 w-20 shrink-0 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                  {watch("moneda") === "MXN" ? (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      {...costoMxnReg}
                      ref={(el) => {
                        costoMxnReg.ref(el);
                        costoInputRef.current = el;
                      }}
                    />
                  ) : (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      {...costoUsdReg}
                      ref={(el) => {
                        costoUsdReg.ref(el);
                        costoInputRef.current = el;
                      }}
                    />
                  )}
                </div>
              </Field>
            )}
          </div>

          {/* T.C. OPCIONAL (API 0.0.36, 25-sep-2026): vacío = el T.C. oficial
              del día de la compra, el mismo de las cotizaciones. En dólares
              no se captura: se convierte solo con ese T.C. */}
          {!esSalida && watch("moneda") === "MXN" && (
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
          )}
          {!esSalida && watch("moneda") === "USD" && (
            <p className="-mt-2 text-xs text-muted-foreground">{NOTA_TC_USD}</p>
          )}

          {esSalida && (
            <>
              {/* Salida SIN utilidad (25-sep-2026): el avión paga solo el costo
                  (último precio de compra). Viaja como `venta_unitaria: 0`
                  explícito. */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={aCosto}
                  onChange={(e) => setValue("a_costo", e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                />
                <span>{ETIQUETA_A_COSTO}</span>
              </label>
              {/* Aceites/consumibles de flota: el cargo (precio o costo +
                  margen) se prorratea en partes iguales entre los aviones
                  activos (un gasto por avión). */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={watch("para_flota") ?? false}
                  onChange={(e) => {
                    setValue("para_flota", e.target.checked);
                    if (e.target.checked) setValue("aeronave_id", "");
                  }}
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                />
                <span>
                  Para todas las matrículas{" "}
                  <span className="text-xs text-muted-foreground">{HINT_PARA_FLOTA}</span>
                </span>
              </label>
              {!watch("para_flota") && (
                <Field
                  label="Avión (se le carga la pieza)"
                  required
                  hint={hintAvionSalida(margenVentaPct)}
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

        {/* ENTRADA sin costo: nada se registra hasta elegir (anidado en el
            diálogo del movimiento: Esc cierra solo esta confirmación). */}
        <AlertDialog
          open={sinCostoAbierto && sinCosto !== null}
          onOpenChange={(o) => {
            if (!o) setSinCostoAbierto(false);
          }}
        >
          <AlertDialogContent
            finalFocus={() => {
              const irAlCosto = irAlCostoRef.current;
              irAlCostoRef.current = false;
              return irAlCosto ? costoInputRef.current : true;
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{TITULO_CONFIRMAR_SIN_COSTO}</AlertDialogTitle>
              <AlertDialogDescription>
                {sinCosto
                  ? textoConfirmarEntradaSinCosto(sinCosto.cantidad, {
                      conPrecioVenta: Number(precioVenta) > 0,
                      tieneCostoVigente,
                    })
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="cursor-pointer"
                onClick={() => {
                  irAlCostoRef.current = true;
                }}
              >
                {BOTON_CAPTURAR_COSTO}
              </AlertDialogCancel>
              <AlertDialogAction
                className="cursor-pointer"
                disabled={pending}
                onClick={() => {
                  const pendiente = sinCostoAbierto ? sinCosto : null;
                  setSinCostoAbierto(false);
                  if (pendiente) {
                    registrar(pendiente.cuerpo, {
                      matricula: null,
                      paraFlota: false,
                      cantidadSinCosto: pendiente.cantidad,
                    });
                  }
                }}
              >
                {BOTON_REGISTRAR_SIN_COSTO}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
    // este precio (editable). Vacío = el API aplica el precio del producto o
    // el último precio de compra + margen de la tienda; «a costo» es la
    // casilla de abajo.
    venta_unitaria: precioVenta != null && precioVenta > 0 ? String(precioVenta) : "",
    venta_moneda: precioVentaMoneda ?? "MXN",
    a_costo: false,
    aeronave_id: "",
    proveedor_id: "",
    fecha_movimiento: "",
    referencia: "",
    notas: "",
  };
}
