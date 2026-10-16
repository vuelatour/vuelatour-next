"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsRightLeftIcon,
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
  iniciarYCompletarVueloAction,
  startFlightAction,
  updatePermisoAction,
} from "@/app/admin/flights/actions";
import { esErrorTecnico, MSG_SERVIDOR_NO_RESPONDIO } from "@/lib/admin/errores-tecnicos";
import {
  ACCION_COMPLETAR_VUELO,
  ACCION_INICIAR_Y_COMPLETAR,
  DESCRIPCION_INICIAR_Y_COMPLETAR,
  TOAST_VUELO_COMPLETADO,
  descripcionCompletarConOmision,
  tituloCompletarConOmision,
  tituloIniciarYCompletar,
} from "@/lib/admin/taco-omitido";
import { CombinarVuelosDialog } from "./combinar-vuelos-dialog";
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
  /** Mantenimiento en curso: MARCA ámbar del selector, nunca candado
   *  (11-sep-2026, `lib/admin/aviso-taller.ts`). */
  en_taller?: boolean;
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
  /** Candidatos a APOYO en tierra: todos los usuarios activos (no solo
   *  pilotos). Ausente = se ofrecen los pilotos. */
  apoyoCandidatos?: PilotOption[];
  /** Resumen de gastos ligados (aviso al cancelar el vuelo). */
  gastosResumen?: string | null;
  /** Externo sin desglose de cotización: puede editar método de cobro aquí. */
  metodoCobroEditable?: boolean;
  /** URL FIRMADA de la foto del plan de vuelo (bucket privado); null = sin foto. */
  planVueloUrl?: string | null;  /** Solo ADMIN puede borrar definitivamente un vuelo cancelado. */
  esAdmin?: boolean;
  /**
   * Tacómetro OMITIDO (15-oct-2026, API 0.0.81): `completableConOmision`
   * (@/lib/admin/taco-omitido). Vuelo PROPIO con tramos omitidos y ninguna
   * llegada exigible pendiente: «Completar vuelo» (EN_VUELO) o «Iniciar y
   * completar» (nunca iniciado en la app). El vuelo no se completa solo.
   */
  omision?: { completable: boolean; requiereIniciar: boolean; omitidos: number };
  /**
   * `esRolCompletarVuelo(rol)` (espejo de `@Roles` de start/complete en el
   * API: ADMIN/COORDINADOR/PILOTO). Sin él NO se pintan «Completar vuelo» ni
   * «Iniciar y completar» por omisión: a FACTURACION el API le responde 403
   * «Required role: …» (inglés). Ausente = sin permiso.
   */
  puedeCompletar?: boolean;
}

