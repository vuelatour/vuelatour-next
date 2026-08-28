"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cancunInputToIso } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { fmtDecimal, fmtMxn, fmtUsd } from "@/lib/format";
import {
  CUENTAS_COBRO,
  CUENTAS_COBRO_VALUES,
  monedaDeCuenta,
} from "@/lib/admin/cobros";
import { registerCobroAction } from "@/app/admin/flights/actions";
import type { MetodoPago } from "@/types/quote";
import { Field } from "@/components/admin/form-field";

type Moneda = "USD" | "MXN";

const METODOS: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "CHEQUE", label: "Cheque", hint: "Con factura · lo deposita oficina" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Terminal · sin factura" },
  { value: "EFECTIVO", label: "Efectivo (MXN)", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares en mano", hint: "Sin IVA" },
  // Método manual (solo oficina): descríbelo en referencia/notas.
  { value: "OTRO", label: "Otro", hint: "Método manual · descríbelo en la referencia" },
];

/** Métodos que tocan banco: solo en ellos se pregunta a qué cuenta llegó. */
const METODOS_CON_CUENTA: MetodoPago[] = ["TRANSFERENCIA", "HSBC_LINK", "CHEQUE"];

const CobroFormSchema = z
  .object({
    monto: z.coerce.number().positive("Monto debe ser > 0"),
    moneda: z.enum(["USD", "MXN"]),
    metodo_cobro: z.enum([
      "TRANSFERENCIA",
      "HSBC_LINK",
      "CHEQUE",
      "BILLPOCKET",
      "EFECTIVO",
      "DOLARES",
      "OTRO",
    ]),
    tc_usd_mxn: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    // % que retiene el banco (terminal/transferencia): el banco deposita
    // monto − comisión; sin esto el reporte no cuadra con el estado de cuenta.
    comision_banco_pct: z
      .union([
        z.coerce
          .number()
          .min(0, "No puede ser negativa")
          .max(20, "Máximo 20%"),
        z.literal(""),
      ])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    // Alternativa por MONTO directo (el estado de cuenta trae pesos, no %):
    // si se llena, manda sobre el % y el % se deriva como referencia.
    comision_banco_monto: z
      .union([z.coerce.number().min(0, "No puede ser negativa"), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    referencia: z.string().max(100).optional().or(z.literal("")),
    // Catálogo FIJO de cuentas (el API valida con @IsIn); "" = sin dato.
    cuenta_destino: z.enum(CUENTAS_COBRO_VALUES).optional().or(z.literal("")),
    fecha_cobro: z.string().optional().or(z.literal("")),
    notas: z.string().max(1000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.moneda === "MXN" && (!val.tc_usd_mxn || val.tc_usd_mxn <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tc_usd_mxn"],
        message: "TC requerido para cobros en MXN (para conciliar con total USD)",
      });
    }
  });

type CobroFormValues = z.input<typeof CobroFormSchema>;

interface CobroFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  flightFolio: number;
  /** Total USD de la cotización. */
  montoTotalUsd: number;
  /** Pendiente USD a cobrar (auto-prefills el monto). */
  pendingUsd: number;
  /** TC USD→MXN con el que se cotizó (null si la cotización no lo fijó).
      Manda como sugerencia al cobrar en MXN. */
  tcCotizacion?: number | null;
  /** TC oficial Banxico (FIX) del día: respaldo cuando la cotización no
      fijó TC. null si el API no tiene dato. */
  tcOficial?: number | null;
}

type TcSugerido = { valor: number; fuente: "cotizacion" | "oficial" };

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function defaults(pendingUsd: number): CobroFormValues {
  // Prefill útil: si hay pendiente, sugiere ese monto en USD.
  return {
    monto: pendingUsd > 0 ? Number(pendingUsd.toFixed(2)) : 0,
    moneda: "USD",
    metodo_cobro: "TRANSFERENCIA",
    tc_usd_mxn: undefined,
    comision_banco_pct: undefined,
    comision_banco_monto: undefined,
    referencia: "",
    cuenta_destino: "",
    fecha_cobro: todayLocal(),
    notas: "",
  };
}

