"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuoteLegsEditor } from "@/components/admin/quotes/quote-legs-editor";
import { cn } from "@/lib/utils";
import {
  createRouteAction,
  updateRouteAction,
} from "@/app/admin/routes/actions";
import { RouteFormSchema, type RouteFormValues } from "@/app/admin/routes/schema";
import type { Route, TipoRuta } from "@/types/routes";
import type { EscalaInput } from "@/types/quote";

interface AirportOption {
  iata: string;
  nombre: string;
}

interface RouteFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoute?: Route;
  airports: AirportOption[];
  /**
   * Tipo de ruta forzado al abrir. Útil cuando se invoca desde el cotizador
   * para que la persona caiga directo en el modo Multiescala sin tener que
   * cambiar el segmented manualmente.
   */
  defaultTipo?: TipoRuta;
  /**
   * Callback que recibe la ruta recién creada/actualizada. Permite al caller
   * actualizar su estado local (ej. cotizador agrega la ruta al dropdown y la
   * auto-selecciona) sin esperar a un revalidatePath del servidor.
   */
  onSaved?: (route: Route) => void;
}

const FUENTE_OPTIONS = [
  { value: "GOOGLE_EARTH", label: "Google Earth" },
  { value: "FOREFLIGHT", label: "ForeFlight" },
  { value: "MANUAL", label: "Manual" },
  { value: "APROXIMACION", label: "Aproximación" },
];

export function RouteFormSheet({
  open,
  onOpenChange,
  initialRoute,
  airports,
  defaultTipo,
  onSaved,
}: RouteFormSheetProps) {
  const [pending, startTransition] = useTransition();
  const isEdit = !!initialRoute;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RouteFormValues>({
    resolver: zodResolver(RouteFormSchema),
    defaultValues: defaults(initialRoute, defaultTipo),
  });

  useEffect(() => {
    if (open) reset(defaults(initialRoute, defaultTipo));
  }, [open, initialRoute, defaultTipo, reset]);

  const tipo = watch("tipo") ?? "SIMPLE";
  const esRedondoAuto = watch("es_redondo_auto");
  const tramos = watch("tramos") ?? [];
  const origenIata = watch("origen_iata") ?? "";
  const destinoIata = watch("destino_iata") ?? "";
  const airportOptions = airports.map((a) => ({
    value: a.iata,
    label: `${a.iata} — ${a.nombre}`,
  }));

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateRouteAction(initialRoute!.id, values)
        : await createRouteAction(values);

      if (result.ok) {
        toast.success(isEdit ? "Ruta actualizada" : "Ruta creada");
        if (result.data) onSaved?.(result.data);
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
    <Sheet
      open={open}
      onOpenChange={(nextOpen, details) => {
        // Bloquea cierre accidental: click fuera, tecla Escape o perdida de foco.
        // El sheet solo se cierra desde acciones explicitas (boton Cancelar,
        // boton X, o success interno tras guardar).
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
          <SheetTitle>{isEdit ? "Editar ruta" : "Nueva ruta"}</SheetTitle>
          <SheetDescription>
            {tipo === "MULTIESCALA"
              ? "Define los tramos del itinerario. El cotizador reusará esta ruta sumando millas y aterrizajes automáticamente."
              : "Define el par origen-destino y las millas náuticas de ida (el regreso se duplica automáticamente)."}
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={onSubmit}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {/* Tipo de ruta */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de ruta</Label>
            <Segmented
              value={tipo}
              onChange={(v) => setValue("tipo", v as TipoRuta)}
              options={[
                { value: "SIMPLE", label: "Redondo" },
                { value: "MULTIESCALA", label: "Multiescala" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {tipo === "MULTIESCALA"
                ? "Itinerario con varios tramos (ej. CUN→HOL→CZM→CUN)."
                : "Ruta directa origen→destino. El regreso a base se duplica automáticamente."}
            </p>
          </div>

          {tipo === "SIMPLE" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Origen (IATA)"
                  required
                  error={errors.origen_iata?.message}
                >
                  <SearchableSelect
                    options={airportOptions}
                    value={origenIata}
                    onChange={(v) => setValue("origen_iata", v)}
                    placeholder="Selecciona origen"
                    emptyText="Sin aeropuertos"
                  />
                </Field>
                <Field
                  label="Destino (IATA)"
                  required
                  error={errors.destino_iata?.message}
                >
                  <SearchableSelect
                    options={airportOptions}
                    value={destinoIata}
                    onChange={(v) => setValue("destino_iata", v)}
                    placeholder="Selecciona destino"
                    emptyText="Sin aeropuertos"
                  />
                </Field>
              </div>

              <Field
                label="Millas náuticas"
                hint={esRedondoAuto ? "One-way; el motor multiplica × 2" : "Total del recorrido"}
                required
                error={errors.millas_nauticas?.message}
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="63.14"
                  {...register("millas_nauticas")}
                />
              </Field>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="es_redondo_auto" className="text-sm font-medium">
                    Redondo automático
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Multiplica las NM × 2 al cotizar (CUN-X-CUN).
                  </p>
                </div>
                <Switch
                  id="es_redondo_auto"
                  checked={esRedondoAuto}
                  onCheckedChange={(c) => setValue("es_redondo_auto", c)}
                />
              </div>

              <Field
                label="Número de aterrizajes"
                hint="Cada aterrizaje suma 0.15 hrs de calzos"
                required
                error={errors.num_aterrizajes?.message}
              >
                <Input type="number" min={1} {...register("num_aterrizajes")} />
              </Field>
            </>
          ) : (
            <Field
              label="Tramos"
              required
              hint="Origen del siguiente tramo queda fijo al destino del anterior."
              error={errors.tramos?.message}
            >
              <QuoteLegsEditor
                value={tramos as EscalaInput[]}
                onChange={(legs) => setValue("tramos", legs, { shouldValidate: true })}
                airports={airports}
              />
            </Field>
          )}

          <Field label="Fuente" hint="Cómo se obtuvo el dato" error={errors.fuente?.message}>
            <SearchableSelect
              options={[
                { value: "", label: "Sin especificar" },
                ...FUENTE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              ]}
              value={watch("fuente") ?? ""}
              onChange={(v) => setValue("fuente", v)}
              placeholder="Sin especificar"
            />
          </Field>

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
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear ruta"}
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
              "flex-1 h-8 px-3 text-xs font-medium rounded-md transition-colors",
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

function defaults(route: Route | undefined, defaultTipo?: TipoRuta): RouteFormValues {
  if (!route) {
    return {
      tipo: defaultTipo ?? "SIMPLE",
      origen_iata: "",
      destino_iata: "",
      millas_nauticas: 0,
      es_redondo_auto: true,
      num_aterrizajes: 2,
      tramos: [],
      fuente: "",
      notas: "",
    };
  }
  return {
    tipo: route.tipo,
    origen_iata: route.origen_iata,
    destino_iata: route.destino_iata,
    millas_nauticas: Number(route.millas_nauticas),
    es_redondo_auto: route.es_redondo_auto,
    num_aterrizajes: route.num_aterrizajes,
    tramos:
      route.tipo === "MULTIESCALA"
        ? route.tramos.map((t) => ({
            origen_iata: t.origen_iata,
            destino_iata: t.destino_iata,
            millas_nauticas: Number(t.millas_nauticas),
          }))
        : [],
    fuente: route.fuente ?? "",
    notas: route.notas ?? "",
  };
}
