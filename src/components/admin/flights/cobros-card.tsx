"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/datetime";
import { PlusIcon } from "@heroicons/react/24/outline";
import { ImagePreview } from "@/components/admin/image-preview";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CobroFormSheet } from "./cobro-form-sheet";
import { fmtUsd } from "@/lib/format";
import type { FlightCobro } from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const METODO_LABELS: Record<string, string> = {
  TRANSFERENCIA: "Transferencia",
  HSBC_LINK: "HSBC link",
  BILLPOCKET: "BillPocket",
  EFECTIVO: "Efectivo",
  DOLARES: "Dólares",
};

interface CobrosCardProps {
  flightId: string;
  flightFolio: number;
  flightEstado: EstadoVuelo;
  montoTotalUsd: number;
  pendingUsd: number;
  cobros: FlightCobro[];
  voucherUrls?: Record<string, string>;
}

export function CobrosCard({
  flightId,
  flightFolio,
  flightEstado,
  montoTotalUsd,
  pendingUsd,
  cobros,
  voucherUrls = {},
}: CobrosCardProps) {
  const [open, setOpen] = useState(false);

  const canRegister = flightEstado !== "CANCELADO";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-sm">Cobros registrados</CardTitle>
            <CardDescription className="text-xs">
              {cobros.length === 0
                ? "Sin cobros todavía."
                : `${cobros.length} ${cobros.length === 1 ? "cobro" : "cobros"}.`}{" "}
              {pendingUsd > 0 ? (
                <span className="text-destructive">
                  Pendiente {fmtUsd(pendingUsd)} USD
                </span>
              ) : (
                <span className="text-green-600 dark:text-green-400">
                  Totalmente cobrado
                </span>
              )}
            </CardDescription>
          </div>
          {canRegister && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              className="gap-1.5 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Registrar cobro
            </Button>
          )}
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
                      {c.referencia ? ` · ${c.referencia}` : ""}
                    </p>
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
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <CobroFormSheet
        open={open}
        onOpenChange={setOpen}
        flightId={flightId}
        flightFolio={flightFolio}
        montoTotalUsd={montoTotalUsd}
        pendingUsd={pendingUsd}
      />
    </>
  );
}
