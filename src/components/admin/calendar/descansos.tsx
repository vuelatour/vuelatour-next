"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoonIcon, TrashIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field } from "@/components/admin/form-field";
import {
  createDescansoAction,
  deleteDescansoAction,
  deleteEventoFlotaAction,
} from "@/app/admin/calendar/actions";

/** Botón "Marcar descanso": rango de días en que un piloto no vuela. */
export function MarkRestButton({
  pilots,
}: {
  pilots: { id: string; nombre: string; es_piloto_externo?: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pilotoId, setPilotoId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [motivo, setMotivo] = useState("");

  const submit = () => {
    if (!pilotoId || !inicio) return toast.error("Elige piloto y fecha de inicio.");
    const fechaFin = fin || inicio; // un solo día si no dan fin
    if (fechaFin < inicio) return toast.error("El fin no puede ser antes del inicio.");
    startTransition(async () => {
      const res = await createDescansoAction({
        piloto_id: pilotoId,
        fecha_inicio: inicio,
        fecha_fin: fechaFin,
        motivo: motivo.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Descanso marcado en el calendario");
        setOpen(false);
        setPilotoId("");
        setInicio("");
        setFin("");
        setMotivo("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al marcar el descanso");
      }
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <MoonIcon className="h-4 w-4" />
        Marcar descanso
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar descanso de piloto</DialogTitle>
            <DialogDescription>
              Los días marcados se pintan en el calendario y avisan si intentas
              asignarle un vuelo al piloto en esas fechas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Piloto" required>
              <SearchableSelect
                options={pilots.map((p) => ({
                  value: p.id,
                  label: p.es_piloto_externo ? `${p.nombre} · externo` : p.nombre,
                }))}
                value={pilotoId}
                onChange={setPilotoId}
                placeholder="Selecciona piloto"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde" required>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </Field>
              <Field label="Hasta" hint="Vacío = un solo día">
                <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
              </Field>
            </div>
            <Field label="Motivo (opcional)">
              <Input
                placeholder="Ej. vacaciones, médico…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Marcando…" : "Marcar descanso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Quitar un descanso desde el calendario (con confirmación). */
export function RemoveDescansoButton({
  descansoId,
  label,
}: {
  descansoId: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteDescansoAction(descansoId);
      if (res.ok) {
        toast.success("Descanso quitado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al quitar el descanso");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        title="Quitar descanso"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        Quitar
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este descanso?</AlertDialogTitle>
            <AlertDialogDescription>
              {label}. Se elimina el rango completo del calendario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Quitar un evento NO-vuelo (lavado, trámite) — mismo patrón que descansos. */
export function RemoveEventoButton({
  eventoId,
  label,
}: {
  eventoId: string;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteEventoFlotaAction(eventoId);
      if (res.ok) {
        toast.success("Evento quitado");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al quitar el evento");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        title="Quitar evento"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        Quitar
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar este evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {label}. Se elimina del calendario (no toca ningún vuelo).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Quitando…" : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
