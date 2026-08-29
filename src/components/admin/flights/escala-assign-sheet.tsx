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
import type { FlightEscala, TripulanteRef } from "@/types/flights";
import { ApoyosField, mismoConjunto } from "./apoyos-field";

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

interface EscalaAssignFormValues {
  aeronave_id: string;
  piloto_id: string;
  /** "" = hereda el copiloto del vuelo (29-ago-2026). */
  copiloto_id: string;
  /** Apoyos SOLO de este tramo, 0..N. */
  apoyo_ids: string[];
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
  /** Piloto a nivel vuelo: el tramo sin piloto propio lo hereda (API), así
      que el select se prellena con él en vez de arrancar vacío. */
  vueloPilotoId?: string | null;
  /** Copiloto a nivel vuelo: el tramo sin copiloto propio lo hereda. */
  vueloCopilotoId?: string | null;
  vueloCopilotoNombre?: string | null;
  /** Apoyos de NIVEL VUELO: van en todos los tramos; aquí solo se muestran
      (se editan en «Piloto y tripulación»). */
  apoyosVuelo?: TripulanteRef[];
  /** Candidatos a apoyo (todos los usuarios activos); ausente = pilotos. */
  apoyoCandidatos?: PilotOption[];
}

function defaults(
  escala: FlightEscala,
  vueloAeronaveId?: string | null,
  vueloPilotoId?: string | null,
): EscalaAssignFormValues {
  return {
    // Si el tramo aún no tiene avión, se propone el de la cotización (el que
    // ya eligió quien cotizó): la oficina solo confirma. La ida y el regreso
    // pueden cambiarse a otro avión si hace falta.
    aeronave_id: escala.aeronave_id ?? vueloAeronaveId ?? "",
    // Sin piloto propio, el tramo hereda el del vuelo: se prellena con él
    // para que el select refleje quién vuela realmente el tramo.
    piloto_id: escala.piloto_id ?? vueloPilotoId ?? "",
    // "" = hereda: la opción vacía del select ya muestra al copiloto del
    // vuelo, así que no se materializa la herencia como copiloto propio.
    copiloto_id: escala.copiloto_id ?? "",
    apoyo_ids: (escala.apoyos_tramo ?? []).map((a) => a.id),
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
  vueloPilotoId,
  vueloCopilotoId,
  vueloCopilotoNombre,
  apoyosVuelo,
  apoyoCandidatos,
}: EscalaAssignSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dispo, setDispo] = useState<PilotoDisponibilidad[]>([]);

  const { register, handleSubmit, watch, setValue, reset } =
    useForm<EscalaAssignFormValues>({
      defaultValues: defaults(escala, vueloAeronaveId, vueloPilotoId),
    });

  useEffect(() => {
    if (open) reset(defaults(escala, vueloAeronaveId, vueloPilotoId));
  }, [open, escala, vueloAeronaveId, vueloPilotoId, reset]);

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
  const copilotoId = watch("copiloto_id");
  const apoyoIds = watch("apoyo_ids");
  // Copiloto que realmente va en el tramo: propio ?? del vuelo.
  const copilotoEfectivoId = copilotoId || vueloCopilotoId || "";
  const candidatos = apoyoCandidatos ?? pilots;
  // Apoyos del vuelo: chips fijos (van en todos los tramos) y fuera del
  // selector — agregarlos también al tramo sería redundante.
  const apoyosVueloIds = (apoyosVuelo ?? []).map((a) => a.id);
  const apoyosFijos = (apoyosVuelo ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre || candidatos.find((c) => c.id === a.id)?.nombre || "Usuario",
    sufijo: " (del vuelo)",
    title: "Apoyo de todo el vuelo: se quita en «Piloto y tripulación».",
  }));
  // Apoyos del tramo ya guardados (confirmar antes de quitar) y nombres de
  // respaldo por si alguno ya no está en el catálogo.
  const apoyosTramoGuardados = escala.apoyos_tramo ?? [];
  const apoyosTramoGuardadosIds = apoyosTramoGuardados.map((a) => a.id);
  const nombresApoyo = Object.fromEntries(
    apoyosTramoGuardados.filter((a) => a.nombre).map((a) => [a.id, a.nombre]),
  );
  const apoyosEnConflicto = apoyoIds.filter(
    (id) => id === pilotoId || id === copilotoEfectivoId,
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
    const copilotoEfectivo = values.copiloto_id || vueloCopilotoId || "";
    if (copilotoEfectivo && copilotoEfectivo === values.piloto_id) {
      toast.error(
        "El copiloto debe ser una persona distinta del piloto del tramo.",
      );
      return;
    }
    if (
      values.apoyo_ids.some(
        (id) => id === values.piloto_id || id === copilotoEfectivo,
      )
    ) {
      toast.error(
        "Los apoyos deben ser personas distintas del piloto y del copiloto del tramo.",
      );
      return;
    }
    const payload: {
      aeronave_id?: string;
      piloto_id?: string;
      copiloto_id?: string | null;
      apoyo_ids?: string[];
      fecha_salida_plan?: string;
    } = {};
    if (!esExterno && values.aeronave_id !== (escala.aeronave_id ?? "")) {
      payload.aeronave_id = values.aeronave_id || undefined;
    }
    // Se compara contra el prellenado (propio ?? heredado): guardar sin
    // cambiar el select NO materializa la herencia como piloto propio.
    if (values.piloto_id !== (escala.piloto_id ?? vueloPilotoId ?? "")) {
      payload.piloto_id = values.piloto_id || undefined;
    }
    if (values.copiloto_id !== (escala.copiloto_id ?? "")) {
      // null explícito = vuelve a heredar el copiloto del vuelo.
      payload.copiloto_id = values.copiloto_id || null;
    }
    if (!mismoConjunto(values.apoyo_ids, apoyosTramoGuardadosIds)) {
      // Lista completa del tramo (reemplaza): [] quita los del tramo; los
      // del vuelo no se tocan desde aquí.
      payload.apoyo_ids = values.apoyo_ids;
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
            asignan por separado (pueden llevar avión, piloto, copiloto y
            apoyos distintos).
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
            <p className="text-[11px] text-muted-foreground">
              Sin selección propia, el tramo hereda el piloto del vuelo.
              Asignar aquí solo cambia ESTE tramo (rotación).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Copiloto del tramo</Label>
            <SearchableSelect
              options={[
                {
                  value: "",
                  label: vueloCopilotoNombre
                    ? `Hereda del vuelo (${vueloCopilotoNombre})`
                    : "Hereda del vuelo (sin copiloto)",
                },
                ...pilotOptions.filter((o) => o.value !== pilotoId),
              ]}
              value={copilotoId}
              onChange={(v) => setValue("copiloto_id", v)}
              placeholder="Hereda del vuelo"
              emptyText="Sin pilotos activos"
            />
            {copilotoEfectivoId && copilotoEfectivoId === pilotoId && (
              <p className="flex items-start gap-1.5 text-xs text-destructive font-medium">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                El copiloto del vuelo es el piloto de este tramo: elige otro
                copiloto para el tramo.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Solo cambia ESTE tramo (rotación). El copiloto ve el tramo en
              su app y sí captura tacómetros.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Apoyo en tierra del tramo</Label>
            <ApoyosField
              value={apoyoIds}
              onChange={(ids) => setValue("apoyo_ids", ids)}
              candidatos={candidatos}
              excluir={[pilotoId, copilotoEfectivoId, ...apoyosVueloIds]}
              persistidos={apoyosTramoGuardadosIds}
              nombres={nombresApoyo}
              fijos={apoyosFijos}
              conflictos={apoyosEnConflicto}
              confirmDescripcion="Dejará de ser apoyo de este tramo (si también es apoyo del vuelo, lo sigue viendo). El cambio se aplica al guardar la asignación."
              emptyText="Sin apoyo en este tramo."
              disabled={pending}
            />
            {apoyosEnConflicto.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-destructive font-medium">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                Los apoyos deben ser personas distintas del piloto y del
                copiloto del tramo.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Los apoyos «(del vuelo)» van en todos los tramos y se editan en
              «Piloto y tripulación»; aquí solo agregas apoyos para ESTE
              tramo. No capturan tacómetros.
            </p>
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
