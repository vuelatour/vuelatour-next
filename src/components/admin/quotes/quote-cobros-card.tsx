"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanknotesIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { deleteCobroAction } from "@/app/admin/flights/actions";
import { METODO_LABELS } from "@/components/admin/flights/cobros-card";
import type { FlightCobro } from "@/types/flights";

/**
 * Cobros del vuelo VISIBLES desde la cotización: el desglose a cobrar no
 * cambiaba al registrarse un cobro y parecía que "no pasó nada". Además,
 * mientras exista un cobro la cotización no puede revisarse (cambiaría un
 * total ya cobrado): desde aquí se elimina el cobro (con confirmación) para
 * desbloquear la revisión, o se navega al vuelo.
 */
export function QuoteCobrosCard({
  quoteId,
  montoTotalUsd,
  totalCobrado,
  cobros,
}: {
  quoteId: string;
  montoTotalUsd: number;
  totalCobrado: number;
  cobros: FlightCobro[];
}) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<FlightCobro | null>(null);
  const [deleting, startDelete] = useTransition();

  if (cobros.length === 0) return null;

  const cubierto = totalCobrado >= montoTotalUsd - 0.01;

  return (
    <Card id="cobros-vuelo" className="scroll-mt-24 border-emerald-500/40">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <BanknotesIcon className="h-4 w-4 text-emerald-500" />
            Cobros registrados en el vuelo
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Cobrado {fmtUsd(totalCobrado)} de {fmtUsd(montoTotalUsd)}. Mientras
            exista un cobro, la cotización no puede revisarse (cambiaría un
            total ya cobrado): elimínalo aquí si necesitas ajustarla.
          </CardDescription>
        </div>
        <Badge
          variant="outline"
          className={
            cubierto
              ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
          }
        >
          {cubierto ? "Cobrado" : "Parcial"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {cobros.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-mono font-semibold">
                ${Number(c.monto).toLocaleString("en-US")} {c.moneda}
              </p>
              <p className="text-xs text-muted-foreground">
                {METODO_LABELS[c.metodo_cobro] ?? c.metodo_cobro} ·{" "}
                {fmtDate(c.fecha_cobro)}
                {c.comision_banco_monto != null &&
                  Number(c.comision_banco_monto) > 0 && (
                    <> · comisión banco ${Number(c.comision_banco_monto).toLocaleString("en-US")}</>
                  )}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setToDelete(c)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
              title="Eliminar cobro (para poder revisar la cotización)"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          El detalle completo (vouchers, comisiones) vive en{" "}
          <Link
            href={`/admin/flights/${quoteId}#cobros`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            el vuelo → Cobros
          </Link>
          .
        </p>
      </CardContent>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar este cobro?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `$${Number(toDelete.monto).toLocaleString("en-US")} ${toDelete.moneda} · ${
                    METODO_LABELS[toDelete.metodo_cobro] ?? toDelete.metodo_cobro
                  }. `
                : ""}
              El vuelo volverá a quedar pendiente de cobro y la cotización se
              podrá revisar. Esta acción no se puede deshacer.
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
                  const res = await deleteCobroAction(quoteId, toDelete.id);
                  if (res.ok) {
                    toast.success(
                      "Cobro eliminado; la cotización ya puede revisarse.",
                    );
                    setToDelete(null);
                    router.refresh();
                  } else {
                    toast.error(res.error ?? "No se pudo eliminar el cobro");
                  }
                });
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
