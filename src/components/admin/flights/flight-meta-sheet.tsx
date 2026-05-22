"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateFlightAction } from "@/app/admin/flights/actions";
import type { FlightListItem } from "@/types/flights";

interface PilotOption {
  id: string;
  nombre: string;
  email: string;
}

type EstadoPermiso = "no_aplica" | "pendiente" | "emitido";

interface MetaFormValues {
  piloto_id: string;
  fecha_vuelo: string;
  fecha_traslado_final: string;
  estado_permiso: EstadoPermiso;
  notas: string;
  notas_internas: string;
  facturado: boolean;
  cobrado: boolean;
}

const PERMISO_OPTS: { value: EstadoPermiso; label: string; description: string }[] = [
  { value: "no_aplica", label: "No aplica", description: "Ruta sin pista que requiera permiso" },
  { value: "pendiente", label: "Pendiente", description: "Permiso por tramitar (evento en color de alerta)" },
  { value: "emitido", label: "Emitido", description: "Permiso ya emitido (color normal)" },
];

function defaults(flight: FlightListItem): MetaFormValues {
  return {
    piloto_id: flight.piloto_id ?? "",
    fecha_vuelo: flight.fecha_vuelo ? flight.fecha_vuelo.slice(0, 16) : "",
    fecha_traslado_final: flight.fecha_traslado_final
      ? flight.fecha_traslado_final.slice(0, 16)
      : "",
    estado_permiso: flight.estado_permiso,
    notas: flight.notas ?? "",
    notas_internas: flight.notas_internas ?? "",
    facturado: flight.facturado,
    cobrado: flight.cobrado,
  };
}

interface FlightMetaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flight: FlightListItem;
  pilots: PilotOption[];
}

export function FlightMetaSheet({
  open,
  onOpenChange,
  flight,
  pilots,
}: FlightMetaSheetProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { register, handleSubmit, reset, watch, setValue } =
    useForm<MetaFormValues>({
      defaultValues: defaults(flight),
    });

  useEffect(() => {
    if (open) reset(defaults(flight));
  }, [open, flight, reset]);

  const pilotoId = watch("piloto_id");
  const estadoPermiso = watch("estado_permiso");
  const facturado = watch("facturado");
  const cobrado = watch("cobrado");

  const onSubmit = handleSubmit((values) => {
    const payload: {
      piloto_id?: string | null;
      fecha_vuelo?: string;
      fecha_traslado_final?: string;
      estado_permiso?: EstadoPermiso;
      notas?: string;
      notas_internas?: string;
      facturado?: boolean;
      cobrado?: boolean;
    } = {};

    // Solo enviar lo que cambió.
    if (values.piloto_id !== (flight.piloto_id ?? "")) {
      payload.piloto_id = values.piloto_id || null;
    }
    if (values.fecha_vuelo) {
      const next = new Date(values.fecha_vuelo).toISOString();
      const prev = flight.fecha_vuelo
        ? new Date(flight.fecha_vuelo).toISOString()
        : null;
      if (next !== prev) payload.fecha_vuelo = next;
    }
    if (values.fecha_traslado_final) {
      const next = new Date(values.fecha_traslado_final).toISOString();
      const prev = flight.fecha_traslado_final
        ? new Date(flight.fecha_traslado_final).toISOString()
        : null;
      if (next !== prev) payload.fecha_traslado_final = next;
    }
    if (values.estado_permiso !== flight.estado_permiso) {
      payload.estado_permiso = values.estado_permiso;
    }
    if (values.notas !== (flight.notas ?? "")) payload.notas = values.notas;
    if (values.notas_internas !== (flight.notas_internas ?? ""))
      payload.notas_internas = values.notas_internas;
    if (values.facturado !== flight.facturado) payload.facturado = values.facturado;
    if (values.cobrado !== flight.cobrado) payload.cobrado = values.cobrado;

    if (Object.keys(payload).length === 0) {
      toast.info("No hay cambios que aplicar");
      return;
    }
    startTransition(async () => {
      const res = await updateFlightAction(flight.id, payload);
      if (res.ok) {
        toast.success("Vuelo actualizado");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar");
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
          <SheetTitle>Editar vuelo #{flight.folio}</SheetTitle>
          <SheetDescription>
            Edita metadatos del vuelo. Para reasignar avión usa &ldquo;Asignar&rdquo;
            (solo disponible en CONFIRMADO/COTIZADO).
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
              emptyText="Sin pilotos activos"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha de traslado inicial</Label>
            <Input type="datetime-local" {...register("fecha_vuelo")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha de traslado final</Label>
            <Input type="datetime-local" {...register("fecha_traslado_final")} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Permiso de pista</Label>
            <SearchableSelect
              options={PERMISO_OPTS.map((o) => ({
                value: o.value,
                label: o.label,
                description: o.description,
              }))}
              value={estadoPermiso}
              onChange={(v) => setValue("estado_permiso", v as EstadoPermiso)}
              placeholder="Estado del permiso"
            />
            <p className="text-xs text-muted-foreground">
              Pendiente pinta el evento del calendario en color de alerta hasta emitirlo.
            </p>
          </div>

          {flight.foto_plan_vuelo_url && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Plan de vuelo</Label>
              <a
                href={flight.foto_plan_vuelo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:underline break-all"
              >
                Ver foto del plan de vuelo
              </a>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Notas (visibles en PDF)</Label>
            <Textarea
              rows={2}
              placeholder="Información que ve el cliente"
              {...register("notas")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Notas internas</Label>
            <Textarea
              rows={2}
              placeholder="Solo equipo"
              {...register("notas_internas")}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Flags administrativos
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Facturado</Label>
                <p className="text-xs text-muted-foreground">
                  Marca como facturado al cliente. Lo controla normalmente el área
                  de facturación.
                </p>
              </div>
              <Switch
                checked={facturado}
                onCheckedChange={(c) => setValue("facturado", c)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Cobrado</Label>
                <p className="text-xs text-muted-foreground">
                  Se actualiza automático cuando la suma de cobros cubre el total.
                  Aquí puedes forzarlo si hace falta.
                </p>
              </div>
              <Switch
                checked={cobrado}
                onCheckedChange={(c) => setValue("cobrado", c)}
              />
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
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
