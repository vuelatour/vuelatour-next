"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { assignFlightAction } from "@/app/admin/flights/actions";
import type { FlightListItem } from "@/types/flights";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
  velocidad_crucero_kts: number;
}

interface PilotOption {
  id: string;
  nombre: string;
  email: string;
}

interface AssignFormValues {
  aeronave_id: string;
  piloto_id: string;
  fecha_vuelo: string;
}

interface FlightAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flight: FlightListItem;
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}

function defaults(flight: FlightListItem): AssignFormValues {
  return {
    aeronave_id: flight.aeronave_id ?? "",
    piloto_id: flight.piloto_id ?? "",
    fecha_vuelo: flight.fecha_vuelo ? flight.fecha_vuelo.slice(0, 16) : "",
  };
}

export function FlightAssignSheet({
  open,
  onOpenChange,
  flight,
  aircraft,
  pilots,
}: FlightAssignSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { register, handleSubmit, watch, setValue, reset } =
    useForm<AssignFormValues>({
      defaultValues: defaults(flight),
    });

  useEffect(() => {
    if (open) reset(defaults(flight));
  }, [open, flight, reset]);

  const aeronaveId = watch("aeronave_id");
  const pilotoId = watch("piloto_id");

  const onSubmit = handleSubmit((values) => {
    const payload: {
      aeronave_id?: string;
      piloto_id?: string;
      fecha_vuelo?: string;
    } = {};
    if (!flight.es_externo && values.aeronave_id !== (flight.aeronave_id ?? "")) {
      payload.aeronave_id = values.aeronave_id || undefined;
    }
    if (values.piloto_id !== (flight.piloto_id ?? "")) {
      payload.piloto_id = values.piloto_id || undefined;
    }
    if (values.fecha_vuelo) {
      payload.fecha_vuelo = new Date(values.fecha_vuelo).toISOString();
    }
    if (Object.keys(payload).length === 0) {
      toast.info("No hay cambios que aplicar");
      return;
    }
    startTransition(async () => {
      const res = await assignFlightAction(flight.id, payload);
      if (res.ok) {
        toast.success("Asignación actualizada");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al asignar");
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
          <SheetTitle>Asignar vuelo #{flight.folio}</SheetTitle>
          <SheetDescription>
            Define avión, piloto y fecha programada. Necesarios para iniciar el vuelo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!flight.es_externo && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Aeronave</Label>
              <SearchableSelect
                options={[
                  { value: "", label: "Sin asignar" },
                  ...aircraft.map((a) => ({
                    value: a.id,
                    label: `${a.matricula} — ${a.modelo}`,
                    description: `${a.velocidad_crucero_kts} kts`,
                  })),
                ]}
                value={aeronaveId}
                onChange={(v) => setValue("aeronave_id", v)}
                placeholder="Selecciona aeronave"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Piloto</Label>
            <SearchableSelect
              options={[
                { value: "", label: "Sin asignar" },
                ...pilots.map((p) => ({
                  value: p.id,
                  label: p.nombre,
                  description: p.email,
                })),
              ]}
              value={pilotoId}
              onChange={(v) => setValue("piloto_id", v)}
              placeholder="Selecciona piloto"
              emptyText="Sin pilotos activos — crea uno en /admin/users"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha y hora del vuelo</Label>
            <Input type="datetime-local" {...register("fecha_vuelo")} />
            <p className="text-xs text-muted-foreground">
              Fecha programada. La hora real se registra en escalas.
            </p>
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
            {pending ? "Guardando…" : "Guardar asignación"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
