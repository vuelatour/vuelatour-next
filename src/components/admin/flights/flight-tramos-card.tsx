"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import {
  deleteEscalaAction,
  updateEscalaPermisoAction,
} from "@/app/admin/flights/actions";
import { EscalaAssignSheet } from "./escala-assign-sheet";
import { EscalaFormSheet } from "./escala-form-sheet";
import { OperationalLegSheet } from "./operational-leg-sheet";
import type { EstadoVuelo } from "@/types/quotes-persisted";
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

interface AirportOption {
  iata: string;
  nombre: string;
}

interface FlightTramosCardProps {
  flightId: string;
  flightFolio: number;
  esExterno: boolean;
  estado: EstadoVuelo;
  escalas: FlightEscala[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  airports?: AirportOption[];
}

/** Etiqueta del tramo: 2 tramos = Ida/Regreso (redondo); más = Tramo N. */
function tramoLabel(escala: FlightEscala, total: number): string {
  if (total === 2) return escala.orden === 1 ? "Ida" : "Regreso";
  return `Tramo ${escala.orden}`;
}

export function FlightTramosCard({
  flightId,
  flightFolio,
  esExterno,
  estado,
  escalas,
  aircraft,
  pilots,
  airports = [],
}: FlightTramosCardProps) {
  const router = useRouter();
  const [assignEscala, setAssignEscala] = useState<FlightEscala | null>(null);
  const [editEscala, setEditEscala] = useState<FlightEscala | null>(null);
  const [toDelete, setToDelete] = useState<FlightEscala | null>(null);
  const [opSheetOpen, setOpSheetOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [permisoPending, startPermiso] = useTransition();
  // Espejo del API: la operación (avión/piloto/fecha del tramo) se edita en
  // cualquier estado operable — incluida la RESERVA del vuelo rápido; solo se
  // cierra al COMPLETAR o CANCELAR.
  const canAssign = estado !== "COMPLETADO" && estado !== "CANCELADO";

  const ordered = [...escalas].sort((a, b) => a.orden - b.orden);

  const handlePermisoEmitido = (escala: FlightEscala) => {
    startPermiso(async () => {
      const res = await updateEscalaPermisoAction(flightId, escala.id, "emitido");
      if (res.ok) {
        toast.success("Permiso de pista del tramo marcado como emitido");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo actualizar el permiso");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <PaperAirplaneIcon className="h-4 w-4 text-muted-foreground" />
          Asignación por tramo
        </CardTitle>
        {canAssign && !esExterno && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpSheetOpen(true)}
            className="h-7 gap-1 text-xs shrink-0"
            title="Movimiento real que NO se cobra al cliente (ferry, parada técnica, pernocta operativa)."
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Agregar tramo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {ordered.map((escala) => {
          const label = tramoLabel(escala, ordered.length);
          const sinAvion = !esExterno && !escala.aeronave_id;
          const sinPiloto = !escala.piloto_id;
          const sinAsignar = sinAvion || sinPiloto;
          return (
            <div
              key={escala.id}
              id={`tramo-${escala.id}`}
              className="scroll-mt-24 rounded-lg border border-border p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {label}
                  </Badge>
                  <span className="font-mono text-sm">
                    {escala.origen_iata} → {escala.destino_iata}
                  </span>
                  {!esExterno && estado === "CONFIRMADO" && sinAsignar && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                    >
                      ⚠ {sinPiloto ? "Falta piloto" : "Falta avión"}
                    </Badge>
                  )}
                  {escala.estado_permiso === "pendiente" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    >
                      ⚠ Permiso pendiente
                    </Badge>
                  )}
                  {escala.estado_permiso === "emitido" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                    >
                      Permiso emitido
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {!esExterno &&
                    escala.estado_permiso === "pendiente" &&
                    canAssign && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePermisoEmitido(escala)}
                        disabled={permisoPending}
                        className="h-7 gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs"
                      >
                        <FlagIcon className="h-3.5 w-3.5" />
                        Permiso emitido
                      </Button>
                    )}
                  {canAssign && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAssignEscala(escala)}
                      className={`h-7 gap-1 text-xs ${
                        sinAsignar
                          ? "border-violet-500/50 text-violet-600 dark:text-violet-400"
                          : ""
                      }`}
                    >
                      <UserPlusIcon className="h-3.5 w-3.5" />
                      {sinAsignar ? "Asignar" : "Reasignar"}
                    </Button>
                  )}
                  {canAssign && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <EllipsisHorizontalIcon className="h-4 w-4" />
                        <span className="sr-only">Acciones del tramo</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditEscala(escala)}
                          className="gap-2"
                        >
                          <PencilIcon className="h-4 w-4" />
                          Editar tramo (ruta, fecha, notas)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setToDelete(escala)}
                          disabled={!!(escala.taco_salida || escala.taco_llegada)}
                          title={
                            escala.taco_salida || escala.taco_llegada
                              ? "Tiene tacómetro capturado: no se puede borrar (auditoría)."
                              : undefined
                          }
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Eliminar tramo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1 text-sm">
                <Field label="Aeronave">
                  {esExterno ? (
                    <span className="text-muted-foreground">N/A (externo)</span>
                  ) : escala.aeronave_matricula ? (
                    <span className="font-mono font-semibold">
                      {escala.aeronave_matricula}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin asignar</span>
                  )}
                </Field>
                <Field label="Piloto">
                  {escala.piloto_nombre ? (
                    <span>{escala.piloto_nombre}</span>
                  ) : (
                    <span className="text-muted-foreground">Sin asignar</span>
                  )}
                </Field>
                <Field label="Salida">
                  {escala.fecha_salida_plan ? (
                    fmtDateTime(escala.fecha_salida_plan)
                  ) : (
                    <span className="text-muted-foreground">Sin fecha</span>
                  )}
                </Field>
              </div>
            </div>
          );
        })}
        <p className="px-1 text-[11px] text-muted-foreground">{TZ_LABEL}</p>
      </CardContent>

      {assignEscala && (
        <EscalaAssignSheet
          open={!!assignEscala}
          onOpenChange={(o) => !o && setAssignEscala(null)}
          flightId={flightId}
          flightFolio={flightFolio}
          esExterno={esExterno}
          tramoLabel={tramoLabel(assignEscala, ordered.length)}
          escala={assignEscala}
          aircraft={aircraft}
          pilots={pilots}
        />
      )}

      {editEscala && (
        <EscalaFormSheet
          open={!!editEscala}
          onOpenChange={(o) => !o && setEditEscala(null)}
          flightId={flightId}
          flightFolio={flightFolio}
          airports={airports}
          takenOrdenes={ordered.map((e) => e.orden)}
          initialEscala={editEscala}
        />
      )}

      <OperationalLegSheet
        open={opSheetOpen}
        onOpenChange={setOpSheetOpen}
        flightId={flightId}
        airports={airports}
      />

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar este tramo?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${toDelete.origen_iata} → ${toDelete.destino_iata}. `
                : ""}
              Úsalo cuando el tramo ya no se va a volar. Se quita de la ruta
              operativa, del calendario y de la app del piloto. Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!toDelete) return;
                startDelete(async () => {
                  const res = await deleteEscalaAction(flightId, toDelete.id);
                  if (res.ok) {
                    toast.success("Tramo eliminado");
                    setToDelete(null);
                    router.refresh();
                  } else {
                    toast.error(res.error ?? "No se pudo eliminar");
                  }
                });
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
