"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  UserPlusIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  completeFlightAction,
  startFlightAction,
} from "@/app/admin/flights/actions";
import { FlightAssignSheet } from "./flight-assign-sheet";
import { FlightMetaSheet } from "./flight-meta-sheet";
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

interface FlightActionsBarProps {
  flight: FlightListItem;
  aircraft: AircraftOption[];
  pilots: PilotOption[];
}

export function FlightActionsBar({
  flight,
  aircraft,
  pilots,
}: FlightActionsBarProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [starting, startStart] = useTransition();
  const [completing, startComplete] = useTransition();

  const canAssign =
    flight.estado === "CONFIRMADO" || flight.estado === "COTIZADO";
  const canStart = flight.estado === "CONFIRMADO";
  const canComplete = flight.estado === "EN_VUELO";
  const canEditMeta = flight.estado !== "CANCELADO";

  const missingAssignment =
    !flight.es_externo && (!flight.aeronave_id || !flight.piloto_id);

  const handleStart = () => {
    startStart(async () => {
      const res = await startFlightAction(flight.id);
      if (res.ok) {
        toast.success(`Vuelo #${flight.folio} iniciado`);
        setStartOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al iniciar");
      }
    });
  };

  const handleComplete = () => {
    startComplete(async () => {
      const res = await completeFlightAction(flight.id);
      if (res.ok) {
        toast.success(`Vuelo #${flight.folio} completado`);
        setCompleteOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al completar");
      }
    });
  };

  if (!canAssign && !canStart && !canComplete && !canEditMeta) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canEditMeta && (
        <Button
          variant="outline"
          onClick={() => setMetaOpen(true)}
          className="gap-2"
        >
          <PencilSquareIcon className="h-4 w-4" />
          Editar
        </Button>
      )}
      {canAssign && (
        <Button
          variant="outline"
          onClick={() => setAssignOpen(true)}
          className={`gap-2 ${
            missingAssignment ? "border-violet-500/50 text-violet-600 dark:text-violet-400" : ""
          }`}
        >
          <UserPlusIcon className="h-4 w-4" />
          {missingAssignment ? "Asignar" : "Reasignar"}
        </Button>
      )}
      {canStart && (
        <Button
          onClick={() => setStartOpen(true)}
          disabled={missingAssignment}
          className="gap-2 bg-violet-600 hover:bg-violet-600/90"
          title={
            missingAssignment
              ? "Asigna avión y piloto antes de iniciar"
              : undefined
          }
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          Iniciar vuelo
        </Button>
      )}
      {canComplete && (
        <Button
          onClick={() => setCompleteOpen(true)}
          className="gap-2 bg-green-600 hover:bg-green-600/90"
        >
          <FlagIcon className="h-4 w-4" />
          Cerrar vuelo
        </Button>
      )}

      <FlightAssignSheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        flight={flight}
        aircraft={aircraft}
        pilots={pilots}
      />

      <FlightMetaSheet
        open={metaOpen}
        onOpenChange={setMetaOpen}
        flight={flight}
        pilots={pilots}
      />

      <AlertDialog open={startOpen} onOpenChange={setStartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PaperAirplaneIcon className="h-5 w-5 text-violet-600" />
              ¿Iniciar vuelo #{flight.folio}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El vuelo pasa a estado <strong>EN_VUELO</strong>. El piloto podrá
              capturar tacómetros por escala. Asegúrate de que ya hizo el check
              pre-vuelo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={starting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleStart();
              }}
              disabled={starting}
              className="bg-violet-600 text-white hover:bg-violet-600/90"
            >
              {starting ? "Iniciando…" : "Iniciar vuelo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              ¿Cerrar vuelo #{flight.folio}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Marca el vuelo como <strong>COMPLETADO</strong>. Después solo se
              podrán registrar cobros y emitir factura. Confirma que el piloto
              capturó todos los tacómetros antes de cerrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleComplete();
              }}
              disabled={completing}
              className="bg-green-600 text-white hover:bg-green-600/90"
            >
              {completing ? "Cerrando…" : "Cerrar vuelo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
