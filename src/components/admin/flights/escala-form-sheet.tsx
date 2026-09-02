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
import { cancunInputToIso, isoToCancunInput, TZ_LABEL } from "@/lib/datetime";
import {
  createEscalaAction,
  updateEscalaAction,
} from "@/app/admin/flights/actions";
import type { FlightEscala } from "@/types/flights";
import { Field } from "@/components/admin/form-field";

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
    // SEMÁNTICA 2-sep-2026: el sobrevuelo es una BANDERA del tramo ORTOGONAL
    // al destino (un CUN→CZM puede llevar sobrevuelo igual que un CUN→CUN):
    // el destino se captura SIEMPRE, nunca se deriva del origen.
    destino_iata: z
      .string()
      .min(3, "IATA requerido")
      .max(4)
      .transform((v) => v.toUpperCase()),
    // Salida PROGRAMADA del tramo (fecha_salida_plan): es la que ve el piloto
    // en su app. Las horas REALES (hora_salida/llegada) las pone el sistema
    // al capturar tacómetros — no se editan aquí.
    fecha_salida_plan: z.string().optional().or(z.literal("")),
    es_sobrevuelo: z.boolean().default(false),
    es_ferry: z.boolean().default(false),
    // OJO al orden de la unión: "" debe ganar ANTES de la coerción numérica
    // (z.coerce.number("") === 0 y un campo vacío se guardaría como 0 pax).
    pasajeros: z
      .union([z.literal(""), z.coerce.number().int("Debe ser entero").min(0, "Mínimo 0")])
      .optional(),
    // Manifiesto del tramo: textarea con un nombre por línea (se parsea al enviar).
    pasajeros_nombres: z.string().max(4000).optional().or(z.literal("")),
    requiere_pernocta: z.boolean().default(false),
    // Parada de servicio (tipo_parada NORMAL↔SERVICIO) + su detalle.
    es_servicio: z.boolean().default(false),
    servicio_notas: z.string().max(1000).optional().or(z.literal("")),
    notas: z.string().max(1000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    // Un SOBREVUELO puede salir y regresar al mismo punto (CUN → CUN): la
    // igualdad solo se prohíbe en tramos de traslado normales.
    if (
      val.origen_iata &&
      val.destino_iata &&
      val.origen_iata === val.destino_iata &&
      !val.es_sobrevuelo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destino_iata"],
        message: "Origen y destino no pueden ser iguales (salvo sobrevuelo)",
      });
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
  // datetime-local en HORA DE CANCÚN.
  return isoToCancunInput(iso);
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
      fecha_salida_plan: toLocalDatetime(initialEscala.fecha_salida_plan),
      es_sobrevuelo: initialEscala.es_sobrevuelo ?? false,
      es_ferry: initialEscala.es_ferry ?? false,
      pasajeros: initialEscala.pasajeros ?? "",
      pasajeros_nombres: (initialEscala.pasajeros_nombres ?? []).join("\n"),
      requiere_pernocta: initialEscala.requiere_pernocta ?? false,
      es_servicio: initialEscala.tipo_parada === "SERVICIO",
      servicio_notas: initialEscala.servicio_notas ?? "",
      notas: initialEscala.notas ?? "",
    };
  }
  return {
    orden: nextOrden(taken),
    origen_iata: "",
    destino_iata: "",
    fecha_salida_plan: "",
    es_sobrevuelo: false,
    es_ferry: false,
    pasajeros: "",
    pasajeros_nombres: "",
    requiere_pernocta: false,
    es_servicio: false,
    servicio_notas: "",
    notas: "",
  };
}

