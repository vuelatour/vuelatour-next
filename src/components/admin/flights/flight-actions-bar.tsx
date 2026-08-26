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
  updatePermisoAction,
} from "@/app/admin/flights/actions";
import { CubrirExternoDialog } from "./cubrir-externo-dialog";
import { FlightAssignSheet } from "./flight-assign-sheet";
import { FlightDangerActions } from "./flight-danger-actions";
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
  email: string | null;
}

interface FlightActionsBarProps {
  flight: FlightListItem;
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  /** Resumen de gastos ligados (aviso al cancelar el vuelo). */
  gastosResumen?: string | null;
  /** Externo sin desglose de cotización: puede editar método de cobro aquí. */
  metodoCobroEditable?: boolean;
  /** URL FIRMADA de la foto del plan de vuelo (bucket privado); null = sin foto. */
  planVueloUrl?: string | null;  /** Solo ADMIN puede borrar definitivamente un vuelo cancelado. */
  esAdmin?: boolean;
}

export function FlightActionsBar({
  flight,
  aircraft,
  pilots,
  gastosResumen,
  metodoCobroEditable,
  planVueloUrl,
  esAdmin = false,
}: FlightActionsBarProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [externoOpen, setExternoOpen] = useState(false);
  const [starting, startStart] = useTransition();
  const [completing, startComplete] = useTransition();
  const [permiso, startPermiso] = useTransition();

  const permisoPendiente = !flight.es_externo && flight.estado_permiso === "pendiente";

  const handlePermisoEmitido = () => {
    startPermiso(async () => {
      const res = await updatePermisoAction(flight.id, "emitido");
      if (res.ok) {
        toast.success("Permiso de pista marcado como emitido");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo actualizar el permiso");
      }
    });
  };

  // Operación independiente de lo administrativo: asignar e iniciar no exigen
  // cotización confirmada.
  const canAssign =
    flight.estado === "RESERVA" ||
    flight.estado === "SOLICITUD" ||
    flight.estado === "COTIZADO" ||
    flight.estado === "CONFIRMADO";
  // Iniciar/Cerrar a mano SOLO para vuelos EXTERNOS: no tienen tacómetros, así
  // que su estado no puede derivarse. Los vuelos propios ya NO se inician ni
  // cierran a mano — el estado se deriva de la captura de tacómetros (primera
  // lectura → EN_VUELO; todas las llegadas → COMPLETADO).
  const canStart =
    flight.es_externo &&
    (flight.estado === "RESERVA" ||
      flight.estado === "COTIZADO" ||
      flight.estado === "CONFIRMADO");
  const canComplete = flight.es_externo && flight.estado === "EN_VUELO";
  const canEditMeta = flight.estado !== "CANCELADO";
  // Cubrir con externo (Alejandro): una cotización con avión propio se puede
  // pasar a un operador externo mientras el vuelo no haya cerrado. Sobre un
  // externo, el mismo diálogo edita operador/costo.
  const canCubrirExterno =
    flight.estado !== "CANCELADO" && flight.estado !== "COMPLETADO";

  // Borrado DEFINITIVO (ADMIN + CANCELADO): vive en FlightDangerActions,
  // pero el early-return del bar debe conocerlo — sin esto, en un vuelo
  // CANCELADO todas las banderas quedan false y el bar entero devolvía null,
  // escondiendo el botón de purga del expediente (mismo bug que ya se corrigió
  // DENTRO de FlightDangerActions, un nivel arriba).
  const purgable = esAdmin && flight.estado === "CANCELADO";

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

  if (!canAssign && !canStart && !canComplete && !canEditMeta && !purgable)
    return null;

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
      {permisoPendiente && (
        <Button
          variant="outline"
          onClick={handlePermisoEmitido}
          disabled={permiso}
          className="gap-2 border-amber-500/50 text-amber-600 dark:text-amber-400"
          title="El permiso de pista/operación que requiere un aeropuerto de la ruta ya se tramitó. Márcalo como emitido para quitar la alerta."
        >
          <FlagIcon className="h-4 w-4" />
          {permiso ? "Guardando…" : "Permiso emitido"}
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
      {canCubrirExterno && (
        <Button
          variant="outline"
          onClick={() => setExternoOpen(true)}
          className="gap-2 border-amber-500/50 text-amber-600 dark:text-amber-400"
          title={
            flight.es_externo
              ? "Editar quién cubre el vuelo y cuánto nos cobra"
              : "Pasar este vuelo a un operador externo: suelta avión, piloto y tacómetros sin tocar la cotización del cliente"
          }
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          {flight.es_externo ? "Editar externo" : "Cubrir con externo"}
        </Button>
      )}

      <FlightDangerActions
        flight={flight}
        aircraft={aircraft}
        gastosResumen={gastosResumen}
        esAdmin={esAdmin}
      />

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
        metodoCobroEditable={metodoCobroEditable}
        planVueloUrl={planVueloUrl}
      />

      {externoOpen && (
        <CubrirExternoDialog
          open={externoOpen}
          onOpenChange={setExternoOpen}
          flight={flight}
        />
      )}

      <AlertDialog open={startOpen} onOpenChange={setStartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PaperAirplaneIcon className="h-5 w-5 text-violet-600" />
              ¿Iniciar vuelo #{flight.folio}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vuelo con operador <strong>externo</strong> (sin tacómetros en la
              app): su estado se marca a mano. Pasa a <strong>EN_VUELO</strong>.
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
              Vuelo con operador <strong>externo</strong>: márcalo como{" "}
              <strong>COMPLETADO</strong> para que entre al cierre. Después solo
              se podrán registrar cobros y emitir factura.
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
