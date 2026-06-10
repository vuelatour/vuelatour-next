"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowsRightLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  deleteFlightAction,
  reassignAircraftAction,
} from "@/app/admin/flights/actions";
import type { FlightListItem } from "@/types/flights";

interface AircraftOption {
  id: string;
  matricula: string;
  modelo: string;
}

/**
 * Acciones operativas acordadas en reunión (10 jun):
 * - "Cambiar aeronave": clona el vuelo a otra matrícula (cobros se mueven);
 *   el original queda CANCELADO conservando sus gastos (esa matrícula los
 *   absorbe y su siguiente vuelo solo paga el remanente).
 * - "Eliminar": borra solicitudes fantasma sin actividad (sin cobros, gastos
 *   ni tacómetros) para no llenar el calendario; con actividad → cancelar.
 */
export function FlightDangerActions({
  flight,
  aircraft,
}: {
  flight: FlightListItem;
  aircraft: AircraftOption[];
}) {
  const router = useRouter();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nuevaAeronave, setNuevaAeronave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  const operable =
    flight.estado !== "CANCELADO" && flight.estado !== "COMPLETADO";
  const borrable =
    operable &&
    flight.estado !== "EN_VUELO" &&
    !flight.cobrado &&
    !flight.facturado;

  if (!operable) return null;

  const handleReassign = () => {
    if (!nuevaAeronave) {
      toast.error("Selecciona la nueva aeronave");
      return;
    }
    startTransition(async () => {
      const res = await reassignAircraftAction(flight.id, {
        aeronave_id: nuevaAeronave,
        motivo: motivo.trim() || undefined,
      });
      if (res.ok && res.data) {
        toast.success(
          `Vuelo reasignado · nuevo vuelo #${res.data.folio} (el #${flight.folio} queda cancelado con sus gastos)`,
        );
        setReassignOpen(false);
        router.push(`/admin/flights/${res.data.id}`);
      } else {
        toast.error(res.error ?? "No se pudo reasignar la aeronave");
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

  return (
    <>
      {flight.aeronave_id && (
        <Button
          variant="outline"
          onClick={() => setReassignOpen(true)}
          className="gap-2"
          title="Cambio de aeronave de último minuto: clona el vuelo a otra matrícula; este queda cancelado con sus gastos."
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          Cambiar aeronave
        </Button>
      )}
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

      {/* Cambiar aeronave */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar aeronave (último minuto)</DialogTitle>
            <DialogDescription>
              Se crea un vuelo nuevo con la otra matrícula heredando cotización,
              fechas, tramos y piloto; los cobros del cliente se mueven al nuevo.
              El vuelo #{flight.folio} queda <strong>cancelado</strong>{" "}
              conservando sus gastos (factura de operación, combustible…): esa
              matrícula los absorbe y su siguiente vuelo solo paga el remanente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
              onClick={() => setReassignOpen(false)}
              disabled={pending}
            >
              Volver
            </Button>
            <Button onClick={handleReassign} disabled={pending || !nuevaAeronave}>
              {pending ? "Reasignando…" : "Reasignar aeronave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  );
}