export function FlightActionsBar({
  flight,
  aircraft,
  pilots,
  apoyoCandidatos,
  gastosResumen,
  metodoCobroEditable,
  planVueloUrl,
  esAdmin = false,
  omision,
  puedeCompletar = false,
}: FlightActionsBarProps) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [externoOpen, setExternoOpen] = useState(false);
  const [combinarOpen, setCombinarOpen] = useState(false);
  const [iniciarCompletarOpen, setIniciarCompletarOpen] = useState(false);
  const [starting, startStart] = useTransition();
  const [completing, startComplete] = useTransition();
  const [iniciandoCompletando, startIniciarCompletar] = useTransition();
  const [permiso, startPermiso] = useTransition();

  // También en vuelos EXTERNOS: la oficina tramita el permiso de pista aunque
  // vuele otro operador. Solo un vuelo CANCELADO deja de pedirlo.
  const permisoPendiente =
    flight.estado !== "CANCELADO" && flight.estado_permiso === "pendiente";

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
  // Vuelo PROPIO cuyas lecturas faltantes están OMITIDAS por la oficina: el
  // estado ya no se deriva solo (no hay llegada que capturar) y la oficina lo
  // completa aquí (15-oct-2026). `complete()` del API valida igual.
  // Solo con permiso de completar: FACTURACION omite, pero start/complete le
  // dan 403 en el API (el botón nunca le funcionaría).
  const completarPorOmision =
    puedeCompletar &&
    !flight.es_externo &&
    flight.estado === "EN_VUELO" &&
    omision?.completable === true;
  const iniciarYCompletar =
    puedeCompletar && !flight.es_externo && omision?.requiereIniciar === true;
  const canComplete =
    (flight.es_externo && flight.estado === "EN_VUELO") || completarPorOmision;
  const canEditMeta = flight.estado !== "CANCELADO";
  // Cubrir con externo (Alejandro): una cotización con avión propio se puede
  // pasar a un operador externo mientras el vuelo no haya cerrado. Sobre un
  // externo, el mismo diálogo edita operador/costo.
  const canCubrirExterno =
    flight.estado !== "CANCELADO" && flight.estado !== "COMPLETADO";
  // Combinar vuelos (estrategia de pernocta): aprovechar el avión de OTRO
  // vuelo que ya duerme en el destino del ferry de ida. Solo vuelos propios
  // que aún no vuelan y no combinados ya (en un combinado solo queda el badge
  // del encabezado). Mismos estados que canAssign.
  const canCombinar =
    !flight.es_externo &&
    !flight.combinado_con_id &&
    (flight.estado === "RESERVA" ||
      flight.estado === "SOLICITUD" ||
      flight.estado === "COTIZADO" ||
      flight.estado === "CONFIRMADO");

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
      // Nunca un `await` desnudo en una transición: un «Failed to find Server
      // Action» tras un deploy (o la red caída) mandaba el detalle al boundary.
      let res: Awaited<ReturnType<typeof completeFlightAction>>;
      try {
        res = await completeFlightAction(flight.id);
      } catch {
        toast.error(MSG_SERVIDOR_NO_RESPONDIO);
        return;
      }
      if (res.ok) {
        toast.success(`Vuelo #${flight.folio} completado`);
        setCompleteOpen(false);
        router.refresh();
      } else {
        toast.error(
          esErrorTecnico(res) ? MSG_SERVIDOR_NO_RESPONDIO : (res.error ?? "Error al completar"),
        );
      }
    });
  };

  const handleIniciarYCompletar = () => {
    startIniciarCompletar(async () => {
      let res: Awaited<ReturnType<typeof iniciarYCompletarVueloAction>>;
      try {
        res = await iniciarYCompletarVueloAction(flight.id);
      } catch {
        toast.error(MSG_SERVIDOR_NO_RESPONDIO);
        return;
      }
      if (res.ok) {
        toast.success(TOAST_VUELO_COMPLETADO(flight.folio));
      } else {
        toast.error(esErrorTecnico(res) ? MSG_SERVIDOR_NO_RESPONDIO : (res.error as string));
      }
      // También en el fallo: si el start pasó, el vuelo ya está EN VUELO.
      setIniciarCompletarOpen(false);
      router.refresh();
    });
  };

  if (
    !canAssign &&
    !canStart &&
    !canComplete &&
    !canEditMeta &&
    !purgable &&
    !iniciarYCompletar
  )
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
          {/* Aquí viven también copiloto y apoyo (feedback 29-ago: "no veo
              dónde añadir apoyo o copiloto" — el botón decía solo Reasignar). */}
          {missingAssignment ? "Asignar tripulación" : "Piloto y tripulación"}
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
          {completarPorOmision ? ACCION_COMPLETAR_VUELO : "Cerrar vuelo"}
        </Button>
      )}
      {iniciarYCompletar && (
        <Button
          onClick={() => setIniciarCompletarOpen(true)}
          disabled={missingAssignment}
          className="gap-2 cursor-pointer bg-green-600 hover:bg-green-600/90"
          title={
            missingAssignment
              ? "Asigna avión y piloto antes de iniciar"
              : DESCRIPCION_INICIAR_Y_COMPLETAR
          }
        >
          <FlagIcon className="h-4 w-4" />
          {ACCION_INICIAR_Y_COMPLETAR}
        </Button>
      )}
      {canCombinar && (
        <Button
          variant="outline"
          onClick={() => setCombinarOpen(true)}
          className="gap-2 border-teal-500/50 text-teal-600 dark:text-teal-400"
          title="Estrategia de pernocta: si el avión de otro vuelo ya duerme en el destino de tu ferry de ida, se cancelan los dos tramos vacíos y este vuelo sale en ese avión. Los precios de ambos clientes no cambian."
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          Combinar vuelos
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
        apoyoCandidatos={apoyoCandidatos}
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
          aircraft={aircraft}
        />
      )}

      {/* Montado solo al abrir: los candidatos se buscan frescos cada vez. */}
      {combinarOpen && (
        <CombinarVuelosDialog
          open={combinarOpen}
          onOpenChange={setCombinarOpen}
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
              {completarPorOmision
                ? tituloCompletarConOmision(flight.folio)
                : `¿Cerrar vuelo #${flight.folio}?`}
            </AlertDialogTitle>
            {completarPorOmision ? (
              <AlertDialogDescription>
                {descripcionCompletarConOmision(omision?.omitidos ?? 0)}
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription>
                Vuelo con operador <strong>externo</strong>: márcalo como{" "}
                <strong>COMPLETADO</strong> para que entre al cierre. Después solo
                se podrán registrar cobros y emitir factura.
              </AlertDialogDescription>
            )}
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
              {completing
                ? "Cerrando…"
                : completarPorOmision
                  ? ACCION_COMPLETAR_VUELO
                  : "Cerrar vuelo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={iniciarCompletarOpen}
        onOpenChange={(v) => !iniciandoCompletando && setIniciarCompletarOpen(v)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              {tituloIniciarYCompletar(flight.folio)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {DESCRIPCION_INICIAR_Y_COMPLETAR}
              {omision && omision.omitidos > 0
                ? ` ${descripcionCompletarConOmision(omision.omitidos)}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={iniciandoCompletando} className="cursor-pointer">
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleIniciarYCompletar();
              }}
              disabled={iniciandoCompletando}
              className="cursor-pointer bg-green-600 text-white hover:bg-green-600/90"
            >
              {iniciandoCompletando ? "Completando…" : ACCION_INICIAR_Y_COMPLETAR}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
