"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  XCircleIcon,
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelGrupoAction,
  confirmGrupoAction,
  fechaGrupoAction,
} from "@/app/admin/quotes/grupo/actions";
import { toastAvisos } from "@/lib/admin/avisos";
import { mensajeErrorGrupo } from "@/lib/admin/grupos-ui";
import { cancunInputToIso, fmtDateTime, isoToCancunInput, TZ_LABEL } from "@/lib/datetime";
import type { GrupoDetalle } from "@/types/grupos";

/**
 * Acciones de cabecera del grupo: PDF (proxy /api/grupos/:id/pdf), Revisar
 * (edición EN EL LUGAR de la página única, 5-sep-2026: `onRevisar`; sin él
 * abre `?revisar=1`), Confirmar (confirma TODOS los hijos vivos), Cambiar
 * fecha (cada hijo conserva su desfase escalonado) y Cancelar grupo
 * (N × cancel). Toda acción destructiva/irreversible confirma antes; los
 * 409 estructurados del API se traducen con `mensajeErrorGrupo`. Mientras
 * se edita, las acciones que cambian el grupo se deshabilitan (un solo
 * editor a la vez).
 */
export function GrupoHeaderActions({
  grupo,
  puedeEditar,
  onRevisar,
  editando = false,
}: {
  grupo: GrupoDetalle;
  /** ADMIN / COORDINADOR: escrituras. Otros roles solo ven el PDF. */
  puedeEditar: boolean;
  /** Entra a edición en el lugar (sin navegar). */
  onRevisar?: () => void;
  /** La página está en edición: Revisar se esconde y el resto se bloquea. */
  editando?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [openFecha, setOpenFecha] = useState(false);
  const [fecha, setFecha] = useState(() => isoToCancunInput(grupo.fecha_vuelo));
  const [openCancel, setOpenCancel] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");

  const folio = grupo.folio_texto;
  const vivos = grupo.aviones.filter((a) => !a.cancelado);
  const terminal = grupo.estado === "CANCELADO" || grupo.estado === "COMPLETADO";
  const canRevise = puedeEditar && !terminal && !editando;
  const canConfirm =
    puedeEditar &&
    (grupo.estado === "RESERVA" ||
      grupo.estado === "COTIZADO" ||
      grupo.estado === "CONFIRMADO_PARCIAL");
  const canFecha = puedeEditar && !terminal;
  const canCancel = puedeEditar && !terminal;
  const congelados = vivos.filter((a) => a.congelado);
  const tituloEditando = "Termina o cancela la revisión para usar esta acción.";
  const tituloRevisar =
    congelados.length > 0
      ? `Hay ${congelados.length} avión(es) con precio congelado (cobrado/facturado): la revisión puede aplicarse solo a los editables.`
      : "Cambiar aviones, pasajeros, ruta, cargos o los toggles del PDF aquí mismo (genera una versión nueva).";

  /** Avisos NUEVOS de la acción (los ya visibles en la página no se repiten). */
  const avisosNuevos = (data: GrupoDetalle) => {
    const previos = new Set(grupo.avisos ?? []);
    return (data.avisos ?? []).filter((a) => !previos.has(a));
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      // Proxy autenticado por cookie de sesión (sin token en el cliente).
      const res = await fetch(`/api/grupos/${grupo.id}/pdf`, { method: "POST" });
      if (!res.ok) {
        let msg = "No se pudo generar el PDF del grupo";
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) msg = body.message;
        } catch {
          // sin JSON: mensaje genérico
        }
        toast.error(msg);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("No se pudo generar el PDF del grupo");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await confirmGrupoAction(grupo.id);
      if (res.ok) {
        toast.success(`Grupo ${folio} confirmado · ${vivos.length} ${vivos.length === 1 ? "avión" : "aviones"}`);
        toastAvisos(avisosNuevos(res.data));
        setOpenConfirm(false);
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  const handleFecha = () => {
    const iso = fecha ? cancunInputToIso(fecha) : "";
    if (!iso) {
      toast.error("Captura la nueva fecha y hora de salida");
      return;
    }
    startTransition(async () => {
      const res = await fechaGrupoAction(grupo.id, iso);
      if (res.ok) {
        toast.success(
          `Grupo ${folio} reagendado al ${fmtDateTime(res.data.fecha_vuelo)} — se avisó a la tripulación`,
        );
        toastAvisos(avisosNuevos(res.data));
        setOpenFecha(false);
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  const handleCancel = () => {
    if (motivoCancel.trim().length < 3) {
      toast.error("Escribe el motivo de la cancelación (mínimo 3 caracteres)");
      return;
    }
    startTransition(async () => {
      const res = await cancelGrupoAction(grupo.id, motivoCancel.trim());
      if (res.ok) {
        toast.success(`Grupo ${folio} cancelado (sus ${vivos.length} vuelos quedan cancelados)`);
        toastAvisos(avisosNuevos(res.data));
        setOpenCancel(false);
        setMotivoCancel("");
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" onClick={handlePdf} disabled={pdfLoading} className="gap-2">
        <ArrowDownTrayIcon className="h-4 w-4" />
        {pdfLoading ? "Generando…" : "PDF"}
      </Button>
      {canRevise &&
        (onRevisar ? (
          <Button variant="outline" onClick={onRevisar} className="gap-2" title={tituloRevisar}>
            <PencilSquareIcon className="h-4 w-4" />
            Revisar
          </Button>
        ) : (
          <Link
            href={`/admin/quotes/grupo/${grupo.id}?revisar=1`}
            className={buttonVariants({ variant: "outline" })}
            title={tituloRevisar}
          >
            <PencilSquareIcon className="h-4 w-4" />
            Revisar
          </Link>
        ))}
      {canFecha && (
        <Button
          variant="outline"
          onClick={() => {
            setFecha(isoToCancunInput(grupo.fecha_vuelo));
            setOpenFecha(true);
          }}
          disabled={editando}
          className="gap-2"
          title={
            editando
              ? tituloEditando
              : "Reagenda TODOS los aviones del grupo conservando el escalonamiento entre ellos."
          }
        >
          <CalendarDaysIcon className="h-4 w-4" />
          Cambiar fecha
        </Button>
      )}
      {canConfirm && (
        <Button
          onClick={() => setOpenConfirm(true)}
          disabled={pending || editando}
          title={editando ? tituloEditando : undefined}
          className="gap-2 bg-brand-600 hover:bg-brand-600/90"
        >
          <CheckCircleIcon className="h-4 w-4" />
          Confirmar grupo
        </Button>
      )}
      {canCancel && (
        <Button
          variant="outline"
          onClick={() => setOpenCancel(true)}
          disabled={pending || editando}
          title={editando ? tituloEditando : undefined}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <XCircleIcon className="h-4 w-4" />
          Cancelar grupo
        </Button>
      )}

      {/* Confirmar: promueve RESERVA → COTIZADO y confirma cada hijo. */}
      <AlertDialog open={openConfirm} onOpenChange={setOpenConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar el grupo {folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se confirman los {vivos.length} {vivos.length === 1 ? "vuelo" : "vuelos"} del
              grupo (
              {vivos.map((a) => `#${a.folio}`).join(", ")}
              ) y entran a la agenda con su avión y piloto. Los que ya estaban
              confirmados no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={pending}
              className="bg-brand-600 text-white hover:bg-brand-600/90"
            >
              {pending ? "Confirmando…" : "Confirmar grupo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cambiar fecha: datetime-local en hora Cancún (cancunInputToIso). */}
      <Dialog open={openFecha} onOpenChange={setOpenFecha}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar la fecha del grupo {folio}</DialogTitle>
            <DialogDescription>
              Todos los aviones se reagendan a la nueva salida conservando los
              minutos de diferencia entre ellos (escalonamiento). La
              tripulación recibe el aviso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nueva salida del grupo</Label>
            <Input
              type="datetime-local"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {TZ_LABEL}. Salida actual: {fmtDateTime(grupo.fecha_vuelo)}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenFecha(false)} disabled={pending}>
              Volver
            </Button>
            <Button onClick={handleFecha} disabled={pending || !fecha}>
              {pending ? "Reagendando…" : "Reagendar grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar grupo: N × cancel de hijos + cabecera. Confirmación con motivo. */}
      <AlertDialog open={openCancel} onOpenChange={setOpenCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar el grupo {folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              Los {vivos.length} {vivos.length === 1 ? "vuelo" : "vuelos"} del grupo pasan a
              CANCELADO y salen del calendario; cobros y gastos ya registrados
              se conservan. No se puede deshacer desde el panel. Si algún avión
              ya voló, cancela solo los que no salieron desde su menú.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Motivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {["Cliente canceló", "Clima", "Sin confirmación del cliente"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivoCancel(m)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    motivoCancel === m
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <Textarea
              rows={3}
              placeholder="Ej. el cliente reagendó el tour para otra temporada"
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={pending || motivoCancel.trim().length < 3}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? "Cancelando…" : "Cancelar grupo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
