"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  NoSymbolIcon,
  TrashIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  assignFlightAction,
  cancelFlightAction,
  deleteFlightAction,
  purgeFlightAction,
  reassignAircraftAction,
} from "@/app/admin/flights/actions";
import { SquawkAltaDialog, squawkAltaDe } from "./squawk-alta-dialog";
import type { FlightListItem } from "@/types/flights";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

/** Paso del diálogo "Cambiar aeronave": elegir el tipo de cambio primero. */
type PasoCambio = "elegir" | "simple" | "ultimo";

/**
 * Acciones operativas acordadas en reunión (10 jun):
 * - "Cambiar aeronave" (2 caminos desde sep-2026):
 *   · Cambio simple: solo se actualiza la matrícula del MISMO vuelo (todos
 *     los tramos); cotización, cobros y gastos no se mueven.
 *   · Último minuto: clona el vuelo a otra matrícula (cobros se mueven);
 *     el original queda CANCELADO conservando sus gastos (esa matrícula los
 *     absorbe y su siguiente vuelo solo paga el remanente).
 * - "Eliminar": borra solicitudes fantasma sin actividad (sin cobros, gastos
 *   ni tacómetros) para no llenar el calendario; con actividad → cancelar.
 */
export function FlightDangerActions({
  flight,
  aircraft,
  gastosResumen,
  esAdmin = false,
}: {
  flight: FlightListItem;
  aircraft: AircraftOption[];
  /** Resumen de gastos ligados (para el aviso al cancelar), ej. "2 gastos · $8,911.28 MXN". */
  gastosResumen?: string | null;
  /** Solo el ADMIN puede borrar DEFINITIVAMENTE un vuelo cancelado. */
  esAdmin?: boolean;
}) {
  const router = useRouter();
  const [reassignOpen, setReassignOpen] = useState(false);
  // Sin preselección: el usuario elige consciente entre los dos caminos.
  const [pasoCambio, setPasoCambio] = useState<PasoCambio>("elegir");
  // Candado de squawk ALTA pendiente de confirmar (y a qué camino reintentar).
  const [squawk, setSquawk] = useState<{
    lista: string[];
    accion: "simple" | "ultimo";
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [nuevaAeronave, setNuevaAeronave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoCancel, setMotivoCancel] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [motivoPurge, setMotivoPurge] = useState("");
  const [confirmaFolio, setConfirmaFolio] = useState("");
  const [pending, startTransition] = useTransition();

  const operable =
    flight.estado !== "CANCELADO" && flight.estado !== "COMPLETADO";
  const borrable =
    operable &&
    flight.estado !== "EN_VUELO" &&
    !flight.cobrado &&
    !flight.facturado;
  // Borrado DEFINITIVO (26-ago): solo ADMIN y solo vuelos CANCELADOS.
  // El API además exige: sin cobros, sin gastos ligados, sin factura.
  const purgable = esAdmin && flight.estado === "CANCELADO";

  if (!operable && !purgable) return null;

  const abrirCambio = () => {
    setPasoCambio("elegir");
    setNuevaAeronave("");
    setMotivo("");
    setSquawk(null);
    setReassignOpen(true);
  };

  const matriculaDe = (id: string) =>
    aircraft.find((a) => a.id === id)?.matricula ?? "la nueva matrícula";

  /** Camino A: SOLO cambiar el avión del MISMO vuelo (asignación nivel vuelo). */
  const handleCambioSimple = (aceptarSquawk = false) => {
    if (!nuevaAeronave) {
      toast.error("Selecciona la nueva aeronave");
      return;
    }
    startTransition(async () => {
      const res = await assignFlightAction(flight.id, {
        aeronave_id: nuevaAeronave,
        ...(aceptarSquawk ? { aceptar_discrepancia_alta: true } : {}),
      });
      if (res.ok) {
        toast.success(
          aceptarSquawk
            ? `Vuelo #${flight.folio}: ahora vuela ${matriculaDe(nuevaAeronave)} — se avisó al mecánico de las discrepancias abiertas`
            : `Vuelo #${flight.folio}: ahora vuela ${matriculaDe(nuevaAeronave)} (cotización, cobros y gastos quedan igual)`,
        );
        setSquawk(null);
        setReassignOpen(false);
        router.refresh();
      } else {
        const lista = aceptarSquawk ? null : squawkAltaDe(res);
        if (lista) {
          setSquawk({ lista, accion: "simple" });
          return;
        }
        setSquawk(null);
        toast.error(res.error ?? "No se pudo cambiar el avión");
      }
    });
  };

  /** Camino B: cambio de ÚLTIMO minuto (clona el vuelo y cancela el original). */
  const handleReassign = (aceptarSquawk = false) => {
    if (!nuevaAeronave) {
      toast.error("Selecciona la nueva aeronave");
      return;
    }
    startTransition(async () => {
      const res = await reassignAircraftAction(flight.id, {
        aeronave_id: nuevaAeronave,
        motivo: motivo.trim() || undefined,
        ...(aceptarSquawk ? { aceptar_discrepancia_alta: true } : {}),
      });
      if (res.ok && res.data) {
        toast.success(
          aceptarSquawk
            ? `Vuelo reasignado · nuevo vuelo #${res.data.folio} (el #${flight.folio} queda cancelado con sus gastos) — se avisó al mecánico de las discrepancias abiertas`
            : `Vuelo reasignado · nuevo vuelo #${res.data.folio} (el #${flight.folio} queda cancelado con sus gastos)`,
        );
        setSquawk(null);
        setReassignOpen(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        const lista = aceptarSquawk ? null : squawkAltaDe(res);
        if (lista) {
          setSquawk({ lista, accion: "ultimo" });
          return;
        }
        setSquawk(null);
        toast.error(res.error ?? "No se pudo reasignar la aeronave");
      }
    });
  };

  const handlePurge = () => {
    startTransition(async () => {
      const res = await purgeFlightAction(flight.id, motivoPurge.trim());
      if (res.ok) {
        toast.success(
          `Vuelo #${flight.folio} eliminado definitivamente de la base`,
        );
        router.push("/admin/flights");
      } else {
        toast.error(res.error ?? "No se pudo eliminar el vuelo");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteFlightAction(flight.id);
      if (res.ok) {
        toast.success(`Vuelo #${flight.folio} eliminado`);
        setDeleteOpen(false);
        router.push("/admin/flights");
      } else {
        toast.error(res.error ?? "No se pudo eliminar");
      }
    });
  };

  const handleCancel = () => {
    if (!motivoCancel.trim()) {
      toast.error("Escribe el motivo de la cancelación");
      return;
    }
    startTransition(async () => {
      const res = await cancelFlightAction(flight.id, motivoCancel.trim());
      if (res.ok) {
        toast.success(`Vuelo #${flight.folio} cancelado (sus gastos se conservan)`);
        setCancelOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cancelar");
      }
    });
  };

  return (
    <>
      {operable && (
        <>
      {/* Solo vuelos PROPIOS con avión: en un externo el avión es referencia
          (se cambia en «Editar externo»). */}
      {!flight.es_externo && flight.aeronave_id && (
        <Button
          variant="outline"
          onClick={abrirCambio}
          className="gap-2"
          title="Cambiar el avión del vuelo: cambio simple (mismo vuelo, nada se mueve) o de último minuto (clona el vuelo y este queda cancelado con sus gastos)."
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          Cambiar aeronave
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => setCancelOpen(true)}
        className="gap-2 text-destructive hover:text-destructive"
        title="El vuelo no se hace: queda CANCELADO conservando cobros y gastos registrados."
      >
        <NoSymbolIcon className="h-4 w-4" />
        Cancelar vuelo
      </Button>
      {borrable && (
        <Button
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <TrashIcon className="h-4 w-4" />
          Eliminar
        </Button>
      )}

      {/* Cancelar vuelo */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar el vuelo #{flight.folio}</DialogTitle>
            <DialogDescription>
              El vuelo queda <strong>CANCELADO</strong> (sale del calendario) y
              conserva su historial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              {gastosResumen ? (
                <>
                  Este vuelo tiene <strong>{gastosResumen}</strong>.{" "}
                </>
              ) : null}
              Los gastos ya capturados (operación, combustible…) <strong>se
              conservan y siguen sumando en los reportes</strong> — la operación
              pagada cuenta aunque el vuelo no se haga. Si el proveedor SÍ
              canceló la factura, elimina ese gasto en la sección Gastos.
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Motivo</Label>
              <Textarea
                rows={2}
                placeholder="Ej. el cliente canceló; clima; falla mecánica"
                value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={pending}
            >
              Volver
            </Button>
            <Button
              onClick={handleCancel}
              disabled={pending || !motivoCancel.trim()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Cancelando…" : "Cancelar vuelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambiar aeronave: PRIMERO se elige el tipo de cambio (2 cards, sin
          preselección) y solo después aparece el formulario del camino. */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-md">
          {pasoCambio === "elegir" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  ¿Cómo cambiar el avión del vuelo #{flight.folio}?
                </DialogTitle>
                <DialogDescription>
                  Depende de si la matrícula actual ya generó gastos de este
                  vuelo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setPasoCambio("simple")}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowPathIcon className="h-4 w-4 shrink-0 text-primary" />
                    Solo cambiar el avión
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    El vuelo queda igual: cotización, cobros y gastos no se
                    mueven. Solo se actualiza la matrícula (en todos los
                    tramos) y se avisa a la tripulación.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPasoCambio("ultimo")}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-destructive/50 hover:bg-accent"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowsRightLeftIcon className="h-4 w-4 shrink-0 text-destructive" />
                    Cambio de último minuto
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    La matrícula actual ya gastó en este vuelo (operación,
                    combustible…). Se crea un vuelo NUEVO que hereda
                    cotización, tramos y piloto; el #{flight.folio} queda
                    cancelado conservando sus gastos.
                  </span>
                </button>
                {gastosResumen && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    Este vuelo ya tiene <strong>{gastosResumen}</strong>. Si
                    esos gastos los generó la matrícula actual, usa «Cambio de
                    último minuto» para que se queden con ella.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setReassignOpen(false)}
                  disabled={pending}
                >
                  Volver
                </Button>
              </DialogFooter>
            </>
          )}

          {pasoCambio === "simple" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Solo cambiar el avión · vuelo #{flight.folio}
                </DialogTitle>
                <DialogDescription>
                  El vuelo queda igual: cotización, cobros y gastos no se
                  mueven. La nueva matrícula se aplica a todos los tramos y la
                  tripulación recibe el aviso del cambio.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nueva aeronave</Label>
                <SearchableSelect
                  options={aircraft
                    .filter((a) => a.id !== flight.aeronave_id)
                    .map((a) => ({
                      value: a.id,
                      label: `${a.matricula} — ${a.modelo}`,
                    }))}
                  value={nuevaAeronave}
                  onChange={setNuevaAeronave}
                  placeholder="Selecciona la matrícula que sí vuela"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPasoCambio("elegir")}
                  disabled={pending}
                >
                  Volver
                </Button>
                <Button
                  onClick={() => handleCambioSimple()}
                  disabled={pending || !nuevaAeronave}
                >
                  {pending ? "Cambiando…" : "Cambiar el avión"}
                </Button>
              </DialogFooter>
            </>
          )}

          {pasoCambio === "ultimo" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Cambio de último minuto · vuelo #{flight.folio}
                </DialogTitle>
                <DialogDescription>
                  Se crea un vuelo nuevo con la otra matrícula heredando
                  cotización, fechas, tramos y piloto; los cobros del cliente
                  se mueven al nuevo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  El vuelo #{flight.folio} queda <strong>CANCELADO</strong>{" "}
                  conservando sus gastos
                  {gastosResumen ? (
                    <>
                      {" "}
                      (<strong>{gastosResumen}</strong>)
                    </>
                  ) : (
                    " (factura de operación, combustible…)"
                  )}
                  : esa matrícula los absorbe y su siguiente vuelo solo paga el
                  remanente.
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Nueva aeronave</Label>
                  <SearchableSelect
                    options={aircraft
                      .filter((a) => a.id !== flight.aeronave_id)
                      .map((a) => ({
                        value: a.id,
                        label: `${a.matricula} — ${a.modelo}`,
                      }))}
                    value={nuevaAeronave}
                    onChange={setNuevaAeronave}
                    placeholder="Selecciona la matrícula que sí vuela"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Motivo (opcional)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Ej. falla en el arranque; se usa el Séneca"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPasoCambio("elegir")}
                  disabled={pending}
                >
                  Volver
                </Button>
                <Button
                  onClick={() => handleReassign()}
                  disabled={pending || !nuevaAeronave}
                >
                  {pending ? "Reasignando…" : "Reasignar aeronave"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Candado de squawk ALTA: confirmar para asignar de todas formas
          (reintento con la bandera; el API avisa al mecánico). */}
      <SquawkAltaDialog
        lista={squawk?.lista ?? null}
        pending={pending}
        onCancel={() => setSquawk(null)}
        onConfirm={() =>
          squawk?.accion === "simple"
            ? handleCambioSimple(true)
            : handleReassign(true)
        }
      />

      {/* Eliminar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el vuelo #{flight.folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              Para solicitudes que nunca se confirmaron (sin cobros, sin gastos,
              sin tacómetros): se borra por completo, junto con su cotización e
              historial, y desaparece del calendario. Si el vuelo tiene
              actividad registrada, el sistema lo rechazará — en ese caso usa
              Cancelar para conservar el rastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {purgable && (
        <>
          <Button
            variant="outline"
            onClick={() => setPurgeOpen(true)}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Borra el vuelo cancelado DE LA BASE DE DATOS. No se puede deshacer."
          >
            <TrashIcon className="h-4 w-4" />
            Borrar de la base de datos
          </Button>
          <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Borrar DEFINITIVAMENTE el vuelo #{flight.folio}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se elimina de la base de datos junto con sus tramos, fotos
                  de tacómetro, plan de vuelo y eventos de calendario.{" "}
                  <b>No se puede deshacer</b> — solo queda una huella de
                  auditoría (quién, cuándo y por qué).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="text-sm text-muted-foreground">
                Solo se permite si el vuelo NO tiene cobros, gastos ligados ni
                factura (el sistema lo verifica).
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Motivo del borrado</Label>
                  <Textarea
                    value={motivoPurge}
                    onChange={(e) => setMotivoPurge(e.target.value)}
                    placeholder="Ej. registro de prueba duplicado"
                    rows={2}
                    maxLength={500}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Escribe el folio{" "}
                    <span className="font-mono">{flight.folio}</span> para
                    confirmar
                  </Label>
                  <Input
                    value={confirmaFolio}
                    onChange={(e) => setConfirmaFolio(e.target.value)}
                    placeholder={String(flight.folio ?? "")}
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>
                  Conservar el vuelo
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePurge}
                  disabled={
                    pending ||
                    motivoPurge.trim().length < 5 ||
                    confirmaFolio.trim() !== String(flight.folio ?? "")
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {pending ? "Borrando…" : "Borrar de la base de datos"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
