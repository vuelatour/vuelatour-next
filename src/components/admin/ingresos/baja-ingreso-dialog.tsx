"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { bajaIngresoAction } from "@/app/admin/ingresos/actions";
import { etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { fmtMonto } from "@/lib/format";
import type { Ingreso } from "@/types/ingresos";

const MIN = 5;
const MAX = 500;

/**
 * Dar de baja un ingreso (soft delete CON motivo — acción destructiva, regla
 * permanente del cliente: confirma). Deja de contar en los reportes y queda en
 * la bitácora. El API la rechaza si está conciliado o si es un anticipo ya
 * aplicado (409 con su mensaje).
 */
export function BajaIngresoDialog({
  ingreso,
  open,
  onOpenChange,
  onHecho,
}: {
  ingreso: Ingreso | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHecho?: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();
  const limpio = motivo.trim();
  const valido = limpio.length >= MIN && limpio.length <= MAX;

  const cerrar = (o: boolean) => {
    if (!o) setMotivo("");
    onOpenChange(o);
  };

  const confirmar = () => {
    if (!ingreso || !valido) return;
    start(async () => {
      const r = await bajaIngresoAction(ingreso.id, limpio);
      if (r.ok) {
        toast.success(`${etiquetaIngreso(ingreso.folio)} dado de baja`);
        cerrar(false);
        onHecho?.();
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo dar de baja");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Dar de baja el ingreso {ingreso ? etiquetaIngreso(ingreso.folio) : ""}
          </DialogTitle>
          <DialogDescription>
            {ingreso ? `${ingreso.descripcion} · ${fmtMonto(ingreso.monto, ingreso.moneda)}. ` : ""}
            Escribe el motivo (mínimo 5 caracteres). El ingreso deja de contar en los reportes;
            queda en la bitácora.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="baja-ingreso-motivo" className="text-sm font-medium">
            Motivo
          </Label>
          <Textarea
            id="baja-ingreso-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={MAX}
            placeholder="Ej. Se capturó dos veces; el bueno es ING-14"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            {limpio.length < MIN
              ? `Faltan ${MIN - limpio.length} caracteres.`
              : `${limpio.length}/${MAX}`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={confirmar}
            disabled={!valido || pending}
          >
            {pending ? "Dando de baja…" : "Dar de baja"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
