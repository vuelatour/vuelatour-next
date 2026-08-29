"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUturnLeftIcon,
  EllipsisHorizontalIcon,
  NoSymbolIcon,
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
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime, TZ_LABEL } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  cancelEscalaAction,
  deleteEscalaAction,
  restoreEscalaAction,
  updateEscalaPermisoAction,
} from "@/app/admin/flights/actions";
import { EscalaAssignSheet } from "./escala-assign-sheet";
import { EscalaFormSheet } from "./escala-form-sheet";
import { OperationalLegSheet } from "./operational-leg-sheet";
import type { EstadoVuelo } from "@/types/quotes-persisted";
import {
  apoyosEfectivosDeTramo,
  type FlightEscala,
  type TripulanteRef,
} from "@/types/flights";

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
  /** Aeronave del vuelo (cotización): default al asignar tramos sin avión. */
  vueloAeronaveId?: string | null;
  /** Piloto a nivel vuelo: un tramo sin piloto propio lo HEREDA (la API ya
      opera así) — se muestra como herencia, nunca como "falta". */
  vueloPilotoId?: string | null;
  vueloPilotoNombre?: string | null;
  /** Copiloto a nivel vuelo: un tramo sin copiloto propio lo HEREDA. */
  vueloCopilotoId?: string | null;
  vueloCopilotoNombre?: string | null;
  /** Apoyos de NIVEL VUELO (van en todos los tramos, "(del vuelo)"). */
  apoyosVuelo?: TripulanteRef[];
  /** Candidatos a apoyo por tramo (todos los usuarios activos). */
  apoyoCandidatos?: PilotOption[];
}

/** Etiqueta del tramo por POSICIÓN visible (1..N): el orden interno puede
 * ser >=100 (tramos operativos agregados a mano, rango reservado para que el
 * cotizador no los pise) y "Tramo 100" confundía. 2 tramos = Ida/Regreso. */
