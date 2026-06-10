"use client";

import { useEffect, useTransition } from "react";
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
import { fmtUsd } from "@/lib/format";
import { registerCobroAction } from "@/app/admin/flights/actions";
import type { MetodoPago } from "@/types/quote";
import { Field } from "@/components/admin/form-field";

type Moneda = "USD" | "MXN";

const METODOS: { value: MetodoPago; label: string; hint: string }[] = [
  { value: "TRANSFERENCIA", label: "Transferencia", hint: "Con factura · IVA 16%" },
  { value: "HSBC_LINK", label: "HSBC link", hint: "Con factura · IVA 16%" },
  { value: "BILLPOCKET", label: "BillPocket", hint: "Terminal · sin factura" },
  { value: "EFECTIVO", label: "Efectivo (MXN)", hint: "Sin IVA" },
  { value: "DOLARES", label: "Dólares en mano", hint: "Sin IVA" },
];

const CobroFormSchema = z
  .object({
    monto: z.coerce.number().positive("Monto debe ser > 0"),
    moneda: z.enum(["USD", "MXN"]),
    metodo_cobro: z.enum([
      "TRANSFERENCIA",
      "HSBC_LINK",
      "BILLPOCKET",
      "EFECTIVO",
      "DOLARES",
    ]),
    tc_usd_mxn: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : Number(v))),
    referencia: z.string().max(100).optional().or(z.literal("")),
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
}

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
    referencia: "",
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
}: CobroFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CobroFormValues>({
    resolver: zodResolver(CobroFormSchema),
    defaultValues: defaults(pendingUsd),
  });

  useEffect(() => {
    if (open) reset(defaults(pendingUsd));
  }, [open, pendingUsd, reset]);

  const moneda = watch("moneda");
  const metodo = watch("metodo_cobro");
  const monto = watch("monto");
  const tc = watch("tc_usd_mxn");

  // Si cambia el método, auto-sugiere moneda compatible (DOLARES→USD, EFECTIVO→MXN).
  const handleMetodoChange = (v: string) => {
    const m = v as MetodoPago;
    setValue("metodo_cobro", m);
    if (m === "DOLARES") setValue("moneda", "USD");
    else if (m === "EFECTIVO") setValue("moneda", "MXN");
  };

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
        tc_usd_mxn:
          values.tc_usd_mxn !== undefined && Number(values.tc_usd_mxn) > 0
            ? Number(values.tc_usd_mxn)
            : undefined,
        referencia: values.referencia?.trim() || undefined,
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
                onChange={(v) => setValue("moneda", v as Moneda)}
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
              hint="Necesario para saber cuánto cubre del total en USD"
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
