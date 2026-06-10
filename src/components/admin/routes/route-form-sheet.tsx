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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { QuoteLegsEditor } from "@/components/admin/quotes/quote-legs-editor";
import { RoutePreviewMap } from "@/components/admin/route-preview-map";
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
  latitud: number | null;
  longitud: number | null;
}

interface RouteFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoute?: Route;
  airports: AirportOption[];
  /** Conservado por compatibilidad con callers; ya no hay tipos de ruta. */
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
    defaultValues: defaults(initialRoute),
  });

  useEffect(() => {
    if (open) reset(defaults(initialRoute));
  }, [open, initialRoute, reset]);

  const tramos = watch("tramos") ?? [];

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
        className="data-[side=right]:w-full data-[side=right]:sm:w-[80vw] data-[side=right]:sm:max-w-[80vw] flex flex-col p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{isEdit ? "Editar ruta" : "Nueva ruta"}</SheetTitle>
          <SheetDescription>
            Arma el itinerario tramo por tramo, incluido el regreso si aplica
            (decisión operativa). El cotizador reusará esta ruta sumando millas y
            aterrizajes automáticamente.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {/* Columna izquierda: formulario */}
            <div className="space-y-4">
              <Field
                label="Tramos"
                required
                hint="Origen del siguiente tramo queda fijo al destino del anterior. Recuerda agregar el regreso a base si aplica."
                error={errors.tramos?.message}
              >
                <QuoteLegsEditor
                  value={tramos as EscalaInput[]}
                  onChange={(legs) => setValue("tramos", legs, { shouldValidate: true })}
                  airports={airports}
                />
              </Field>

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
            </div>

            {/* Columna derecha: mapa del itinerario (sticky, se actualiza en vivo) */}
            <div className="hidden lg:block">
              <div className="sticky top-0 space-y-2">
                <Label className="text-sm font-medium">Itinerario planeado</Label>
                <RoutePreviewMap
                  airports={airports}
                  legs={(tramos as EscalaInput[]).map((t) => ({
                    origen_iata: t.origen_iata,
                    destino_iata: t.destino_iata,
                    es_ferry: t.es_ferry,
                    requiere_pernocta: t.requiere_pernocta,
                    tipo_parada: t.tipo_parada,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Cada tramo se numera en orden; los ferry se dibujan punteados y
                  las paradas con pernocta o servicio se marcan en su aeropuerto.
                </p>
              </div>
            </div>
          </div>
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

function defaults(route: Route | undefined): RouteFormValues {
  if (!route) {
    return { tramos: [], fuente: "", notas: "" };
  }
  // Ruta legacy SIMPLE (redondo automático): se prellenan los 2 tramos
  // equivalentes (ida + regreso) para editarla como personalizada.
  if (route.tipo === "SIMPLE") {
    const nm = Number(route.millas_nauticas);
    const ida = {
      origen_iata: route.origen_iata,
      destino_iata: route.destino_iata,
      millas_nauticas: nm,
    };
    const regreso = {
      origen_iata: route.destino_iata,
      destino_iata: route.origen_iata,
      millas_nauticas: nm,
    };
    return {
      tramos: route.es_redondo_auto ? [ida, regreso] : [ida],
      fuente: route.fuente ?? "",
      notas: route.notas ?? "",
    };
  }
  return {
    tramos: route.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: t.requiere_pernocta,
      pernocta_costo_usd:
        t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
      tipo_parada: t.tipo_parada,
      servicio_notas: t.servicio_notas,
    })),
    fuente: route.fuente ?? "",
    notas: route.notas ?? "",
  };
}