export function CobroFormSheet({
  open,
  onOpenChange,
  flightId,
  flightFolio,
  montoTotalUsd,
  pendingUsd,
  tcCotizacion = null,
  tcOficial = null,
}: CobroFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Qué TC se prellenó (para el hint); se apaga si el usuario lo edita.
  const [tcPrefill, setTcPrefill] = useState<TcSugerido | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CobroFormValues>({
    resolver: zodResolver(CobroFormSchema),
    defaultValues: defaults(pendingUsd),
  });

  useEffect(() => {
    if (open) {
      reset(defaults(pendingUsd));
      setTcPrefill(null);
    }
  }, [open, pendingUsd, reset]);

  const moneda = watch("moneda");
  const metodo = watch("metodo_cobro");
  const monto = watch("monto");
  const tc = watch("tc_usd_mxn");
  const comisionPct = watch("comision_banco_pct");
  const comisionMontoDirecto = watch("comision_banco_monto");
  const cuentaDestino = watch("cuenta_destino");

  // TC sugerido al cobrar en MXN: el de la cotización manda (es el que el
  // cliente vio); si la cotización no lo fijó, el oficial Banxico del día.
  const tcSugerido: TcSugerido | null =
    tcCotizacion != null && tcCotizacion > 0
      ? { valor: tcCotizacion, fuente: "cotizacion" }
      : tcOficial != null && tcOficial > 0
        ? { valor: tcOficial, fuente: "oficial" }
        : null;

  // ÚNICO camino para cambiar la moneda: al pasar a MXN con el TC vacío,
  // se prellena con el sugerido (editable). Nunca pisa un TC ya tecleado.
  // Al salir de MXN el input del TC se desmonta pero RHF CONSERVA el valor:
  // se limpia SOLO si sigue siendo el prellenado (para que al volver a MXN
  // se vuelva a sugerir con su hint). Un TC tecleado a mano se conserva
  // oculto — nunca viaja en USD por el guard de onSubmit — y reaparece al
  // regresar a MXN: cambiar de moneda por error no borra lo capturado.
  const handleMonedaChange = (v: Moneda) => {
    setValue("moneda", v);
    if (v !== "MXN") {
      const actual = getValues("tc_usd_mxn");
      if (tcPrefill && Number(actual) === tcPrefill.valor) {
        setValue("tc_usd_mxn", "");
      }
      setTcPrefill(null);
      return;
    }
    if (!tcSugerido) return;
    const actual = getValues("tc_usd_mxn");
    if (actual !== undefined && actual !== "" && Number(actual) > 0) return;
    setValue("tc_usd_mxn", tcSugerido.valor, { shouldValidate: true });
    setTcPrefill(tcSugerido);
  };

  // Si cambia el método, auto-sugiere moneda compatible (DOLARES→USD, EFECTIVO→MXN).
  const handleMetodoChange = (v: string) => {
    const m = v as MetodoPago;
    setValue("metodo_cobro", m);
    // La cuenta destino solo aplica a métodos bancarios: al salir de ellos se
    // limpia para no mandar una cuenta oculta en un cobro en efectivo.
    if (!METODOS_CON_CUENTA.includes(m)) setValue("cuenta_destino", "");
    if (m === "DOLARES") handleMonedaChange("USD");
    else if (m === "EFECTIVO") handleMonedaChange("MXN");
  };

  const tcHint =
    tcPrefill && Number(tc) === tcPrefill.valor
      ? tcPrefill.fuente === "cotizacion"
        ? "Prellenado con el TC de la cotización — puedes editarlo."
        : "Prellenado con el TC oficial del día (Banxico) — puedes editarlo."
      : "Necesario para saber cuánto cubre del total en USD";

  // Cuentas del catálogo: primero las de la moneda del cobro (sugerencia
  // suave — no se fuerza ninguna; "" = sin especificar).
  const cuentaOptions = useMemo(() => {
    const ordenadas = [...CUENTAS_COBRO].sort(
      (a, b) => Number(a.moneda !== moneda) - Number(b.moneda !== moneda),
    );
    return [
      { value: "", label: "Sin especificar" },
      ...ordenadas.map((c) => ({
        value: c.value,
        label: c.value,
        description: c.moneda === "USD" ? "Cuenta en USD" : "Cuenta en MXN",
      })),
    ];
  }, [moneda]);
  const monedaCuenta = monedaDeCuenta(cuentaDestino);
  const cuentaHint =
    monedaCuenta && monedaCuenta !== moneda
      ? `Ojo: la cuenta es en ${monedaCuenta} y el cobro en ${moneda}. Verifica que sea la correcta.`
      : "Opcional · primero aparecen las cuentas en la moneda del cobro";

  // Referencia de la cotización en pesos (informativa): con el TC de la
  // cotización si existe; si no, con el oficial del día.
  const tcReferencia = tcSugerido?.valor ?? null;
  const totalMxnReferencia =
    tcReferencia != null ? montoTotalUsd * tcReferencia : null;

  const usdEquivalente =
    moneda === "USD"
      ? Number(monto) || 0
      : tc && Number(tc) > 0
        ? (Number(monto) || 0) / Number(tc)
        : null;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = await registerCobroAction(flightId, {
        monto: Number(values.monto),
        moneda: values.moneda as Moneda,
        metodo_cobro: values.metodo_cobro as MetodoPago,
        // El TC solo tiene sentido en MXN: en USD nunca se manda, aunque el
        // formulario conserve un valor prellenado de un cambio de moneda.
        tc_usd_mxn:
          values.moneda === "MXN" && Number(values.tc_usd_mxn) > 0
            ? Number(values.tc_usd_mxn)
            : undefined,
        // Monto directo manda sobre el % (el API deriva el % de referencia).
        comision_banco_monto:
          values.comision_banco_monto !== undefined &&
          Number(values.comision_banco_monto) > 0
            ? Number(values.comision_banco_monto)
            : undefined,
        comision_banco_pct:
          Number(values.comision_banco_monto) > 0
            ? undefined
            : values.comision_banco_pct !== undefined &&
                Number(values.comision_banco_pct) > 0
              ? Number(values.comision_banco_pct)
              : undefined,
        referencia: values.referencia?.trim() || undefined,
        cuenta_destino: values.cuenta_destino || undefined,
        fecha_cobro: values.fecha_cobro
          ? cancunInputToIso(`${values.fecha_cobro.slice(0, 10)}T12:00`)
          : undefined,
        notas: values.notas?.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Cobro registrado");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al registrar cobro");
      }
    });
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (
          !nextOpen &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "focus-out")
        ) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-md sm:w-[480px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Registrar cobro · vuelo #{flightFolio}</SheetTitle>
          <SheetDescription>
            Total a cobrar:{" "}
            <span className="font-mono">{fmtUsd(montoTotalUsd)}</span> · Pendiente:{" "}
            <span
              className={cn(
                "font-mono",
                pendingUsd > 0 ? "text-destructive font-semibold" : "text-muted-foreground",
              )}
            >
              {fmtUsd(pendingUsd)}
            </span>
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Vista rápida de la cotización (informativa): total, TC con el
              que se cotizó y su equivalente en pesos, para que quien cobra
              no tenga que ir a buscarlos. */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <p className="mb-1.5 font-medium text-foreground">Cotización</p>
            <div className="grid grid-cols-3 gap-2">
              <Dato label="Total USD" value={fmtUsd(montoTotalUsd)} />
              <Dato
                label={
                  tcSugerido?.fuente === "oficial"
                    ? "TC oficial Banxico (hoy)"
                    : "TC de la cotización"
                }
                value={tcReferencia != null ? fmtDecimal(tcReferencia, 4) : "—"}
              />
              <Dato
                label="Total ≈ MXN"
                value={totalMxnReferencia != null ? fmtMxn(totalMxnReferencia) : "—"}
              />
            </div>
            {tcSugerido?.fuente === "oficial" && (
              <p className="mt-1.5 text-muted-foreground">
                La cotización no fijó tipo de cambio; se muestra el TC oficial
                Banxico del día: {fmtDecimal(tcSugerido.valor, 4)}.
              </p>
            )}
            {!tcSugerido && (
              <p className="mt-1.5 text-muted-foreground">
                La cotización no fijó tipo de cambio y no hay TC oficial del día
                disponible.
              </p>
            )}
          </div>

          <Field label="Método de cobro" required>
            <SearchableSelect
              options={METODOS.map((m) => ({
                value: m.value,
                label: m.label,
                description: m.hint,
              }))}
              value={metodo}
              onChange={handleMetodoChange}
              placeholder="Selecciona método"
            />
          </Field>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Monto" required error={errors.monto?.message}>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                {...register("monto")}
              />
            </Field>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Moneda</Label>
              <Segmented
                value={moneda}
                onChange={(v) => handleMonedaChange(v as Moneda)}
                options={[
                  { value: "USD", label: "USD" },
                  { value: "MXN", label: "MXN" },
                ]}
              />
            </div>
          </div>

          {moneda === "MXN" && (
            <Field
              label="Tipo de cambio USD/MXN"
              required
              hint={tcHint}
              error={errors.tc_usd_mxn?.message}
            >
              <Input
                type="number"
                step="0.0001"
                min={0}
                placeholder="20.50"
                {...register("tc_usd_mxn")}
              />
            </Field>
          )}

          {usdEquivalente !== null && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Equivale a </span>
              <span className="font-mono font-semibold">
                {fmtUsd(usdEquivalente)}
              </span>
              <span className="text-muted-foreground"> USD. </span>
              {usdEquivalente >= pendingUsd ? (
                <span className="text-green-600 dark:text-green-400">
                  Cubre el pendiente — el vuelo se marcará como cobrado.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Quedará pendiente {fmtUsd(pendingUsd - usdEquivalente)} USD.
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field
              label="Comisión del banco (%)"
              hint="Si conoces el porcentaje."
              error={errors.comision_banco_pct?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                max={20}
                placeholder="Ej. 2.9"
                disabled={Number(comisionMontoDirecto) > 0}
                {...register("comision_banco_pct")}
              />
            </Field>
            <Field
              label={`… o comisión en ${moneda}`}
              hint="Lo que retuvo el banco, tal como viene en el estado de cuenta. Manda sobre el %."
              error={errors.comision_banco_monto?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Ej. 589.05"
                {...register("comision_banco_monto")}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            El cliente pagó el monto completo; el banco deposita monto −
            comisión. Ambos campos son opcionales.
          </p>

          {Number(monto) > 0 &&
            (Number(comisionMontoDirecto) > 0 || Number(comisionPct) > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              {(() => {
                // Mismo redondeo que el API: comisión a 2 decimales y el neto
                // se deriva de ELLA (no del producto crudo) — sin ±1 centavo.
                const comision =
                  Number(comisionMontoDirecto) > 0
                    ? Math.round(Number(comisionMontoDirecto) * 100) / 100
                    : Math.round(
                        Number(monto) * (Number(comisionPct) / 100) * 100,
                      ) / 100;
                const pctRef =
                  Math.round((comision / Number(monto)) * 100 * 100) / 100;
                if (comision >= Number(monto)) {
                  return (
                    <span className="text-destructive">
                      La comisión no puede ser mayor o igual al monto del cobro.
                    </span>
                  );
                }
                return (
                  <>
                    <span className="text-muted-foreground">Comisión: </span>
                    <span className="font-mono font-semibold">
                      −{fmtUsd(comision)} {moneda}
                    </span>
                    {Number(comisionMontoDirecto) > 0 && (
                      <span className="text-muted-foreground"> (≈{pctRef}%)</span>
                    )}
                    <span className="text-muted-foreground"> · El banco depositará </span>
                    <span className="font-mono font-semibold">
                      {fmtUsd(Number(monto) - comision)} {moneda}
                    </span>
                    <span className="text-muted-foreground">
                      . El vuelo se acredita por el monto completo.
                    </span>
                  </>
                );
              })()}
            </div>
          )}

          {/* A qué cuenta LLEGÓ el dinero (pedido del equipo, 18-ago; catálogo
              fijo desde 28-ago): una de CUENTAS_COBRO. Solo métodos que tocan
              banco. Opcional: "Sin especificar" lo deja vacío. */}
          {METODOS_CON_CUENTA.includes(metodo) && (
            <Field
              label="¿A qué cuenta llegó?"
              hint={cuentaHint}
              error={errors.cuenta_destino?.message}
            >
              <SearchableSelect
                options={cuentaOptions}
                value={cuentaDestino ?? ""}
                onChange={(v) =>
                  setValue(
                    "cuenta_destino",
                    v as CobroFormValues["cuenta_destino"],
                    { shouldValidate: true },
                  )
                }
                placeholder="Sin especificar"
                searchPlaceholder="Buscar cuenta…"
              />
            </Field>
          )}

          <Field
            label="Referencia"
            hint="Folio bancario, ticket, voucher BillPocket, etc."
            error={errors.referencia?.message}
          >
            <Input placeholder="Opcional" {...register("referencia")} />
          </Field>

          <Field label="Fecha del cobro" error={errors.fecha_cobro?.message}>
            <Input type="date" {...register("fecha_cobro")} />
          </Field>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional"
              {...register("notas")}
            />
          </Field>
        </form>

        <SheetFooter className="border-t border-border flex-row justify-end gap-2 mt-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Registrando…" : "Registrar cobro"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Par etiqueta/valor compacto para la vista rápida de la cotización. */
function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate font-mono font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-7 px-2 text-xs font-medium rounded-md transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