/** Textarea "uno por línea" → array de nombres (líneas no vacías, sin espacios sobrantes). */
function parseNombres(raw: string | undefined): string[] {
  return (raw ?? "")
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
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
    if (open) {
      reset(defaults(initialEscala, takenOrdenes));
    }
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
  const esSobrevuelo = watch("es_sobrevuelo");
  const esFerry = watch("es_ferry");
  const esServicio = watch("es_servicio");

  const ordenCollision =
    typeof orden === "number" && collisionSet.has(orden);

  const onSubmit = handleSubmit((values) => {
    if (collisionSet.has(Number(values.orden))) {
      toast.error(`Ya existe una escala con orden ${values.orden}`);
      return;
    }
    startTransition(async () => {
      // Manifiesto del tramo: un ferry vuela vacío (sin nombres). Al EDITAR,
      // el campo solo viaja si cambió respecto a lo guardado — pero si el
      // usuario borró nombres, viaja el array VACÍO (borrar sí es un cambio;
      // omitirlo dejaría los nombres viejos pegados).
      const nombres = values.es_ferry ? [] : parseNombres(values.pasajeros_nombres);
      const nombresIniciales = initialEscala?.pasajeros_nombres ?? [];
      const nombresCambiaron =
        nombres.join("\n") !== nombresIniciales.join("\n");
      const payload = {
        orden: Number(values.orden),
        origen_iata: values.origen_iata.toUpperCase(),
        // SEMÁNTICA 2-sep-2026: el destino viaja tal cual se capturó — el
        // sobrevuelo es una bandera ortogonal y NUNCA deriva el destino.
        destino_iata: values.destino_iata.toUpperCase(),
        fecha_salida_plan: values.fecha_salida_plan
          ? cancunInputToIso(values.fecha_salida_plan)
          : undefined,
        es_sobrevuelo: values.es_sobrevuelo,
        // Ferry ⇒ 0 pax SIEMPRE (regla del tramo de posicionamiento). Al
        // quitar el ferry, se manda el número capturado (vacío = sin cambio).
        es_ferry: values.es_ferry,
        pasajeros: values.es_ferry
          ? 0
          : values.pasajeros === "" || values.pasajeros == null
            ? undefined
            : Number(values.pasajeros),
        pasajeros_nombres: isEdit
          ? nombresCambiaron
            ? nombres
            : undefined
          : nombres.length > 0
            ? nombres
            : undefined,
        requiere_pernocta: values.requiere_pernocta,
        tipo_parada: (values.es_servicio ? "SERVICIO" : "NORMAL") as
          | "NORMAL"
          | "SERVICIO",
        // Al apagar el switch de servicio en edición se LIMPIA el detalle
        // guardado (null); en alta simplemente no viaja.
        servicio_notas: values.es_servicio
          ? values.servicio_notas?.trim() || undefined
          : isEdit
            ? null
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
            {/* SEMÁNTICA 2-sep-2026: el destino SIEMPRE es editable — el
                sobrevuelo es una bandera del tramo, ortogonal al destino. */}
            <Field
              label="Destino"
              required
              error={errors.destino_iata?.message}
            >
              <SearchableSelect
                options={airportOptions}
                value={destinoIata}
                onChange={(v) => setValue("destino_iata", v)}
                placeholder="IATA"
              />
            </Field>
          </div>

          <Field
            label="Salida (plan)"
            hint={`Hora programada del tramo — es la que ve el piloto en su app · ${TZ_LABEL}. En el tramo 1 también actualiza la fecha del vuelo.`}
            error={errors.fecha_salida_plan?.message}
          >
            <Input type="datetime-local" {...register("fecha_salida_plan")} />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Ferry (sin pasajeros)</Label>
              <p className="text-xs text-muted-foreground">
                Tramo de posicionamiento/reposicionamiento: vuela vacío. El
                piloto lo ve en su app; el cliente no lo ve ni se le cobra.
              </p>
            </div>
            <Switch
              checked={esFerry}
              onCheckedChange={(c) => {
                setValue("es_ferry", c);
                // Ferry vuela vacío: pasajeros a 0 y sin nombres, en automático.
                if (c) {
                  setValue("pasajeros", 0);
                  setValue("pasajeros_nombres", "");
                }
              }}
            />
          </div>

          <Field
            label="Pasajeros del tramo"
            hint={
              esFerry
                ? "Un ferry vuela vacío (0). Apaga el switch de arriba para capturar pasajeros."
                : "Cuántos pasajeros vuelan en ESTE tramo (puede variar entre ida y regreso)."
            }
            error={errors.pasajeros?.message as string | undefined}
          >
            <Input
              type="number"
              min={0}
              disabled={esFerry}
              placeholder="Ej. 4"
              {...register("pasajeros")}
            />
          </Field>

          <Field
            label="Nombres de pasajeros (opcional)"
            hint={
              esFerry
                ? "Un ferry vuela vacío: sin manifiesto de nombres."
                : "Específico de este tramo. Útil para permisos; puede ir vacío."
            }
            error={errors.pasajeros_nombres?.message}
          >
            <Textarea
              rows={3}
              disabled={esFerry}
              placeholder={"Uno por línea (puede ir vacío)\nJuan Pérez\nMaría López"}
              {...register("pasajeros_nombres")}
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Sobrevuelo</Label>
              <p className="text-xs text-muted-foreground">
                El avión realiza un sobrevuelo (recorrido/reconocimiento) en
                este tramo. No cambia origen ni destino.
              </p>
            </div>
            {/* SEMÁNTICA 2-sep-2026: el switch SOLO prende/apaga la bandera —
                jamás toca el campo Destino. */}
            <Switch
              checked={esSobrevuelo}
              onCheckedChange={(c) => setValue("es_sobrevuelo", c)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm font-medium">Pernocta</Label>
              <p className="text-xs text-muted-foreground">
                El piloto pernocta tras este tramo — dispara el viático de
                pernocta en la cotización.
              </p>
            </div>
            <Switch
              checked={watch("requiere_pernocta")}
              onCheckedChange={(c) => setValue("requiere_pernocta", c)}
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Parada de servicio</Label>
                <p className="text-xs text-muted-foreground">
                  Parada técnica: cambiar llanta, revisión, carga de material.
                </p>
              </div>
              <Switch
                checked={esServicio}
                onCheckedChange={(c) => setValue("es_servicio", c)}
              />
            </div>
            {esServicio && (
              <Field
                label="Detalle del servicio"
                error={errors.servicio_notas?.message}
              >
                <Textarea
                  rows={2}
                  placeholder="Ej. aterriza en Toledo a cambiar llanta"
                  {...register("servicio_notas")}
                />
              </Field>
            )}
          </div>

          <Field
            label="Nota para el piloto"
            hint="Se muestra al piloto en su app, sobre este tramo (ej. “cargar gasolina aquí”, “revisar llanta en…”)."
            error={errors.notas?.message}
          >
            <Textarea
              rows={2}
              placeholder="Ej. Cargar turbosina aprovechando la escala"
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
          <Button type="button" onClick={onSubmit} disabled={pending || ordenCollision}>
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Añadir escala"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

