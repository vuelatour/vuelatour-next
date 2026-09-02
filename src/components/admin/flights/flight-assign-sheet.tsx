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
  assignFlightAction,
  getPilotosDisponibilidadAction,
  type AssignFlightPayload,
  type PilotoDisponibilidad,
} from "@/app/admin/flights/actions";
import { apoyosDeVuelo, type FlightListItem } from "@/types/flights";
import { ApoyosField, mismoConjunto } from "./apoyos-field";
import { SquawkAltaDialog, squawkAltaDe } from "./squawk-alta-dialog";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
  velocidad_crucero_kts: number;
}

interface PilotOption {
  id: string;
  nombre: string;
  email: string | null;
}

interface AssignFormValues {
  aeronave_id: string;
  piloto_id: string;
  copiloto_id: string;
  /** Apoyos de nivel vuelo, 0..N (29-ago-2026). */
  apoyo_ids: string[];
  fecha_vuelo: string;
}

interface FlightAssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flight: FlightListItem;
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  /** Candidatos a apoyo (todos los roles activos); ausente = pilotos. */
  apoyoCandidatos?: PilotOption[];
}

function defaults(flight: FlightListItem): AssignFormValues {
  return {
    aeronave_id: flight.aeronave_id ?? "",
    piloto_id: flight.piloto_id ?? "",
    copiloto_id: flight.copiloto_id ?? "",
    // Lista del API nuevo o el espejo apoyo_id del previo.
    apoyo_ids: apoyosDeVuelo(flight).map((a) => a.id),
    fecha_vuelo: isoToCancunInput(flight.fecha_vuelo),
  };
}

/**
 * Payload de apoyos tolerante al deploy no simultáneo: con 0 o 1 apoyo se
 * manda el campo LEGADO `apoyo_id` (lo entienden el API previo y el nuevo,
 * que lo traduce a `apoyo_ids`); solo con 2+ se manda `apoyo_ids`, que el
 * API previo rechazaría (forbidNonWhitelisted).
 */
function apoyosPayload(ids: string[]): { apoyo_id?: string | null; apoyo_ids?: string[] } {
  return ids.length <= 1 ? { apoyo_id: ids[0] ?? null } : { apoyo_ids: ids };
}

