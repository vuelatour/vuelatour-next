"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/datetime";
import {
  BanknotesIcon,
  DocumentArrowDownIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { ImagePreview } from "@/components/admin/image-preview";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { deleteCobroAction } from "@/app/admin/flights/actions";
import { CobroFormSheet } from "./cobro-form-sheet";
import { ReembolsoButton } from "./reembolso-dialog";
import {
  CobroConciliadoBadge,
  CobroSobreNota,
  esParteDeSobre,
} from "./cobro-sobre-nota";
import { fmtUsd } from "@/lib/format";
import { rutaReciboDeCobro } from "@/lib/admin/pdf-urls";
import type { FlightCobro } from "@/types/flights";
import type { EstadoCobroSemaforo } from "@/lib/admin/cobros";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { ParticipacionAvionesNota } from "@/components/admin/flights/participacion-aviones-nota";
import type {
  EstadoVuelo,
  ParticipacionAvion,
  ParticipacionFuente,
} from "@/types/quotes-persisted";

/**
 * COBRO del vuelo: UNA sola card (11-sep-2026). Antes había dos que decían
 * lo mismo — «Cobro» (monto total / cobrado / pendiente / estado) y «Cobros
 * registrados» (la lista) —: el operador leía dos veces los mismos números y
 * el pendiente podía parecer distinto al de arriba. Ahora la cabecera lleva
 * el resumen (fuente única: `total_cobrado` del snapshot = cobrosEnUsd, y
 * `pendienteCobro`/`estadoCobroSemaforo` los calcula la página) y debajo va
 * la lista con el MÉTODO REAL de cada cobro.
 */
interface CobrosCardProps {
  flightId: string;
  flightFolio: number;
  flightEstado: EstadoVuelo;
  montoTotalUsd: number;
  pendingUsd: number;
  /** Cobrado en USD (fuente única `total_cobrado` = cobrosEnUsd). */
  cobradoUsd: number;
  /** Centavos de la conversión MXN→USD que cuentan como pagados. */
  redondeoUsd?: number;
  /** Semáforo de cobro (fuente única `estadoCobroSemaforo`, en la página). */
  estadoCobro?: EstadoCobroSemaforo;
  /** ¿El vuelo ya tiene CFDI? Pinta «Facturado» / «Sin factura». */
  facturado?: boolean;
  /** Vuelo MULTI-AVIÓN: reparto de la venta del avión (lo calcula el API). */
  participacionAviones?: ParticipacionAvion[] | null;
  participacionFuente?: ParticipacionFuente | null;
  /**
   * `vuelo.metodo_cobro`: SIEMPRE la intención pactada al cotizar (define el
   * IVA del desglose v1.3); el API nunca la reescribe. El método real de
   * cada pago es el de su cobro (`cobro.metodo_cobro`), abajo.
   */
  metodoPrevisto?: string | null;
  /** Nombre manual cuando el método es OTRO. */
  metodoPrevistoDetalle?: string | null;
  /** ¿El vuelo ya está liquidado? (`vuelo.cobrado`, bandera del API.) */
  liquidado?: boolean;
  /**
   * Cómo se cobró AL FINAL (11-sep-2026): `snapshot.metodo_cobro_final`, que
   * el API DERIVA de los cobros (método del último abono positivo cuando el
   * vuelo quedó liquidado). Solo lectura; null mientras no esté liquidado.
   */
  metodoCobroFinal?: string | null;
  cobros: FlightCobro[];
  voucherUrls?: Record<string, string>;
  /** TC con el que se cotizó (sugerencia al cobrar en MXN). */
  tcCotizacion?: number | null;
  /** TC oficial de referencia del día de la cotización (respaldo si la
   *  cotización no fijó TC). */
  tcOficial?: number | null;
  /** Día (YYYY-MM-DD, Cancún) al que corresponde `tcOficial`. */
  tcOficialFecha?: string | null;
  /** Comisión % sugerida para cobros Paywise (config `paywise_comision_pct`). */
  paywiseComisionPct?: number;
  /** Rol de oficina (ADMIN/COORDINADOR): habilita "Registrar reembolso". */
  puedeReembolsar?: boolean;
}

export function CobrosCard({
  flightId,
  flightFolio,
  flightEstado,
  montoTotalUsd,
  pendingUsd,
  cobradoUsd,
  redondeoUsd = 0,
  estadoCobro,
  facturado = false,
  participacionAviones = null,
  participacionFuente = null,
  metodoPrevisto = null,
  metodoPrevistoDetalle = null,
  metodoCobroFinal = null,
  cobros,
  voucherUrls = {},
  tcCotizacion = null,
  tcOficial = null,
  tcOficialFecha = null,
  paywiseComisionPct,
  puedeReembolsar = false,
}: CobrosCardProps) {
  const router = useRouter();
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
            <CardTitle className="text-sm flex items-center gap-2">
              <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
              Cobro
            </CardTitle>
            <CardDescription className="text-xs">
              {/* Sin repetir los montos del resumen (esa duplicación era lo
                  que confundía con dos cards): solo el contexto. */}
              {cancelado
                ? cobros.length === 0
                  ? "Vuelo cancelado · sin cobros retenidos."
                  : "Vuelo cancelado: lo cobrado queda retenido (no hay saldo por cobrar)."
                : cobros.length === 0
                  ? "Sin cobros todavía."
                  : `${cobros.length} ${cobros.length === 1 ? "cobro registrado" : "cobros registrados"}.`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {/* Reembolso: solo oficina y solo cuando ya hay cobros de los
                cuales devolver. */}
            {puedeReembolsar && cobros.length > 0 && (
              <ReembolsoButton flightId={flightId} flightFolio={flightFolio} />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              className="gap-1.5 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {cancelado ? "Registrar cargo por cancelación" : "Registrar cobro"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* RESUMEN (fuente única del dinero: el snapshot del API). Vivía en
              una card «Cobro» aparte que repetía estos mismos números. */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
            <Dato label={cancelado ? "Cotizado" : "Monto total"}>
              <span className="font-mono font-semibold">{fmtUsd(montoTotalUsd)}</span>
            </Dato>
            <Dato label="Cobrado">
              <span className="font-mono">{fmtUsd(cobradoUsd)}</span>
            </Dato>
            <Dato label="Pendiente">
              {cancelado ? (
                <span
                  className="font-mono text-muted-foreground"
                  title="Vuelo cancelado: no hay saldo por cobrar; lo cobrado queda retenido."
                >
                  —
                </span>
              ) : (
                <span
                  className={`font-mono ${
                    pendingUsd > 0 ? "text-destructive font-semibold" : "text-muted-foreground"
                  }`}
                  title={
                    redondeoUsd > 0
                      ? `Diferencia de redondeo de ${fmtUsd(redondeoUsd)} USD por la conversión MXN→USD: cuenta como pagado.`
                      : undefined
                  }
                >
                  {fmtUsd(pendingUsd)}
                  {redondeoUsd > 0 && (
                    <span className="ml-1 text-[10px] font-sans text-muted-foreground">
                      (redondeo {fmtUsd(redondeoUsd)})
                    </span>
                  )}
                </span>
              )}
            </Dato>
            <Dato label="Estado">
              <span className="flex flex-wrap items-center gap-1">
                {/* Misma fuente única que las listas: un cancelado con cobros
                    pinta "Con cobros" (gris), nunca "Por cobrar". */}
                {estadoCobro && <CobroEstadoBadge estado={estadoCobro} />}
                {facturado ? (
                  <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 text-[10px]">
                    Facturado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Sin factura
                  </Badge>
                )}
              </span>
            </Dato>
          </div>
          <ParticipacionAvionesNota
            aviones={participacionAviones}
            fuente={participacionFuente}
          />
          {/* El método del VUELO no es el de ningún cobro: es la INTENCIÓN
              pactada al cotizar (decide el IVA) y el API nunca la reescribe.
              «Cómo se cobró al final» lo DERIVA el API de los cobros
              (`metodo_cobro_final`) y se pinta aparte cuando el vuelo ya
              quedó liquidado. El método real de cada pago va en su renglón. */}
          {metodoPrevisto && (
            <p
              className="text-[11px] text-muted-foreground"
              title="Lo que se pactó en la cotización (decide el IVA). El método REAL es el de cada cobro registrado."
            >
              Previsto en la cotización: {metodoPagoLabel(metodoPrevisto, metodoPrevistoDetalle)}
            </p>
          )}
          {metodoCobroFinal && (
            <p
              className="text-[11px] text-muted-foreground"
              title="Método del cobro que dejó el vuelo liquidado (lo deriva el sistema de los cobros registrados). El IVA cotizado no cambia por esto."
            >
              Liquidado con: {metodoPagoLabel(metodoCobroFinal)}
              {metodoPrevisto && metodoCobroFinal !== metodoPrevisto && (
                <span className="ml-1 text-amber-600 dark:text-amber-400">
                  (distinto al previsto)
                </span>
              )}
            </p>
          )}
          {cobros.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <p className="text-sm font-medium">
                {cancelado ? "Sin cobros retenidos" : "Sin cobros registrados"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Registra aquí el anticipo o la liquidación del cliente:
                transferencia, HSBC link, Paywise, cheque, BillPocket, efectivo
                o dólares.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cobros.map((c) => {
                // Reembolso = cobro NEGATIVO (derivado del signo): en rojo y
                // con badge — RESTA del cobrado del vuelo.
                const esReembolso = Number(c.monto) < 0;
                return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    esReembolso
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="text-sm min-w-0">
                    <p
                      className={`font-mono font-semibold ${
                        esReembolso ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {fmtUsd(c.monto)} {c.moneda}
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
                      {c.moneda === "MXN" && c.tc_usd_mxn && (
                        <span className="text-[10px] text-muted-foreground ml-2 font-normal">
                          (≈ {fmtUsd(Number(c.monto) / Number(c.tc_usd_mxn))} USD)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {metodoPagoLabel(c.metodo_cobro)}
                      {c.cuenta_destino ? ` · → ${c.cuenta_destino}` : ""}
                      {c.referencia ? ` · ${c.referencia}` : ""}
                    </p>
                    {/* Parte de un SOBRE de grupo: se gestiona desde el grupo. */}
                    <CobroSobreNota cobro={c} />
                    {/* Motivo del reembolso (viaja en notas): a la vista. */}
                    {esReembolso && c.notas && (
                      <p
                        className="text-[11px] text-muted-foreground truncate"
                        title={c.notas}
                      >
                        Motivo: {c.notas.split("\n")[0]}
                      </p>
                    )}
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
                    {/* Recibo para el cliente: solo cobros reales (un
                        reembolso no tiene recibo de pago). */}
                    {Number(c.monto) > 0 && (
                      <a
                        href={rutaReciboDeCobro(c)}
                        target="_blank"
                        rel="noopener"
                        className={`${buttonVariants({ variant: "ghost", size: "icon" })} h-7 w-7 text-muted-foreground hover:text-foreground`}
                        title={
                          esParteDeSobre(c)
                            ? "Recibo de pago (PDF) del sobre del grupo — se abre en otra pestaña"
                            : "Recibo de pago (PDF) para el cliente — se abre en otra pestaña"
                        }
                        aria-label="Abrir el recibo de pago (PDF)"
                      >
                        <DocumentArrowDownIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {/* Parte de un sobre de grupo: NO se elimina por vuelo
                        (el API responde 409 COBRO_DE_GRUPO); se hace desde
                        Cobros del grupo, que re-parte el sobre completo. */}
                    {!esParteDeSobre(c) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title={
                          esReembolso
                            ? "Eliminar reembolso (capturado por error)"
                            : "Eliminar cobro (capturado por error)"
                        }
                        onClick={() => setToDelete(c)}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar este cobro?</DialogTitle>
            <DialogDescription>
              {toDelete
                ? `${fmtUsd(toDelete.monto)} ${toDelete.moneda} · ${metodoPagoLabel(toDelete.metodo_cobro)}. `
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
                } else if (res.code === "COBRO_DE_GRUPO") {
                  // Candado del API: la parte de un sobre se elimina desde
                  // el grupo. Mensaje del API + atajo al grupo.
                  const d = res.details as { grupo_id?: string } | undefined;
                  toast.error(res.error ?? "Este cobro es parte de un sobre de grupo.", {
                    action: d?.grupo_id
                      ? {
                          label: "Ir al grupo",
                          onClick: () => router.push(`/admin/quotes/grupo/${d.grupo_id}`),
                        }
                      : undefined,
                  });
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
        tcOficialFecha={tcOficialFecha}
        paywiseComisionPct={paywiseComisionPct}
      />
    </>
  );
}

/** Celda del resumen de cobro (etiqueta arriba, dato abajo). */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
