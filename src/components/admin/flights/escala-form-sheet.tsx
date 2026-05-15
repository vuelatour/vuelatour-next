"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
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
import {
  createEscalaAction,
  updateEscalaAction,
} from "@/app/admin/flights/actions";
import type { FlightEscala } from "@/types/flights";

interface AirportOption {
  iata: string;
  nombre: string;
}

const EscalaSchema = z
  .object({
    orden: z.coerce.number().int("Debe ser entero").min(1, "Mínimo 1"),
    origen_iata: z
      .string()
      .min(3, "IATA requerido")
      .max(4)
      .transform((v) => v.toUpperCase()),
    destino_iata: z
      .string()
      .min(3, "IATA requerido")
      .max(4)
      .transform((v) => v.toUpperCase()),
    hora_salida: z.string().optional().or(z.literal("")),
    hora_llegada: z.string().optional().or(z.literal("")),
    notas: z.string().max(1000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.origen_iata && val.destino_iata && val.origen_iata === val.destino_iata) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destino_iata"],
        message: "Origen y destino no pueden ser iguales",
      });
    }
    if (val.hora_salida && val.hora_llegada) {
      const a = new Date(val.hora_salida).getTime();
      const b = new Date(val.hora_llegada).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b <= a) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hora_llegada"],
          message: "Hora de llegada debe ser posterior a la de salida",
        });
      }
    }
  });

type EscalaFormValues = z.input<typeof EscalaSchema>;

interface EscalaFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  flightFolio: number;
  airports: AirportOption[];
  /** Órdenes ya usados por otras escalas (excluye la actual al editar). */
  takenOrdenes: number[];
  /** Si se pasa, modo edición. */
  initialEscala?: FlightEscala;
}

function nextOrden(taken: number[]): number {
  // Sugiere el siguiente número disponible (max+1 ó 1 si vacío).
  if (taken.length === 0) return 1;
  return Math.max(...taken) + 1;
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  // datetime-local espera YYYY-MM-DDTHH:mm (sin zona).
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function defaults(
  initialEscala: FlightEscala | undefined,
  taken: number[],
): EscalaFormValues {
  if (initialEscala) {
    return {
      orden: initialEscala.orden,
      origen_iata: initialEscala.origen_iata,
      destino_iata: initialEscala.destino_iata,
      hora_salida: toLocalDatetime(initialEscala.hora_salida),
      hora_llegada: toLocalDatetime(initialEscala.hora_llegada),
      notas: initialEscala.notas ?? "",
    };
  }
  return {
    orden: nextOrden(taken),
    origen_iata: "",
    destino_iata: "",
    hora_salida: "",
    hora_llegada: "",
    notas: "",
  };
}

export function EscalaFormSheet({
  open,
  onOpenChange,
  flightId,
  flightFolio,
  airports,
  takenOrdenes,
  initialEscala,
}: EscalaFormSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialEscala;

  // Al editar, el orden actual NO debe contar como "tomado".
  const collisionSet = useMemo(() => {
    const set = new Set(takenOrdenes);
    if (initialEscala) set.delete(initialEscala.orden);
    return set;
  }, [takenOrdenes, initialEscala]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EscalaFormValues>({
    resolver: zodResolver(EscalaSchema),
    defaultValues: defaults(initialEscala, takenOrdenes),
  });

  useEffect(() => {
    if (open) reset(defaults(initialEscala, takenOrdenes));
  }, [open, initialEscala, takenOrdenes, reset]);

  const airportOptions = useMemo(
    () =>
      airports.map((a) => ({
        value: a.iata,
        label: a.iata,
        description: a.nombre,
      })),
    [airports],
  );

  const orden = watch("orden");
  const origenIata = watch("origen_iata");
  const destinoIata = watch("destino_iata");

  const ordenCollision =
    typeof orden === "number" && collisionSet.has(orden);

  const onSubmit = handleSubmit((values) => {
    if (collisionSet.has(Number(values.orden))) {
      toast.error(`Ya existe una escala con orden ${values.orden}`);
      return;
    }
    startTransition(async () => {
      const payload = {
        orden: Number(values.orden),
        origen_iata: values.origen_iata.toUpperCase(),
        destino_iata: values.destino_iata.toUpperCase(),
        hora_salida: values.hora_salida
          ? new Date(values.hora_salida).toISOString()
          : undefined,
        hora_llegada: values.hora_llegada
          ? new Date(values.hora_llegada).toISOString()
          : undefined,
        notas: values.notas?.trim() || undefined,
      };
      const res = isEdit
        ? await updateEscalaAction(flightId, initialEscala!.id, payload)
        : await createEscalaAction(flightId, payload);
      if (res.ok) {
        toast.success(isEdit ? "Escala actualizada" : "Escala añadida");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
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
          <SheetTitle>
            {isEdit ? "Editar escala" : "Nueva escala"} · vuelo #{flightFolio}
          </SheetTitle>
          <SheetDescription>
            Define el segmento del itinerario. Los tacómetros y fotos se capturan
            por el piloto en la app móvil.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Field label="Orden" required error={errors.orden?.message}>
            <Input type="number" min={1} {...register("orden")} />
            {ordenCollision && (
              <p className="text-xs text-destructive">
                Ya existe una escala con orden {orden}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Origen" required error={errors.origen_iata?.message}>
              <SearchableSelect
                options={airportOptions}
                value={origenIata}
                onChange={(v) => setValue("origen_iata", v)}
                placeholder="IATA"
              />
            </Field>
            <ArrowRightIcon className="h-4 w-4 text-muted-foreground mb-2" />
            <Field label="Destino" required error={errors.destino_iata?.message}>
              <SearchableSelect
                options={airportOptions}
                value={destinoIata}
                onChange={(v) => setValue("destino_iata", v)}
                placeholder="IATA"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora salida" hint="Programada o real" error={errors.hora_salida?.message}>
              <Input type="datetime-local" {...register("hora_salida")} />
            </Field>
            <Field label="Hora llegada" error={errors.hora_llegada?.message}>
              <Input type="datetime-local" {...register("hora_llegada")} />
            </Field>
          </div>

          <Field label="Notas" error={errors.notas?.message}>
            <Textarea rows={2} placeholder="Opcional" {...register("notas")} />
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
          <Button type="button" onClick={onSubmit} disabled={pending || ordenCollision}>
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Añadir escala"}
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