export function FlightAssignSheet({
  open,
  onOpenChange,
  flight,
  aircraft,
  pilots,
  apoyoCandidatos,
}: FlightAssignSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dispo, setDispo] = useState<PilotoDisponibilidad[]>([]);
  // Candado de squawk ALTA: guarda el payload rechazado para reintentarlo
  // con la bandera si la oficina confirma en el diálogo.
  const [squawk, setSquawk] = useState<{
    lista: string[];
    payload: AssignFlightPayload;
  } | null>(null);

  const { register, handleSubmit, watch, setValue, reset } =
    useForm<AssignFormValues>({
      defaultValues: defaults(flight),
    });

  useEffect(() => {
    if (open) reset(defaults(flight));
  }, [open, flight, reset]);

  // Disponibilidad de pilotos (conflicto de día + horas del mes) al abrir.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDispo([]);
    getPilotosDisponibilidadAction(flight.id).then((res) => {
      if (!cancelled && res.ok && res.data) setDispo(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, flight.id]);

  const aeronaveId = watch("aeronave_id");
  const pilotoId = watch("piloto_id");
  const copilotoId = watch("copiloto_id");
  const apoyoIds = watch("apoyo_ids");
  // Puede quedar en conflicto si el apoyo se eligió primero y luego el
  // piloto/copiloto cambió a la misma persona (el selector ya la filtra).
  const apoyosEnConflicto = apoyoIds.filter(
    (id) => id === pilotoId || id === copilotoId,
  );
  // Apoyos ya guardados (confirmar antes de quitar) y sus nombres de
  // respaldo por si alguno ya no está en el catálogo de candidatos.
  const apoyosGuardados = apoyosDeVuelo(flight);
  const apoyosGuardadosIds = apoyosGuardados.map((a) => a.id);
  const nombresApoyo = Object.fromEntries(
    apoyosGuardados.filter((a) => a.nombre).map((a) => [a.id, a.nombre]),
  );
  const dispoById = new Map(dispo.map((d) => [d.id, d]));
  const selectedPiloto = pilotoId ? dispoById.get(pilotoId) : undefined;

  const pilotOptions = pilots
    .map((p) => {
      const d = dispoById.get(p.id);
      let description = p.email ?? undefined;
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
    // El API también lo valida; aquí se corta antes con mensaje claro.
    if (
      values.apoyo_ids.some(
        (id) => id === values.piloto_id || id === values.copiloto_id,
      )
    ) {
      toast.error(
        "Los apoyos deben ser personas distintas del piloto y del copiloto.",
      );
      return;
    }
    const payload: AssignFlightPayload = {};
    if (!flight.es_externo && values.aeronave_id !== (flight.aeronave_id ?? "")) {
      payload.aeronave_id = values.aeronave_id || undefined;
    }
    if (values.piloto_id !== (flight.piloto_id ?? "")) {
      payload.piloto_id = values.piloto_id || undefined;
    }
    if (values.copiloto_id !== (flight.copiloto_id ?? "")) {
      // null explícito para quitar el copiloto (string vacío).
      payload.copiloto_id = values.copiloto_id || null;
    }
    if (!mismoConjunto(values.apoyo_ids, apoyosGuardadosIds)) {
      // Lista completa (reemplaza): [] quita a todos.
      Object.assign(payload, apoyosPayload(values.apoyo_ids));
    }
    if (values.fecha_vuelo) {
      payload.fecha_vuelo = cancunInputToIso(values.fecha_vuelo);
    }
    if (Object.keys(payload).length === 0) {
      toast.info("No hay cambios que aplicar");
      return;
    }
    ejecutar(payload, false);
  });

  /** Guarda la asignación; con `aceptarSquawk` reintenta pese al squawk ALTA
   *  (confirmado en el diálogo — el API avisa al mecánico). */
  const ejecutar = (payload: AssignFlightPayload, aceptarSquawk: boolean) => {
    startTransition(async () => {
      const res = await assignFlightAction(
        flight.id,
        aceptarSquawk ? { ...payload, aceptar_discrepancia_alta: true } : payload,
      );
      if (res.ok) {
        toast.success(
          aceptarSquawk
            ? "Asignación actualizada — se avisó al mecánico de las discrepancias abiertas"
            : "Asignación actualizada",
        );
        setSquawk(null);
        onOpenChange(false);
        router.refresh();
      } else {
        // Candado de squawk ALTA (solo aplica si se está asignando avión):
        // se confirma en el diálogo y se reintenta con la bandera.
        const lista =
          !aceptarSquawk && payload.aeronave_id ? squawkAltaDe(res) : null;
        if (lista) {
          setSquawk({ lista, payload });
          return;
        }
        setSquawk(null);
        toast.error(res.error ?? "Error al asignar");
      }
    });
  };

  return (
    <>
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
          <SheetTitle>Tripulación del vuelo #{flight.folio}</SheetTitle>
          <SheetDescription>
            Avión, piloto y fecha programada (necesarios para iniciar el vuelo), más
            copiloto y apoyos en tierra si van.
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
            <p className="text-[11px] text-muted-foreground">
              El estado muestra conflicto de horario ese día y horas voladas del mes (límite
              informativo 90 h; no bloquea).
            </p>
            <p className="text-[11px] text-muted-foreground">
              Al reasignar el piloto aquí se aplica a TODOS los tramos del
              vuelo; para cambiarlo solo en un tramo usa «Reasignar» en
              Asignación por tramo.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Copiloto (opcional)</Label>
            <SearchableSelect
              options={[
                { value: "", label: "Sin copiloto" },
                ...pilotOptions.filter((o) => o.value !== pilotoId),
              ]}
              value={copilotoId}
              onChange={(v) => setValue("copiloto_id", v)}
              placeholder="Selecciona copiloto"
              emptyText="Sin pilotos activos"
            />
            <p className="text-[11px] text-muted-foreground">
              Cuando van 2 pilotos. El copiloto ve todo el vuelo en su app igual que el piloto.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Apoyo en tierra (opcional · pueden ser varios)
            </Label>
            {/* Apoyo: cualquier usuario activo (pedido 29-ago), con su rol en
                el nombre para distinguir; sin semáforo de horas (no vuela). */}
            <ApoyosField
              value={apoyoIds}
              onChange={(ids) => setValue("apoyo_ids", ids)}
              candidatos={apoyoCandidatos ?? pilots}
              excluir={[pilotoId, copilotoId]}
              persistidos={apoyosGuardadosIds}
              nombres={nombresApoyo}
              conflictos={apoyosEnConflicto}
              confirmDescripcion="Dejará de ser apoyo de todo el vuelo: ya no lo verá en su app y se le avisará. El cambio se aplica al guardar la asignación."
              emptyText="Sin apoyo en tierra."
              disabled={pending}
            />
            {apoyosEnConflicto.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-destructive font-medium">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                Los apoyos deben ser personas distintas del piloto y del copiloto.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Van al aeropuerto a apoyar (maletas, pagos, cobros, gastos). Ven
              el vuelo como el piloto en su app, pero no capturan tacómetros.
              Aplican a TODOS los tramos; para un apoyo solo en un tramo usa
              «Reasignar» en Asignación por tramo.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha y hora del vuelo</Label>
            <Input type="datetime-local" {...register("fecha_vuelo")} />
            <p className="text-xs text-muted-foreground">
              Fecha programada en {TZ_LABEL}. La hora real se registra en escalas.
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

    {/* Candado de squawk ALTA del avión elegido: confirmar para asignar de
        todas formas (reintento con la bandera; el API avisa al mecánico). */}
    <SquawkAltaDialog
      lista={squawk?.lista ?? null}
      pending={pending}
      onCancel={() => setSquawk(null)}
      onConfirm={() => squawk && ejecutar(squawk.payload, true)}
    />
    </>
  );
}