function tramoLabel(posicion: number, total: number): string {
  if (total === 2) return posicion === 1 ? "Ida" : "Regreso";
  return `Tramo ${posicion}`;
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
  vueloAeronaveId,
  vueloPilotoId,
  vueloPilotoNombre,
  vueloCopilotoId,
  vueloCopilotoNombre,
  apoyosVuelo = [],
  apoyoCandidatos,
}: FlightTramosCardProps) {
  const router = useRouter();
  const [assignEscala, setAssignEscala] = useState<FlightEscala | null>(null);
  const [editEscala, setEditEscala] = useState<FlightEscala | null>(null);
  // Editar un tramo de un vuelo COMPLETADO pide confirmación primero: los
  // cambios tocan datos de un vuelo ya cerrado.
  const [confirmEdit, setConfirmEdit] = useState<FlightEscala | null>(null);
  const [toDelete, setToDelete] = useState<FlightEscala | null>(null);
  const [toCancel, setToCancel] = useState<FlightEscala | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [toRestore, setToRestore] = useState<FlightEscala | null>(null);
  const [restoreMotivo, setRestoreMotivo] = useState("");
  const [opSheetOpen, setOpSheetOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [canceling, startCancel] = useTransition();
  const [restoring, startRestore] = useTransition();
  const [permisoPending, startPermiso] = useTransition();
  // Espejo del API: la operación (avión/piloto/fecha del tramo) se edita en
  // cualquier estado operable — incluida la RESERVA del vuelo rápido; solo se
  // cierra al COMPLETAR o CANCELAR.
  const canAssign = estado !== "COMPLETADO" && estado !== "CANCELADO";
  // Tramo extra en vuelo COMPLETADO (regla del cliente): al terminar la ruta
  // el cliente a veces pide ir a otro lado y se considera parte del MISMO
  // vuelo. El API pide motivo y regresa el vuelo a EN_VUELO hasta que el
  // piloto capture la llegada. Solo un vuelo CANCELADO (o externo, sin
  // operación propia) lo bloquea.
  const puedeAgregarTramo = !esExterno && estado !== "CANCELADO";
  // Cancelar/restaurar un TRAMO sí procede aunque el vuelo esté COMPLETADO
  // (caso #74: la deducción fabricó lecturas de un regreso que nunca voló y
  // se detectó ya cerrado el vuelo). El candado real es la evidencia
  // (llegada real/fotos), no el estado. Solo un vuelo CANCELADO entero
  // congela sus tramos.
  const puedeCancelarTramo = estado !== "CANCELADO";

  const ordered = [...escalas].sort((a, b) => a.orden - b.orden);

  // Tramo que "sale" antes que el tramo anterior (dedazo al capturar la
  // fecha, caso real: folio 10): descuadra el calendario del piloto y los
  // reportes — se señala en ámbar en vez de pasar en silencio.
  const saleAntesQueElAnterior = (idx: number): boolean => {
    const cur = ordered[idx]?.fecha_salida_plan;
    if (!cur) return false;
    for (let i = idx - 1; i >= 0; i--) {
      const prev = ordered[i].fecha_salida_plan;
      if (prev) return new Date(cur).getTime() < new Date(prev).getTime();
    }
    return false;
  };

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

  const handleRestore = () => {
    if (!toRestore) return;
    startRestore(async () => {
      const res = await restoreEscalaAction(
        flightId,
        toRestore.id,
        restoreMotivo.trim(),
      );
      if (res.ok) {
        toast.success(
          "Tramo restaurado a la ruta activa. Sus tacómetros quedaron sin capturar: se rellenan con la propagación o en Tacómetros en vivo.",
        );
        setToRestore(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo restaurar el tramo");
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
        {puedeAgregarTramo && (
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
        {ordered.map((escala, idx) => {
          const label = tramoLabel(idx + 1, ordered.length);
          const cancelada = !!escala.cancelada_at;
          // Sin avión propio el tramo HEREDA el del vuelo (regla sagrada,
          // 28-ago): solo "falta" cuando tampoco el vuelo tiene — antes el
          // regreso heredado pintaba "⚠ Falta avión" con el vuelo asignado.
          const avionHeredado =
            !esExterno && !escala.aeronave_id && !!vueloAeronaveId;
          const sinAvion = !esExterno && !escala.aeronave_id && !vueloAeronaveId;
          const vueloMatricula =
            aircraft.find((a) => a.id === vueloAeronaveId)?.matricula ?? null;
          // Sin piloto propio el tramo HEREDA el del vuelo: solo "falta"
          // cuando tampoco el vuelo tiene piloto.
          const pilotoHeredado = !escala.piloto_id && !!vueloPilotoId;
          const sinPiloto = !escala.piloto_id && !vueloPilotoId;
          const sinAsignar = sinAvion || sinPiloto;
          // Copiloto por tramo (29-ago): propio o heredado del vuelo. El API
          // nuevo resuelve copiloto_nombre (efectivo); con el previo se cae
          // al catálogo de pilotos / al nombre del vuelo.
          const copilotoPropio = !!escala.copiloto_id;
          const copilotoEfectivoId =
            escala.copiloto_id ?? escala.copiloto_efectivo_id ?? vueloCopilotoId ?? null;
          const copilotoNombre =
            escala.copiloto_nombre ??
            (copilotoPropio
              ? pilots.find((p) => p.id === escala.copiloto_id)?.nombre ?? null
              : vueloCopilotoNombre ?? null);
          const apoyos = apoyosEfectivosDeTramo(escala, apoyosVuelo);
          // Evidencia de que el tramo voló = LLEGADA real (≠ DEDUCIDO) o
          // fotos. La salida nunca cuenta: la llena el sistema (propagación
          // hereda el origen PILOTO del tramo anterior — caso #74).
          const tieneEvidenciaReal =
            (escala.taco_llegada != null &&
              escala.taco_llegada_origen !== "DEDUCIDO") ||
            !!escala.foto_taco_salida_url ||
            !!escala.foto_taco_llegada_url;
          return (
            <div
              key={escala.id}
              id={`tramo-${escala.id}`}
              className={
                cancelada
                  ? "scroll-mt-24 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3 space-y-2"
                  : "scroll-mt-24 rounded-lg border border-border p-3 space-y-2"
              }
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {label}
                  </Badge>
                  <span
                    className={
                      cancelada
                        ? "font-mono text-sm text-muted-foreground line-through"
                        : "font-mono text-sm"
                    }
                  >
                    {escala.origen_iata} → {escala.destino_iata}
                  </span>
                  {cancelada && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                    >
                      Cancelado · no voló
                    </Badge>
                  )}
                  {/* Detalle operativo capturado (paridad con el cotizador):
                      indicadores discretos para que la oficina vea de un
                      vistazo lo que verá el piloto. */}
                  {escala.es_ferry ? (
                    <Badge variant="outline" className="text-[10px]">
                      Ferry · vacío
                    </Badge>
                  ) : (
                    escala.pasajeros != null && (
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        title={
                          escala.pasajeros_nombres?.length
                            ? escala.pasajeros_nombres.join(", ")
                            : undefined
                        }
                      >
                        {escala.pasajeros} pax
                      </Badge>
                    )
                  )}
                  {escala.requiere_pernocta && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      title="El piloto pernocta tras este tramo."
                    >
                      Pernocta
                    </Badge>
                  )}
                  {escala.tipo_parada === "SERVICIO" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
                      title={escala.servicio_notas ?? "Parada de servicio"}
                    >
                      Servicio
                    </Badge>
                  )}
                  {!cancelada &&
                    !esExterno &&
                    estado === "CONFIRMADO" &&
                    sinAsignar && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30"
                    >
                      ⚠ {sinPiloto ? "Falta piloto" : "Falta avión"}
                    </Badge>
                  )}
                  {!cancelada && escala.estado_permiso === "pendiente" && (
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
                  {!cancelada && saleAntesQueElAnterior(idx) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    >
                      ⚠ Sale antes que el tramo anterior — revisa la fecha
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {cancelada && puedeCancelarTramo && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRestoreMotivo("");
                        setToRestore(escala);
                      }}
                      disabled={restoring}
                      className="h-7 gap-1 text-xs"
                      title="Regresa el tramo a la ruta activa (si al final sí se va a volar)."
                    >
                      <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  )}
                  {/* También en externos: la oficina tramita el permiso de
                      pista aunque vuele otro operador. */}
                  {!cancelada &&
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
                  {!cancelada && canAssign && (
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
                  {!cancelada && puedeCancelarTramo && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <EllipsisHorizontalIcon className="h-4 w-4" />
                        <span className="sr-only">Acciones del tramo</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            // Vuelo cerrado: confirmar antes de abrir el editor.
                            canAssign
                              ? setEditEscala(escala)
                              : setConfirmEdit(escala)
                          }
                          className="gap-2"
                        >
                          <PencilIcon className="h-4 w-4" />
                          Editar tramo (ruta, fecha, notas)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCancelMotivo("");
                            setToCancel(escala);
                          }}
                          disabled={tieneEvidenciaReal}
                          title={
                            tieneEvidenciaReal
                              ? "Tiene llegada o fotos reales de tacómetro: el tramo sí voló. Corrige la ruta con Editar."
                              : undefined
                          }
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <NoSymbolIcon className="h-4 w-4" />
                          Cancelar tramo (no voló)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setToDelete(escala)}
                          disabled={!!(escala.taco_salida || escala.taco_llegada)}
                          title={
                            escala.taco_salida || escala.taco_llegada
                              ? "Tiene tacómetro capturado: no se puede borrar (auditoría). Si el tramo no voló, usa «Cancelar tramo»."
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
              {cancelada && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Cancelado
                  {escala.cancelada_at
                    ? ` el ${fmtDateTime(escala.cancelada_at)}`
                    : ""}
                  {escala.cancelada_motivo
                    ? `: ${escala.cancelada_motivo}`
                    : ""}
                  . No cuenta horas ni pide tacómetro; la cotización no cambia.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1 text-sm">
                <Field label="Aeronave">
                  {esExterno ? (
                    <span className="text-muted-foreground">N/A (externo)</span>
                  ) : escala.aeronave_matricula ? (
                    <span className="font-mono font-semibold">
                      {escala.aeronave_matricula}
                    </span>
                  ) : avionHeredado && vueloMatricula ? (
                    <span
                      className="font-mono text-muted-foreground"
                      title="El tramo no tiene avión propio: hereda el del vuelo."
                    >
                      {vueloMatricula} (del vuelo)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin asignar</span>
                  )}
                </Field>
                <Field label="Piloto">
                  {escala.piloto_nombre ? (
                    <span>{escala.piloto_nombre}</span>
                  ) : pilotoHeredado && vueloPilotoNombre ? (
                    <span
                      className="text-muted-foreground"
                      title="El tramo no tiene piloto propio: hereda el piloto del vuelo."
                    >
                      {vueloPilotoNombre} (del vuelo)
                    </span>
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
                <Field label="Copiloto">
                  {copilotoPropio ? (
                    <span>{copilotoNombre ?? "Copiloto asignado"}</span>
                  ) : copilotoEfectivoId ? (
                    <span
                      className="text-muted-foreground"
                      title="El tramo no tiene copiloto propio: hereda el copiloto del vuelo."
                    >
                      {copilotoNombre ?? "Copiloto"} (del vuelo)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin copiloto</span>
                  )}
                </Field>
                <Field label="Apoyo en tierra" className="sm:col-span-2">
                  {apoyos.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {apoyos.map((a) => (
                        <Badge
                          key={`${a.origen}-${a.id}`}
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            a.origen === "vuelo" && "text-muted-foreground",
                          )}
                          title={
                            a.origen === "vuelo"
                              ? "Apoyo de todo el vuelo (va en todos los tramos)."
                              : "Apoyo solo de este tramo."
                          }
                        >
                          {a.nombre || "Apoyo"}
                          {a.origen === "vuelo" ? " (del vuelo)" : ""}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin apoyo</span>
                  )}
                </Field>
              </div>
            </div>
          );
        })}
        {/* Descubribilidad (caso #166, 18-ago): con el vuelo cubierto por
            externo el botón Asignar se oculta y la oficina no encontraba el
            camino de regreso a avión propio. */}
        {esExterno && (
          <p className="px-1 text-[11px] text-amber-600 dark:text-amber-400">
            Vuelo cubierto por externo: no se asignan aviones propios. Si al
            final sí sale con avión de la casa, usa{" "}
            <span className="font-medium">
              Editar externo → &quot;Regresar a vuelo propio&quot;
            </span>{" "}
            y después asigna avión y piloto.
          </p>
        )}
        <p className="px-1 text-[11px] text-muted-foreground">{TZ_LABEL}</p>
      </CardContent>

      {assignEscala && (
        <EscalaAssignSheet
          open={!!assignEscala}
          onOpenChange={(o) => !o && setAssignEscala(null)}
          flightId={flightId}
          flightFolio={flightFolio}
          esExterno={esExterno}
          tramoLabel={tramoLabel(
            ordered.findIndex((e) => e.id === assignEscala.id) + 1,
            ordered.length,
          )}
          escala={assignEscala}
          aircraft={aircraft}
          pilots={pilots}
          vueloAeronaveId={vueloAeronaveId}
          vueloPilotoId={vueloPilotoId}
          vueloCopilotoId={vueloCopilotoId}
          vueloCopilotoNombre={vueloCopilotoNombre}
          apoyosVuelo={apoyosVuelo}
          apoyoCandidatos={apoyoCandidatos}
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
        estado={estado}
        airports={airports}
      />

      <Dialog
        open={confirmEdit !== null}
        onOpenChange={(o) => !o && setConfirmEdit(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Editar tramo de un vuelo completado?</DialogTitle>
            <DialogDescription>
              {confirmEdit
                ? `${confirmEdit.origen_iata} → ${confirmEdit.destino_iata}. `
                : ""}
              El vuelo ya está COMPLETADO: cambiar ruta, fecha o notas modifica
              datos de un vuelo cerrado (reportes y bitácora lo reflejan).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEdit(null)}>
              Volver
            </Button>
            <Button
              onClick={() => {
                if (confirmEdit) setEditEscala(confirmEdit);
                setConfirmEdit(null);
              }}
            >
              Sí, editar tramo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={toRestore !== null}
        onOpenChange={(o) => !o && setToRestore(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Restaurar este tramo?</DialogTitle>
            <DialogDescription>
              {toRestore
                ? `${toRestore.origen_iata} → ${toRestore.destino_iata}. `
                : ""}
              Vuelve a la ruta activa: cuenta para completitud, pide tacómetro
              y regresa al calendario y a la app del piloto. Sus lecturas
              anuladas al cancelar NO regresan (se recapturan o las ajusta
              oficina). El motivo queda en las notas internas del vuelo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label
              htmlFor="restore-tramo-motivo"
              className="text-sm font-medium"
            >
              Motivo (obligatorio)
            </label>
            <Textarea
              id="restore-tramo-motivo"
              value={restoreMotivo}
              onChange={(e) => setRestoreMotivo(e.target.value)}
              placeholder="Ej. El avión salió del taller y sí voló el regreso."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToRestore(null)}
              disabled={restoring}
            >
              Volver
            </Button>
            <Button
              disabled={restoring || restoreMotivo.trim().length < 3}
              title={
                restoreMotivo.trim().length < 3
                  ? "Escribe el motivo de la restauración"
                  : undefined
              }
              onClick={handleRestore}
            >
              {restoring ? "Restaurando…" : "Restaurar tramo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={toCancel !== null}
        onOpenChange={(o) => !o && setToCancel(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cancelar este tramo?</DialogTitle>
            <DialogDescription>
              {toCancel
                ? `${toCancel.origen_iata} → ${toCancel.destino_iata}. `
                : ""}
              Para tramos que NO se volaron (avión en taller, cambio de plan).
              Se anulan sus lecturas provisionales, deja de contar horas y de
              pedir tacómetro, sale del calendario y en la app del piloto se ve
              cancelado. La cotización al cliente no cambia. Puedes restaurarlo
              después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label
              htmlFor="cancel-tramo-motivo"
              className="text-sm font-medium"
            >
              Motivo (obligatorio)
            </label>
            <Textarea
              id="cancel-tramo-motivo"
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder="Ej. Avión se quedó en taller en MID por falla; el regreso no se voló."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToCancel(null)}
              disabled={canceling}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={canceling || cancelMotivo.trim().length < 3}
              title={
                cancelMotivo.trim().length < 3
                  ? "Escribe el motivo de la cancelación"
                  : undefined
              }
              onClick={() => {
                if (!toCancel) return;
                startCancel(async () => {
                  const res = await cancelEscalaAction(
                    flightId,
                    toCancel.id,
                    cancelMotivo.trim(),
                  );
                  if (res.ok) {
                    toast.success("Tramo cancelado (no voló)");
                    setToCancel(null);
                    router.refresh();
                  } else {
                    toast.error(res.error ?? "No se pudo cancelar el tramo");
                  }
                });
              }}
            >
              {canceling ? "Cancelando…" : "Cancelar tramo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar este tramo?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${toDelete.origen_iata} → ${toDelete.destino_iata}. `
                : ""}
              Borra el tramo por completo (capturado por error). Si el tramo
              existía pero NO se voló, usa mejor «Cancelar tramo»: deja el
              motivo auditado y se puede restaurar. Esta acción no se puede
              deshacer.
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
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
