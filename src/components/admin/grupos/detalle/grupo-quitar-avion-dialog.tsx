"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { quitarAvionAction } from "@/app/admin/quotes/grupo/actions";
import { toastAvisos } from "@/lib/admin/avisos";
import { mensajeErrorGrupo } from "@/lib/admin/grupos-ui";
import type { AvionGrupoDetalle, GrupoDetalle } from "@/types/grupos";

/**
 * Quitar un avión del grupo: cancela ese vuelo hijo y, si hay cargos
 * repartidos (PROPORCIONAL/ANCLA) o ajuste del grupo, el API re-reparte en
 * los aviones restantes. Destructivo → confirmación con motivo.
 */
export function GrupoQuitarAvionDialog({
  grupo,
  avion,
  onClose,
}: {
  grupo: GrupoDetalle;
  /** null = cerrado. */
  avion: AvionGrupoDetalle | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");

  const restantes = grupo.aviones.filter(
    (a) => !a.cancelado && a.vuelo_id !== avion?.vuelo_id,
  ).length;

  const handle = () => {
    if (!avion) return;
    startTransition(async () => {
      const res = await quitarAvionAction(grupo.id, avion.vuelo_id, motivo.trim() || undefined);
      if (res.ok) {
        toast.success(
          `Avión ${avion.posicion ?? ""} (#${avion.folio}) quitado del grupo ${grupo.folio_texto}`,
        );
        const previos = new Set(grupo.avisos ?? []);
        toastAvisos((res.data.avisos ?? []).filter((a) => !previos.has(a)));
        setMotivo("");
        onClose();
        router.refresh();
      } else {
        toast.error(mensajeErrorGrupo(res.error));
      }
    });
  };

  return (
    <AlertDialog open={avion !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Quitar el avión {avion?.posicion ?? ""}
            {avion?.aeronave ? ` (${avion.aeronave.matricula})` : ""} del grupo?
          </AlertDialogTitle>
          <AlertDialogDescription>
            El vuelo #{avion?.folio} queda CANCELADO y sale del calendario; sus
            cobros y gastos se conservan. Los cargos del grupo repartidos por
            pasajeros se vuelven a repartir entre los {restantes}{" "}
            {restantes === 1 ? "avión restante" : "aviones restantes"}. Si los
            pasajeros de este avión siguen viajando, acomódalos con «Revisar».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Motivo (opcional)</Label>
          <Textarea
            rows={2}
            placeholder="Ej. el cliente redujo el grupo a 39 personas"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handle();
            }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending ? "Quitando…" : "Quitar del grupo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
