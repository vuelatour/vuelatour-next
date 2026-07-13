"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { cancunInputToIso, isoToCancunInput, TZ_LABEL } from "@/lib/datetime";
import {
  assignEscalaAction,
  getPilotosDisponibilidadAction,
  type PilotoDisponibilidad,
} from "@/app/admin/flights/actions";
import type { FlightEscala } from "@/types/flights";

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

interface EscalaAssignFormValues {
  aeronave_id: string;
  piloto_id: string;
  fecha_salida_plan: string;
}

interface EscalaAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flightId: string;
  flightFolio: number;
  esExterno: boolean;
  tramoLabel: string;
  escala: FlightEscala;
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  /** Aeronave del vuelo (de la cotización): default cuando el tramo no tiene una. */
  vueloAeronaveId?: string | null;
}

function defaults(
  escala: FlightEscala,
  vueloAeronaveId?: string | null,
): EscalaAssignFormValues {
  return {
    // Si el tramo aún no tiene avión, se propone el de la cotización (el que
    // ya eligió quien cotizó): la oficina solo confirma. La ida y el regreso
    // pueden cambiarse a otro avión si hace falta.
    aeronave_id: escala.aeronave_id ?? vueloAeronaveId ?? "",
    piloto_id: escala.piloto_id ?? "",
    fecha_salida_plan: isoToCancunInput(escala.fecha_salida_plan),
  };
}

export function EscalaAssignSheet({
  open,
  onOpenChange,
  flightId,
  flightFolio,
  esExterno,
  tramoLabel,
  escala,
  aircraft,
  pilots,
  vueloAeronaveId,
}: EscalaAssignSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dispo, setDispo] = useState<PilotoDisponibilidad[]>([]);

  const { register, handleSubmit, watch, setValue, reset } =
    useForm<EscalaAssignFormValues>({
      defaultValues: defaults(escala, vueloAeronaveId),
    });

  useEffect(() => {
    if (open) reset(defaults(escala, vueloAeronaveId));
  }, [open, escala, vueloAeronaveId, reset]);

  // Disponibilidad de pilotos (conflicto de día + horas del mes) al abrir.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDispo([]);
    getPilotosDisponibilidadAction(flightId).then((res) => {
      if (!cancelled && res.ok && res.data) setDispo(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, flightId]);

  const aeronaveId = watch("aeronave_id");
  const pilotoId = watch("piloto_id");
  const dispoById = new Map(dispo.map((d) => [d.id, d]));
  const selectedPiloto = pilotoId ? dispoById.get(pilotoId) : undefined;

  const pilotOptions = pilots
    .map((p) => {
      const d = dispoById.get(p.id);
      let description = p.email;
      let rank = 0;
      if (d) {
        if (d.conflicto) {
          description = `⚠ Ya tiene el vuelo #${d.conflicto_folio} ese día`;
          rank = 3;
        } else if (d.excede_limite) {
          description = `⚠ ${d.horas_mes} h este mes (excede ${d.limite_horas_mes})`;
          rank = 2;
        } else if (d.cerca_limite) {
          description = `${d.horas_mes} h este mes (cerca de ${d.limite_horas_mes})`;
          rank = 1;
        } else {
          description = `${d.horas_mes} h este mes`;
        }
      }
      return { value: p.id, label: p.nombre, description, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));

  const onSubmit = handleSubmit((values) => {
    const payload: {
      aeronave_id?: string;
      piloto_id?: string;
      fecha_salida_plan?: string;
    } = {};
    if (!esExterno && values.aeronave_id !== (escala.aeronave_id ?? "")) {
      payload.aeronave_id = values.aeronave_id || undefined;
    }
    if (values.piloto_id !== (escala.piloto_id ?? "")) {
      payload.piloto_id = values.piloto_id || undefined;
    }
    if (values.fecha_salida_plan) {
      payload.fecha_salida_plan = cancunInputToIso(values.fecha_salida_plan);
    }
    if (Object.keys(payload).length === 0) {
      toast.info("No hay cambios que aplicar");
      return;
    }
    startTransition(async () => {
      const res = await assignEscalaAction(flightId, escala.id, payload);
      if (res.ok) {
        toast.success(`${tramoLabel} actualizado`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al asignar el tramo");
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
            Asignar {tramoLabel} · vuelo #{flightFolio}
          </SheetTitle>
          <SheetDescription>
            {escala.origen_iata} → {escala.destino_iata}. La ida y el regreso se
            asignan por separado (pueden llevar avión y piloto distintos).
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!esExterno && (
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
              {/* El avión viene de la cotización; solo se cambia si este tramo
                  lo vuela otra matrícula. */}
              {!escala.aeronave_id && vueloAeronaveId && aeronaveId === vueloAeronaveId && (
                <p className="text-xs text-muted-foreground">
                  Propuesta de la cotización · cámbiala solo si este tramo vuela con otro avión.
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Piloto</Label>
            <SearchableSelect
              options={[{ value: "", label: "Sin asignar" }, ...pilotOptions]}
              value={pilotoId}
              onChange={(v) => setValue("piloto_id", v)}
              placeholder="Selecciona piloto"
              emptyText="Sin pilotos activos — crea uno en /admin/users"
            />
            {selectedPiloto?.conflicto && (
              <p className="flex items-start gap-1.5 text-xs text-destructive font-medium">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                Este piloto ya tiene el vuelo #{selectedPiloto.conflicto_folio} ese día.
              </p>
            )}
            {selectedPiloto && !selectedPiloto.conflicto && selectedPiloto.excede_limite && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                Lleva {selectedPiloto.horas_mes} h este mes — excede el límite informativo de{" "}
                {selectedPiloto.limite_horas_mes} h.
              </p>
            )}
            {selectedPiloto &&
              !selectedPiloto.conflicto &&
              !selectedPiloto.excede_limite &&
              selectedPiloto.cerca_limite && (
                <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
                  Lleva {selectedPiloto.horas_mes} h este mes — cerca del límite de{" "}
                  {selectedPiloto.limite_horas_mes} h.
                </p>
              )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha y hora del tramo</Label>
            <Input type="datetime-local" {...register("fecha_salida_plan")} />
            <p className="text-xs text-muted-foreground">
              Salida programada del tramo en {TZ_LABEL}.
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
