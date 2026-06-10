"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancunInputToIso, TZ_LABEL } from "@/lib/datetime";
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
import { fmtUsd } from "@/lib/format";
import { createExternalFlightAction } from "@/app/admin/flights/actions";
import { Field } from "@/components/admin/form-field";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

const ExternalFlightSchema = z
  .object({
    cliente_id: z.string().uuid("Cliente requerido"),
    operador_externo: z
      .string()
      .trim()
      .min(2, "Mínimo 2 caracteres")
      .max(100, "Máximo 100 caracteres"),
    costo_externo_usd: z.coerce.number().min(0, "Mínimo 0"),
    monto_total_usd: z.coerce.number().positive("Debe ser > 0"),
    origen_iata: z
      .string()
      .min(3)
      .max(4)
      .transform((v) => v.toUpperCase()),
    destino_iata: z
      .string()
      .min(3)
      .max(4)
      .transform((v) => v.toUpperCase()),
    pasajeros: z.coerce.number().int().min(1, "Mínimo 1"),
    fecha_vuelo: z.string().optional().or(z.literal("")),
    notas: z.string().max(2000).optional().or(z.literal("")),
    notas_internas: z.string().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.origen_iata === val.destino_iata) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destino_iata"],
        message: "Origen y destino no pueden ser iguales",
      });
    }
  });

type FormValues = z.input<typeof ExternalFlightSchema>;

const defaultValues: FormValues = {
  cliente_id: "",
  operador_externo: "",
  costo_externo_usd: 0,
  monto_total_usd: 0,
  origen_iata: "CUN",
  destino_iata: "",
  pasajeros: 1,
  fecha_vuelo: "",
  notas: "",
  notas_internas: "",
};

interface ExternalFlightFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  airports: AirportOption[];
}

export function ExternalFlightFormSheet({
  open,
  onOpenChange,
  clients,
  airports,
}: ExternalFlightFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(ExternalFlightSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, reset]);

  const clienteId = watch("cliente_id");
  const origenIata = watch("origen_iata");
  const destinoIata = watch("destino_iata");
  const monto = Number(watch("monto_total_usd")) || 0;
  const costo = Number(watch("costo_externo_usd")) || 0;
  const margen = monto - costo;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = await createExternalFlightAction({
        cliente_id: values.cliente_id,
        operador_externo: values.operador_externo.trim(),
        costo_externo_usd: Number(values.costo_externo_usd),
        monto_total_usd: Number(values.monto_total_usd),
        origen_iata: values.origen_iata.toUpperCase(),
        destino_iata: values.destino_iata.toUpperCase(),
        pasajeros: Number(values.pasajeros),
        fecha_vuelo: values.fecha_vuelo
          ? cancunInputToIso(values.fecha_vuelo)
          : undefined,
        notas: values.notas?.trim() || undefined,
        notas_internas: values.notas_internas?.trim() || undefined,
      });
      if (res.ok && res.data) {
        toast.success(`Vuelo externo #${res.data.folio} creado`);
        onOpenChange(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al crear vuelo externo");
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
        className="w-full sm:max-w-xl sm:w-[560px] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Nuevo vuelo externo</SheetTitle>
          <SheetDescription>
            Vuelo subcontratado a operador externo. Skip del motor de cotización
            — el costo y el monto al cliente se ingresan directos. Queda en
            estado CONFIRMADO inmediatamente.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Field label="Cliente" required error={errors.cliente_id?.message}>
            <SearchableSelect
              options={clients.map((c) => ({
                value: c.id,
                label: c.nombre,
                description: c.rfc ?? undefined,
              }))}
              value={clienteId}
              onChange={(v) => setValue("cliente_id", v)}
              placeholder="Selecciona cliente"
              emptyText="Sin clientes activos"
            />
          </Field>

          <Field
            label="Operador externo"
            hint="Matrícula o nombre del operador subcontratado (ej. XA-TIB)"
            required
            error={errors.operador_externo?.message}
          >
            <Input placeholder="XA-TIB" {...register("operador_externo")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Costo USD (operador)"
              hint="Lo que cobra el operador externo"
              required
              error={errors.costo_externo_usd?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                {...register("costo_externo_usd")}
              />
            </Field>
            <Field
              label="Monto USD (cliente)"
              hint="Lo que se cobra al cliente"
              required
              error={errors.monto_total_usd?.message}
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                {...register("monto_total_usd")}
              />
            </Field>
          </div>

          {monto > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Margen estimado: </span>
              <span
                className={`font-mono font-semibold ${
                  margen > 0
                    ? "text-green-600 dark:text-green-400"
                    : margen < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {fmtUsd(margen)}
              </span>
              {monto > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({((margen / monto) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Origen" required error={errors.origen_iata?.message}>
              <SearchableSelect
                options={airports.map((a) => ({
                  value: a.iata,
                  label: a.iata,
                  description: a.nombre,
                }))}
                value={origenIata}
                onChange={(v) => setValue("origen_iata", v)}
                placeholder="IATA"
              />
            </Field>
            <span className="text-muted-foreground mb-2">→</span>
            <Field label="Destino" required error={errors.destino_iata?.message}>
              <SearchableSelect
                options={airports.map((a) => ({
                  value: a.iata,
                  label: a.iata,
                  description: a.nombre,
                }))}
                value={destinoIata}
                onChange={(v) => setValue("destino_iata", v)}
                placeholder="IATA"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pasajeros" required error={errors.pasajeros?.message}>
              <Input type="number" min={1} {...register("pasajeros")} />
            </Field>
            <Field label="Fecha y hora" hint={TZ_LABEL} error={errors.fecha_vuelo?.message}>
              <Input type="datetime-local" {...register("fecha_vuelo")} />
            </Field>
          </div>

          <Field label="Notas (visibles)" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional · información que ve el cliente"
              {...register("notas")}
            />
          </Field>

          <Field label="Notas internas" error={errors.notas_internas?.message}>
            <Textarea
              rows={2}
              placeholder="Opcional · solo equipo"
              {...register("notas_internas")}
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
            {pending ? "Creando…" : "Crear vuelo externo"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

