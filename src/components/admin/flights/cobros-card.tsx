"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/datetime";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ImagePreview } from "@/components/admin/image-preview";
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
import { toast } from "sonner";
import { deleteCobroAction } from "@/app/admin/flights/actions";
import { CobroFormSheet } from "./cobro-form-sheet";
import { fmtUsd } from "@/lib/format";
import type { FlightCobro } from "@/types/flights";
import { TOLERANCIA_COBRO_USD } from "@/lib/admin/cobros";
import type { EstadoVuelo } from "@/types/quotes-persisted";

export const METODO_LABELS: Record<string, string> = {
  TRANSFERENCIA: "Transferencia",
  HSBC_LINK: "HSBC link",
  CHEQUE: "Cheque",
  BILLPOCKET: "BillPocket",
  EFECTIVO: "Efectivo",
  DOLARES: "Dólares",
  OTRO: "Otro",
};

interface CobrosCardProps {
  flightId: string;
  flightFolio: number;
  flightEstado: EstadoVuelo;
  montoTotalUsd: number;
  pendingUsd: number;
  /** Cobrado en USD (fuente única `total_cobrado` = cobrosEnUsd). */
  cobradoUsd: number;
  cobros: FlightCobro[];
  voucherUrls?: Record<string, string>;
  /** TC con el que se cotizó (sugerencia al cobrar en MXN). */
  tcCotizacion?: number | null;
  /** TC oficial de referencia del día (respaldo si la cotización no fijó TC). */
  tcOficial?: number | null;
}

export function CobrosCard({
  flightId,
  flightFolio,
  flightEstado,
  montoTotalUsd,
  pendingUsd,
  cobradoUsd,
  cobros,
  voucherUrls = {},
  tcCotizacion = null,
  tcOficial = null,
}: CobrosCardProps) {
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FlightCobro | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Regla del cliente (28-ago): un vuelo CANCELADO puede tener dinero real —
  // anticipo retenido o cargo por cancelación que NO se reembolsa — y entra
  // íntegro al balance del avión. La oficina sí registra cobros aquí (el API
  // solo se lo bloquea al piloto); lo que no existe es un "pendiente".
  const cancelado = flightEstado === "CANCELADO";

  return (
    <>
      <Card id="cobros" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-sm">Cobros registrados</CardTitle>
            <CardDescription className="text-xs">
              {cancelado ? (
                cobros.length === 0 ? (
                  "Vuelo cancelado · sin cobros retenidos."
                ) : (
                  <span className="text-foreground">
                    Cobros retenidos: {cobros.length} ·{" "}
                    <span className="font-mono">{fmtUsd(cobradoUsd)} USD</span>
                  </span>
                )
              ) : (
                <>
              {cobros.length === 0
                ? "Sin cobros todavía."
                : `${cobros.length} ${cobros.length === 1 ? "cobro" : "cobros"}.`}{" "}
              {pendingUsd > TOLERANCIA_COBRO_USD ? (
                <span className="text-destructive">
                  Pendiente {fmtUsd(pendingUsd)} USD
                </span>
              ) : (
                <span className="text-green-600 dark:text-green-400">
                  Totalmente cobrado
                  {pendingUsd > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      (diferencia de redondeo {fmtUsd(pendingUsd)} USD por la
                      conversión de pesos)
                    </span>
                  )}
                </span>
              )}
                </>
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="gap-1.5 shrink-0"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {cancelado ? "Registrar cargo por cancelación" : "Registrar cobro"}
          </Button>
        </CardHeader>
        {cobros.length > 0 && (
          <CardContent>
            <div className="space-y-2">
              {cobros.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="text-sm min-w-0">
                    <p className="font-mono font-semibold">
                      {fmtUsd(c.monto)} {c.moneda}
                      {c.moneda === "MXN" && c.tc_usd_mxn && (
                        <span className="text-[10px] text-muted-foreground ml-2 font-normal">
                          (≈ {fmtUsd(Number(c.monto) / Number(c.tc_usd_mxn))} USD)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {METODO_LABELS[c.metodo_cobro] ?? c.metodo_cobro}
                      {c.cuenta_destino ? ` · → ${c.cuenta_destino}` : ""}
                      {c.referencia ? ` · ${c.referencia}` : ""}
                    </p>
                    {Number(c.comision_banco_monto) > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Comisión banco {Number(c.comision_banco_pct ?? 0)}% −
                        {fmtUsd(Number(c.comision_banco_monto))} {c.moneda} · neto al
                        banco {fmtUsd(Number(c.monto) - Number(c.comision_banco_monto))}{" "}
                        {c.moneda}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.foto_voucher_url && voucherUrls[c.foto_voucher_url] && (
                      <ImagePreview
                        src={voucherUrls[c.foto_voucher_url]}
                        alt="Voucher de cobro"
                        thumbClassName="h-9 w-9 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
                      />
                    )}
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {fmtDate(c.fecha_cobro)}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Eliminar cobro (capturado por error)"
                      onClick={() => setToDelete(c)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar este cobro?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${fmtUsd(toDelete.monto)} ${toDelete.moneda} · ${METODO_LABELS[toDelete.metodo_cobro] ?? toDelete.metodo_cobro}. `
                : ""}
              Úsalo solo para capturas erróneas: el saldo del vuelo se recalcula
              al instante y esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!toDelete) return;
                setDeleting(true);
                const res = await deleteCobroAction(flightId, toDelete.id);
                setDeleting(false);
                if (res.ok) {
                  toast.success("Cobro eliminado; saldo recalculado.");
                  setToDelete(null);
                } else {
                  toast.error(res.error);
                }
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CobroFormSheet
        open={open}
        onOpenChange={setOpen}
        flightId={flightId}
        flightFolio={flightFolio}
        montoTotalUsd={montoTotalUsd}
        pendingUsd={pendingUsd}
        cancelado={cancelado}
        tcCotizacion={tcCotizacion}
        tcOficial={tcOficial}
      />
    </>
  );
}
