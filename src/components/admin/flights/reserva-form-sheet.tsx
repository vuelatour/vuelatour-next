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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { createReservaAction } from "@/app/admin/flights/actions";

interface ClientOption {
  id: string;
  nombre: string;
  rfc: string | null;
}

interface AirportOption {
  iata: string;
  nombre: string;
}

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

interface PilotOption {
  id: string;
  nombre: string;
}

const ReservaSchema = z
  .object({
    cliente_id: z.string().uuid("Cliente requerido"),
    origen_iata: z
      .string()
      .min(3)
      .max(4)
      .transform((v) => v.toUpperCase()),
    destino_iata: z
      .string()
      .min(3, "Destino requerido")
      .max(4)
      .transform((v) => v.toUpperCase()),
    fecha_vuelo: z.string().min(1, "Fecha requerida"),
    fecha_traslado_final: z.string().optional().or(z.literal("")),
    pasajeros: z.coerce.number().int().min(1, "Mínimo 1"),
    aeronave_id: z.string().optional().or(z.literal("")),
    piloto_id: z.string().optional().or(z.literal("")),
    cotizacion_abierta: z.boolean().default(false),
    notas: z.string().max(2000).optional().or(z.literal("")),
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

type FormValues = z.input<typeof ReservaSchema>;

const defaultValues: FormValues = {
  cliente_id: "",
  origen_iata: "CUN",
  destino_iata: "",
  fecha_vuelo: "",
  fecha_traslado_final: "",
  pasajeros: 1,
  aeronave_id: "",
  piloto_id: "",
  cotizacion_abierta: false,
  notas: "",
};

interface ReservaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  airports: AirportOption[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}

export function ReservaFormSheet({
  open,
  onOpenChange,
  clients,
  airports,
  aircraft,
  pilots,
}: ReservaFormSheetProps) {
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
    resolver: zodResolver(ReservaSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open, reset]);

  const airportOptions = airports.map((a) => ({
    value: a.iata,
    label: a.iata,
    description: a.nombre,
  }));

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const res = await createReservaAction({
        cliente_id: values.cliente_id,
        origen_iata: values.origen_iata.toUpperCase(),
        destino_iata: values.destino_iata.toUpperCase(),
        fecha_vuelo: cancunInputToIso(values.fecha_vuelo),
        fecha_traslado_final: values.fecha_traslado_final
          ? cancunInputToIso(values.fecha_traslado_final)
          : undefined,
        pasajeros: Number(values.pasajeros) || 1,
        aeronave_id: values.aeronave_id || undefined,
        piloto_id: values.piloto_id || undefined,
        cotizacion_abierta: values.cotizacion_abierta ?? false,
        notas: values.notas?.trim() || undefined,
      });
      if (res.ok && res.data) {
        toast.success(`Espacio apartado · vuelo #${res.data.folio}`);
        onOpenChange(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        toast.error(res.error ?? "Error al apartar el espacio");
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
          <SheetTitle>Apartar espacio (reserva tentativa)</SheetTitle>
          <SheetDescription>
            Bloquea el día y horario en el calendario SIN cotización — para no
            vender el mismo espacio dos veces mientras el cliente confirma o se
            consiguen costos. Se cotiza después desde el detalle del vuelo.
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
              value={watch("cliente_id")}
              onChange={(v) => setValue("cliente_id", v)}
              placeholder="Selecciona cliente"
              emptyText="Sin clientes activos"
            />
          </Field>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Origen" required error={errors.origen_iata?.message}>
              <SearchableSelect
                options={airportOptions}
                value={watch("origen_iata")}
                onChange={(v) => setValue("origen_iata", v)}
                placeholder="IATA"
              />
            </Field>
            <span className="text-muted-foreground mb-2">→</span>
            <Field
              label="Destino tentativo"
              required
              error={errors.destino_iata?.message}
            >
              <SearchableSelect
                options={airportOptions}
                value={watch("destino_iata")}
                onChange={(v) => setValue("destino_iata", v)}
                placeholder="IATA"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Fecha y hora"
              hint={TZ_LABEL}
              required
              error={errors.fecha_vuelo?.message}
            >
              <Input type="datetime-local" {...register("fecha_vuelo")} />
            </Field>
            <Field
              label="Regreso (opcional)"
              hint="Si se conoce"
              error={errors.fecha_traslado_final?.message}
            >
              <Input type="datetime-local" {...register("fecha_traslado_final")} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Pasajeros" required error={errors.pasajeros?.message}>
              <Input type="number" min={1} {...register("pasajeros")} />
            </Field>
            <Field label="Aeronave (opcional)">
              <SearchableSelect
                options={[
                  { value: "", label: "Sin asignar" },
                  ...aircraft.map((a) => ({
                    value: a.id,
                    label: a.matricula,
                    description: a.modelo,
                  })),
                ]}
                value={watch("aeronave_id") ?? ""}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Sin asignar"
              />
            </Field>
            <Field label="Piloto (opcional)">
              <SearchableSelect
                options={[
                  { value: "", label: "Sin asignar" },
                  ...pilots.map((p) => ({ value: p.id, label: p.nombre })),
                ]}
                value={watch("piloto_id") ?? ""}
                onChange={(v) => setValue("piloto_id", v)}
                placeholder="Sin asignar"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Cotización abierta</Label>
              <p className="text-xs text-muted-foreground">
                &ldquo;Llévame y de ahí vemos&rdquo;: el piloto registra los tramos en
                el camino y el precio se cierra al final.
              </p>
            </div>
            <Switch
              checked={watch("cotizacion_abierta") ?? false}
              onCheckedChange={(c) => setValue("cotizacion_abierta", c)}
            />
          </div>

          <Field label="Notas internas" error={errors.notas?.message}>
            <Textarea
              rows={2}
              placeholder='Opcional · ej. "espera confirmación del cliente el jueves"'
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
            {pending ? "Apartando…" : "Apartar espacio"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {(hint || error) && (
        <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
