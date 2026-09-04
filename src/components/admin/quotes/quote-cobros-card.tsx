"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BanknotesIcon,
  DocumentArrowDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
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
import { descargarDelApi } from "@/lib/download";
import { deleteCobroAction } from "@/app/admin/flights/actions";
import { METODO_LABELS } from "@/components/admin/flights/cobros-card";
import { ReembolsoButton } from "@/components/admin/flights/reembolso-dialog";
import {
  CobroConciliadoBadge,
  CobroSobreNota,
  esParteDeSobre,
} from "@/components/admin/flights/cobro-sobre-nota";
import { folioTexto } from "@/lib/admin/grupos-ui";
import type { FlightCobro } from "@/types/flights";
import { TOLERANCIA_COBRO_USD } from "@/lib/admin/cobros";

/**
 * Cobros del vuelo VISIBLES desde la cotización: el desglose a cobrar no
 * cambiaba al registrarse un cobro y parecía que "no pasó nada". Además,
 * mientras exista un cobro la cotización no puede revisarse (cambiaría un
 * total ya cobrado): desde aquí se elimina el cobro (con confirmación) para
 * desbloquear la revisión, o se navega al vuelo.
 */
export function QuoteCobrosCard({
  quoteId,
  quoteFolio = null,
  montoTotalUsd,
  totalCobrado,
  cobros,
  puedeReembolsar = false,
}: {
  quoteId: string;
  /** Folio del vuelo (encabezado del diálogo de reembolso). */
  quoteFolio?: number | null;
  montoTotalUsd: number;
  totalCobrado: number;
  cobros: FlightCobro[];
  /** Rol de oficina (ADMIN/COORDINADOR): habilita "Registrar reembolso". */
  puedeReembolsar?: boolean;
}) {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<FlightCobro | null>(null);
  const [deleting, startDelete] = useTransition();
  // Id del cobro cuyo recibo se está generando (carga por fila).
  const [reciboDe, setReciboDe] = useState<string | null>(null);

  const descargarRecibo = async (c: FlightCobro) => {
    setReciboDe(c.id);
    // Parte de un SOBRE de grupo: el recibo del cliente es el del sobre
    // completo (REC-G), no el de la parte (el cliente pagó un solo monto).
    const sobre = c.cobro_grupo;
    const fol = quoteFolio != null ? String(quoteFolio) : quoteId.slice(0, 8);
    const err = sobre
      ? await descargarDelApi(`/v1/grupos/cobros/${sobre.id}/recibo.pdf`, {
          filename: `recibo-${folioTexto(sobre.grupo_folio)}-${sobre.id.slice(0, 8)}.pdf`,
        })
      : await descargarDelApi(`/v1/flights/cobros/${c.id}/recibo.pdf`, {
          filename: `recibo-${fol}-${c.id.slice(0, 8)}.pdf`,
        });
    if (err) toast.error("No se pudo generar el recibo", { description: err });
    setReciboDe(null);
  };

  if (cobros.length === 0) return null;

  // Misma tolerancia que el API (1 USD): los centavos de la conversión
  // MXN→USD no cuentan como deuda.
  const cubierto = totalCobrado >= montoTotalUsd - TOLERANCIA_COBRO_USD;
  // ¿Hay partes de un sobre de grupo? Esas no se eliminan desde aquí.
  const haySobre = cobros.some(esParteDeSobre);

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
            {haySobre && (
              <>
                {" "}
                Los cobros que son parte de un sobre de grupo se eliminan o
                re-parten desde el grupo (Cobros del grupo).
              </>
            )}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          {/* Reembolso: solo oficina (la card ya implica cobros > 0). */}
          {puedeReembolsar && (
            <ReembolsoButton flightId={quoteId} flightFolio={quoteFolio} />
          )}
          <Badge
            variant="outline"
            className={
              cubierto
                ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
            }
          >
            {/* El neto puede quedar en 0 tras un reembolso: no es "parcial". */}
            {cubierto ? "Cobrado" : totalCobrado > 0 ? "Parcial" : "Reembolsado"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {cobros.map((c) => {
          // Reembolso = cobro NEGATIVO (derivado del signo): en rojo, con
          // badge — RESTA del cobrado del vuelo.
          const esReembolso = Number(c.monto) < 0;
          return (
          <div
            key={c.id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              esReembolso ? "border-red-500/40 bg-red-500/5" : "border-border"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-sm font-mono font-semibold ${
                  esReembolso ? "text-red-600 dark:text-red-400" : ""
                }`}
              >
                ${Number(c.monto).toLocaleString("en-US")} {c.moneda}
                {esReembolso && (
                  <Badge
                    variant="outline"
                    className="ml-2 border-red-500/50 text-red-600 dark:text-red-400 font-sans font-medium"
                    title="Devolución al cliente: resta del cobrado del vuelo"
                  >
                    Reembolso
                  </Badge>
                )}
                {/* Conciliado con el banco: SOLO si el API lo dice. */}
                <CobroConciliadoBadge cobro={c} />
              </p>
              <p className="text-xs text-muted-foreground">
                {METODO_LABELS[c.metodo_cobro] ?? c.metodo_cobro}
                {c.cuenta_destino ? ` · → ${c.cuenta_destino}` : ""} ·{" "}
                {fmtDate(c.fecha_cobro)}
                {c.comision_banco_monto != null &&
                  Number(c.comision_banco_monto) > 0 && (
                    <> · comisión banco ${Number(c.comision_banco_monto).toLocaleString("en-US")}</>
                  )}
              </p>
              {/* Parte de un SOBRE de grupo: se gestiona desde el grupo. */}
              <CobroSobreNota cobro={c} />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Recibo para el cliente: solo cobros reales (un reembolso no
                  tiene recibo de pago). */}
              {Number(c.monto) > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={
                    esParteDeSobre(c)
                      ? "Recibo de pago (PDF) del sobre del grupo"
                      : "Recibo de pago (PDF) para el cliente"
                  }
                  disabled={reciboDe === c.id}
                  onClick={() => descargarRecibo(c)}
                >
                  <DocumentArrowDownIcon
                    className={`h-4 w-4 ${
                      reciboDe === c.id ? "animate-pulse" : ""
                    }`}
                  />
                </Button>
              )}
              {/* Parte de un sobre de grupo: NO se elimina por vuelo (el
                  API responde 409 COBRO_DE_GRUPO); se hace desde el grupo. */}
              {!esParteDeSobre(c) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setToDelete(c)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  title="Eliminar cobro (para poder revisar la cotización)"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          );
        })}
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
                  } else if (res.code === "COBRO_DE_GRUPO") {
                    // Candado del API: la parte de un sobre se elimina desde
                    // el grupo. Mensaje del API + atajo al grupo.
                    const d = res.details as { grupo_id?: string } | undefined;
                    toast.error(
                      res.error ?? "Este cobro es parte de un sobre de grupo.",
                      {
                        action: d?.grupo_id
                          ? {
                              label: "Ir al grupo",
                              onClick: () =>
                                router.push(`/admin/quotes/grupo/${d.grupo_id}`),
                            }
                          : undefined,
                      },
                    );
                    setToDelete(null);
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
